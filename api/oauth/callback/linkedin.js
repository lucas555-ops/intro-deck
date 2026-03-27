import { getLinkedInConfig, getTelegramConfig } from '../../../src/config/env.js';
import {
  exchangeCodeForToken,
  fetchOidcDiscovery,
  fetchUserInfo,
  validateIdToken,
  verifySignedState
} from '../../../src/lib/linkedin/oidc.js';
import {
  buildConnectedSummary,
  buildPersistenceSummary,
  pickLinkedInIdentityClaims
} from '../../../src/lib/linkedin/profile.js';
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

  if (error) {
    return res.status(400).send(renderHtml({
      title: 'LinkedIn sign-in canceled',
      body: `<h1>LinkedIn sign-in was canceled</h1><p><code>${escapeHtml(error)}</code></p>`
    }));
  }

  if (!code || !state) {
    return res.status(400).send(renderHtml({
      title: 'Missing callback parameters',
      body: '<h1>Missing callback parameters</h1><p>Expected both <code>code</code> and <code>state</code>.</p>'
    }));
  }

  let stage = 'config';
  let statePayload = null;

  try {
    const linkedinConfig = getLinkedInConfig();

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
    const persistResult = await persistLinkedInIdentity({
      telegramUserId: statePayload.telegramUserId,
      telegramUsername: statePayload.telegramUsername || null,
      identity,
      rawTokenPayload: tokenPayload,
      rawUserInfo: userInfo
    });

    try {
      stage = 'notify_telegram';
      const { botToken } = getTelegramConfig();
      await sendTelegramMessage({
        botToken,
        chatId: statePayload.telegramUserId,
        text: [
          '✅ LinkedIn connected.',
          '',
          buildConnectedSummary(identity) || 'Minimal identity extracted.',
          buildPersistenceSummary(persistResult),
          'Open the profile editor in Telegram to complete your card.'
        ].join('\n'),
        replyMarkup: {
          inline_keyboard: [
            [{ text: '🧩 Complete profile', callback_data: 'p:menu' }],
            [{ text: '🏠 Home', callback_data: 'home:root' }]
          ]
        }
      });
    } catch (notifyError) {
      console.warn('[linkedin callback] telegram notify skipped', {
        stage: 'notify_telegram',
        telegramUserId: statePayload.telegramUserId,
        error: describeError(notifyError)
      });
    }

    const summary = buildConnectedSummary(identity) || 'Minimal identity extracted';
    const persistenceSummary = buildPersistenceSummary(persistResult);

    return res.status(200).send(renderHtml({
      title: 'LinkedIn connected',
      body: `
        <h1>LinkedIn connected</h1>
        <p>${escapeHtml(summary)}</p>
        <p>${escapeHtml(persistenceSummary)}</p>
        <p>You can return to Telegram now and finish your profile.</p>
      `
    }));
  } catch (callbackError) {
    console.error('[linkedin callback] failed', {
      stage,
      telegramUserId: statePayload?.telegramUserId || null,
      hasCode: Boolean(code),
      hasState: Boolean(state),
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
