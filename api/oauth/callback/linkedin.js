import { getLinkedInConfig, getTelegramConfig } from '../../../../src/config/env.js';
import {
  exchangeCodeForToken,
  fetchOidcDiscovery,
  fetchUserInfo,
  validateIdToken,
  verifySignedState
} from '../../../../src/lib/linkedin/oidc.js';
import {
  buildConnectedSummary,
  buildPersistenceSummary,
  pickLinkedInIdentityClaims
} from '../../../../src/lib/linkedin/profile.js';
import { persistLinkedInIdentity } from '../../../../src/lib/storage/linkedinIdentityStore.js';
import { sendTelegramMessage } from '../../../../src/lib/telegram/botApi.js';

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
    </style>
  </head>
  <body>
    <div class="card">
      ${body}
    </div>
  </body>
</html>`;
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
      title: 'LinkedIn auth canceled',
      body: `<h1>LinkedIn auth failed</h1><p><code>${escapeHtml(error)}</code></p>`
    }));
  }

  if (!code || !state) {
    return res.status(400).send(renderHtml({
      title: 'Missing callback parameters',
      body: '<h1>Missing callback parameters</h1><p>Expected both <code>code</code> and <code>state</code>.</p>'
    }));
  }

  try {
    const linkedinConfig = getLinkedInConfig();
    const statePayload = verifySignedState(state, linkedinConfig.stateSecret);
    const discovery = await fetchOidcDiscovery(linkedinConfig.oidcDiscoveryUrl);
    const tokenPayload = await exchangeCodeForToken({
      discovery,
      clientId: linkedinConfig.clientId,
      clientSecret: linkedinConfig.clientSecret,
      redirectUri: linkedinConfig.redirectUri,
      code
    });

    let idTokenClaims = {};
    if (tokenPayload.id_token) {
      idTokenClaims = await validateIdToken({
        idToken: tokenPayload.id_token,
        discovery,
        clientId: linkedinConfig.clientId
      });
    }

    let userInfo = {};
    if (tokenPayload.access_token) {
      userInfo = await fetchUserInfo({
        discovery,
        accessToken: tokenPayload.access_token
      });
    }

    const identity = pickLinkedInIdentityClaims({ idTokenClaims, userInfo });
    const persistResult = await persistLinkedInIdentity({
      telegramUserId: statePayload.telegramUserId,
      telegramUsername: statePayload.telegramUsername || null,
      identity,
      rawTokenPayload: tokenPayload,
      rawUserInfo: userInfo
    });

    try {
      const { botToken } = getTelegramConfig();
      await sendTelegramMessage({
        botToken,
        chatId: statePayload.telegramUserId,
        text: [
          '✅ LinkedIn connected.',
          '',
          buildConnectedSummary(identity) || 'Minimal identity extracted.',
          buildPersistenceSummary(persistResult),
          'STEP005 profile draft editing is ready. Open the profile menu to complete your card.'
        ].join('\n'),
        replyMarkup: {
          inline_keyboard: [
            [{ text: '🧩 Complete profile', callback_data: 'p:menu' }],
            [{ text: '🏠 Home', callback_data: 'home:root' }]
          ]
        }
      });
    } catch (notifyError) {
      console.warn('[linkedin callback] telegram notify skipped', notifyError);
    }

    const summary = buildConnectedSummary(identity) || 'Minimal identity extracted';
    const persistenceSummary = buildPersistenceSummary(persistResult);

    return res.status(200).send(renderHtml({
      title: 'LinkedIn connected',
      body: `
        <h1>LinkedIn connected</h1>
        <p>${escapeHtml(summary)}</p>
        <p>${escapeHtml(persistenceSummary)}</p>
        <p>STEP005 keeps LinkedIn identity persisted and opens the in-Telegram profile completion flow when <code>DATABASE_URL</code> is configured.</p>
        <p>You can return to Telegram now.</p>
      `
    }));
  } catch (callbackError) {
    console.error('[linkedin callback] failed', callbackError);
    return res.status(500).send(renderHtml({
      title: 'LinkedIn callback failed',
      body: `<h1>LinkedIn callback failed</h1><p><code>${escapeHtml(String(callbackError?.message || callbackError))}</code></p>`
    }));
  }
}
