import crypto from 'node:crypto';
import { getLinkedInConfig, getTelegramConfig } from '../../../src/config/env.js';
import {
  exchangeCodeForToken,
  fetchOidcDiscovery,
  fetchUserInfo,
  validateIdToken,
  verifySignedState
} from '../../../src/lib/linkedin/oidc.js';
import { pickLinkedInIdentityClaims } from '../../../src/lib/linkedin/profile.js';
import { persistLinkedInIdentity } from '../../../src/lib/storage/linkedinIdentityStore.js';
import { sendTelegramMessage } from '../../../src/lib/telegram/botApi.js';

function escapeHtml(input) {
  return String(input)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderHtml({ title, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 40px auto; max-width: 720px; padding: 0 16px; line-height: 1.5; }
      .card { border: 1px solid #e5e7eb; border-radius: 16px; padding: 20px; }
      code { background: #f3f4f6; padding: 2px 6px; border-radius: 6px; }
      .meta { color: #6b7280; font-size: 14px; }
      .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 20px; }
      .button { display: inline-block; text-decoration: none; border-radius: 10px; padding: 12px 16px; font-weight: 600; }
      .button-primary { background: #111827; color: #ffffff; }
      .button-secondary { background: #f3f4f6; color: #111827; }
    </style>
  </head>
  <body>
    <div class="card">
      ${body}
    </div>
  </body>
</html>`;
}

function describeError(error) {
  if (!error) {
    return { name: 'UnknownError', message: 'Unknown error' };
  }

  const summary = {
    name: error.name || 'Error',
    message: error.message || String(error)
  };

  if (error.code) {
    summary.code = error.code;
  }
  if (error.status) {
    summary.status = error.status;
  }
  if (error.cause?.message) {
    summary.cause = error.cause.message;
  }

  return summary;
}

function base64UrlJson(input) {
  return Buffer.from(JSON.stringify(input), 'utf8').toString('base64url');
}

function parseBase64UrlJson(token) {
  return JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
}

function createSignature(payloadToken, secret) {
  return crypto.createHmac('sha256', secret).update(payloadToken).digest('base64url');
}

function buildSignedTransferToken({ payload, secret, ttlSeconds = 600 }) {
  const now = Math.floor(Date.now() / 1000);
  const tokenPayload = {
    ...payload,
    kind: 'linkedin_transfer',
    iat: now,
    exp: now + ttlSeconds,
    nonce: crypto.randomBytes(12).toString('hex')
  };
  const payloadToken = base64UrlJson(tokenPayload);
  const signature = createSignature(payloadToken, secret);
  return `${payloadToken}.${signature}`;
}

function verifySignedTransferToken(token, secret) {
  if (!token || !token.includes('.')) {
    throw new Error('Missing or malformed transfer token');
  }

  const [payloadToken, signature] = token.split('.', 2);
  const expectedSignature = createSignature(payloadToken, secret);
  const provided = Buffer.from(signature, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw new Error('Invalid transfer token signature');
  }

  const payload = parseBase64UrlJson(payloadToken);
  const now = Math.floor(Date.now() / 1000);
  if (payload.kind !== 'linkedin_transfer') {
    throw new Error('Invalid transfer token kind');
  }
  if (!payload.exp || payload.exp < now) {
    throw new Error('Expired transfer token');
  }

  return payload;
}

function buildTransferConfirmationBody({ transferUrl, identity, previousTelegramUsername }) {
  const currentName = escapeHtml(identity?.name || 'this LinkedIn account');
  const previousOwner = previousTelegramUsername ? `@${escapeHtml(previousTelegramUsername)}` : 'another Telegram account';
  return `
    <h1>Move LinkedIn connection?</h1>
    <p><strong>${currentName}</strong> is already connected to ${previousOwner}.</p>
    <p>You can move this LinkedIn connection here. The previous Telegram account will be disconnected, and any public listing on that account will be hidden.</p>
    <div class="actions">
      <a class="button button-primary" href="${escapeHtml(transferUrl)}">Move connection here</a>
      <a class="button button-secondary" href="/privacy/">Cancel</a>
    </div>
    <p class="meta">Only one Telegram account can hold the same LinkedIn identity at a time.</p>
  `;
}


function buildIdentityDetailLines(identity) {
  const lines = [];

  if (identity?.name) {
    lines.push(`• Name: ${identity.name}`);
  }
  if (identity?.givenName) {
    lines.push(`• Given name: ${identity.givenName}`);
  }
  if (identity?.familyName) {
    lines.push(`• Family name: ${identity.familyName}`);
  }
  if (identity?.pictureUrl) {
    lines.push('• Photo: imported');
  }
  if (identity?.locale) {
    lines.push(`• Locale: ${identity.locale}`);
  }
  if (identity?.email) {
    lines.push(`• Email: ${identity.email}`);
  }

  return lines;
}

function buildPersistenceDetailLines(persistResult) {
  const lines = ['• Identity binding: saved'];

  if (Array.isArray(persistResult?.identityImportedFields) && persistResult.identityImportedFields.length > 0) {
    lines.push(`• Imported fields: ${persistResult.identityImportedFields.length}`);
  }
  if (persistResult?.profileDraft?.profile_state) {
    lines.push(`• Profile state: ${persistResult.profileDraft.profile_state}`);
  }
  if (persistResult?.profileDraft?.visibility_status) {
    lines.push(`• Visibility: ${persistResult.profileDraft.visibility_status}`);
  }
  if (persistResult?.profileSeed?.displayNameSeeded) {
    lines.push('• Display name: seeded from LinkedIn because your card name was still empty');
  } else {
    lines.push('• Manual card fields: kept as-is');
  }

  return lines;
}

function buildEditableFieldsLines() {
  return [
    '• Headline',
    '• Company',
    '• City',
    '• Industry',
    '• About',
    '• Skills',
    '• Public LinkedIn URL'
  ];
}

function buildTelegramConnectionResultText({ identity, persistResult }) {
  const header = persistResult?.transferred
    ? '✅ LinkedIn connection moved to this Telegram account.'
    : '✅ LinkedIn connected.';

  const nextStepLine = persistResult?.transferred
    ? '• The previous Telegram account was disconnected, and its public listing was hidden.'
    : '• Open the profile editor in Telegram to review and finish your card.';

  return [
    header,
    '',
    '🔗 LinkedIn import',
    ...buildIdentityDetailLines(identity),
    '',
    '💾 Saved in Intro Deck',
    ...buildPersistenceDetailLines(persistResult),
    '',
    '✍️ Still editable in Telegram',
    ...buildEditableFieldsLines(),
    '',
    '➡️ Next',
    nextStepLine
  ].join('\n');
}

function buildPreviousOwnerTransferText() {
  return [
    '⚠️ Your LinkedIn connection was moved to another Telegram account.',
    '',
    'What changed',
    '• This Telegram account no longer holds that LinkedIn identity.',
    '• Your previous public directory listing was hidden on this account.',
    '',
    '➡️ Next',
    '• Return to Home if you want to reconnect a different LinkedIn account.'
  ].join('\n');
}

function buildHtmlList(lines) {
  return `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`;
}

async function notifyTelegramConnectionResult({ statePayload, identity, persistResult }) {
  const { botToken } = getTelegramConfig();

  await sendTelegramMessage({
    botToken,
    chatId: statePayload.telegramUserId,
    text: buildTelegramConnectionResultText({ identity, persistResult }),
    parseMode: null,
    replyMarkup: {
      inline_keyboard: [
        [{ text: '🧩 Complete profile', callback_data: 'p:menu' }],
        [{ text: '🏠 Home', callback_data: 'home:root' }]
      ]
    }
  });
}

async function notifyPreviousOwnerIfTransferred({ persistResult }) {
  if (!persistResult?.transferred || !persistResult?.previousOwner?.telegramUserId) {
    return;
  }

  const { botToken } = getTelegramConfig();
  await sendTelegramMessage({
    botToken,
    chatId: persistResult.previousOwner.telegramUserId,
    text: buildPreviousOwnerTransferText(),
    parseMode: null,
    replyMarkup: {
      inline_keyboard: [
        [{ text: '🏠 Home', callback_data: 'home:root' }]
      ]
    }
  });
}

function renderPersistenceSuccessPage({ identity, persistResult }) {
  const title = persistResult?.transferred ? 'LinkedIn connection moved' : 'LinkedIn connected';
  const importedLines = buildIdentityDetailLines(identity);
  const persistenceLines = buildPersistenceDetailLines(persistResult);
  const editableLines = buildEditableFieldsLines();
  const nextLines = persistResult?.transferred
    ? [
        'The previous Telegram account was disconnected and hidden from the public directory.',
        'You can return to Telegram now.'
      ]
    : ['You can return to Telegram now and review your profile in Telegram.'];

  return renderHtml({
    title,
    body: `
      <h1>${escapeHtml(title)}</h1>
      <h2>LinkedIn import</h2>
      ${buildHtmlList(importedLines.length ? importedLines : ['Basic LinkedIn identity imported'])}
      <h2>Saved in Intro Deck</h2>
      ${buildHtmlList(persistenceLines)}
      <h2>Still editable in Telegram</h2>
      ${buildHtmlList(editableLines)}
      <h2>Next</h2>
      ${buildHtmlList(nextLines)}
    `
  });
}

async function finalizePersistence({ statePayload, identity, rawTokenPayload, rawUserInfo, transferMode }) {
  const persistResult = await persistLinkedInIdentity({
    telegramUserId: statePayload.telegramUserId,
    telegramUsername: statePayload.telegramUsername || null,
    identity,
    rawTokenPayload,
    rawUserInfo,
    transferMode
  });

  return persistResult;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send(renderHtml({
      title: 'Method not allowed',
      body: '<h1>Method not allowed</h1>'
    }));
  }

  const url = new URL(req.url, 'http://localhost');
  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const transferToken = url.searchParams.get('transfer_token');

  if (error) {
    return res.status(400).send(renderHtml({
      title: 'LinkedIn sign-in canceled',
      body: `<h1>LinkedIn sign-in was canceled</h1><p><code>${escapeHtml(error)}</code></p>`
    }));
  }

  let stage = 'config';
  let statePayload = null;

  try {
    const linkedinConfig = getLinkedInConfig();

    if (transferToken) {
      stage = 'verify_transfer_token';
      const transferPayload = verifySignedTransferToken(transferToken, linkedinConfig.stateSecret);
      statePayload = {
        telegramUserId: transferPayload.telegramUserId,
        telegramUsername: transferPayload.telegramUsername || null,
        returnTo: transferPayload.returnTo || '/menu'
      };

      stage = 'confirm_transfer';
      const persistResult = await finalizePersistence({
        statePayload,
        identity: transferPayload.identity,
        rawTokenPayload: null,
        rawUserInfo: null,
        transferMode: 'confirm'
      });

      try {
        stage = 'notify_telegram';
        await notifyTelegramConnectionResult({ statePayload, identity: transferPayload.identity, persistResult });
      } catch (notifyError) {
        console.warn('[linkedin callback] telegram notify skipped', {
          stage: 'notify_telegram',
          telegramUserId: statePayload.telegramUserId,
          error: describeError(notifyError)
        });
      }

      try {
        stage = 'notify_previous_owner';
        await notifyPreviousOwnerIfTransferred({ persistResult });
      } catch (notifyPreviousError) {
        console.warn('[linkedin callback] previous owner notify skipped', {
          stage: 'notify_previous_owner',
          telegramUserId: persistResult?.previousOwner?.telegramUserId || null,
          error: describeError(notifyPreviousError)
        });
      }

      return res.status(200).send(renderPersistenceSuccessPage({
        identity: transferPayload.identity,
        persistResult
      }));
    }

    if (!code || !state) {
      return res.status(400).send(renderHtml({
        title: 'Missing callback parameters',
        body: '<h1>Missing callback parameters</h1><p>Expected both <code>code</code> and <code>state</code>.</p>'
      }));
    }

    stage = 'verify_state';
    statePayload = verifySignedState(state, linkedinConfig.stateSecret);

    stage = 'fetch_discovery';
    const discovery = await fetchOidcDiscovery(linkedinConfig.oidcDiscoveryUrl);

    stage = 'exchange_token';
    const tokenPayload = await exchangeCodeForToken({
      discovery,
      clientId: linkedinConfig.clientId,
      clientSecret: linkedinConfig.clientSecret,
      redirectUri: linkedinConfig.redirectUri,
      code
    });

    let idTokenClaims = {};
    if (tokenPayload.id_token) {
      stage = 'validate_id_token';
      idTokenClaims = await validateIdToken({
        idToken: tokenPayload.id_token,
        discovery,
        clientId: linkedinConfig.clientId
      });
    }

    let userInfo = {};
    if (tokenPayload.access_token) {
      stage = 'fetch_userinfo';
      userInfo = await fetchUserInfo({
        discovery,
        accessToken: tokenPayload.access_token
      });
    }

    stage = 'extract_identity';
    const identity = pickLinkedInIdentityClaims({ idTokenClaims, userInfo });

    stage = 'persist_identity';
    const persistResult = await finalizePersistence({
      statePayload,
      identity,
      rawTokenPayload: tokenPayload,
      rawUserInfo: userInfo,
      transferMode: 'detect'
    });

    if (persistResult?.transferRequired) {
      stage = 'render_transfer_confirm';
      const token = buildSignedTransferToken({
        secret: linkedinConfig.stateSecret,
        payload: {
          telegramUserId: statePayload.telegramUserId,
          telegramUsername: statePayload.telegramUsername || null,
          returnTo: statePayload.returnTo || '/menu',
          identity,
          previousUserId: persistResult.conflict.previousUserId,
          previousTelegramUserId: persistResult.conflict.previousTelegramUserId,
          previousTelegramUsername: persistResult.conflict.previousTelegramUsername
        }
      });
      const transferUrl = new URL(req.url, 'http://localhost');
      transferUrl.search = '';
      transferUrl.searchParams.set('transfer_token', token);

      return res.status(409).send(renderHtml({
        title: 'LinkedIn already connected',
        body: buildTransferConfirmationBody({
          transferUrl: transferUrl.pathname + transferUrl.search,
          identity,
          previousTelegramUsername: persistResult.conflict.previousTelegramUsername
        })
      }));
    }

    try {
      stage = 'notify_telegram';
      await notifyTelegramConnectionResult({ statePayload, identity, persistResult });
    } catch (notifyError) {
      console.warn('[linkedin callback] telegram notify skipped', {
        stage: 'notify_telegram',
        telegramUserId: statePayload.telegramUserId,
        error: describeError(notifyError)
      });
    }

    return res.status(200).send(renderPersistenceSuccessPage({
      identity,
      persistResult
    }));
  } catch (callbackError) {
    console.error('[linkedin callback] failed', {
      stage,
      telegramUserId: statePayload?.telegramUserId || null,
      hasCode: Boolean(code),
      hasState: Boolean(state),
      hasTransferToken: Boolean(transferToken),
      error: describeError(callbackError)
    });

    return res.status(500).send(renderHtml({
      title: 'LinkedIn callback failed',
      body: `
        <h1>LinkedIn callback failed</h1>
        <p>Please return to Telegram and try the connection again.</p>
        <p class="meta">Failure stage: <code>${escapeHtml(stage)}</code>. Check the server logs for the detailed reason.</p>
      `
    }));
  }
}
