import { getLinkedInConfig } from '../../../src/config/env.js';
import { buildAuthorizeUrl, buildSignedState, fetchOidcDiscovery } from '../../../src/lib/linkedin/oidc.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const { clientId, redirectUri, stateSecret, stateTtlSeconds, oidcDiscoveryUrl, scopes } = getLinkedInConfig();
  const url = new URL(req.url, 'http://localhost');
  const telegramUserId = url.searchParams.get('tg_id');
  const returnTo = url.searchParams.get('ret') || '/menu';
  const redirect = url.searchParams.get('redirect') !== '0';

  if (!telegramUserId || !/^\d+$/.test(telegramUserId)) {
    return res.status(400).json({ ok: false, error: 'invalid_tg_id' });
  }

  try {
    const discovery = await fetchOidcDiscovery(oidcDiscoveryUrl);
    const state = buildSignedState({
      telegramUserId,
      returnTo,
      ttlSeconds: stateTtlSeconds,
      secret: stateSecret
    });

    const authorizeUrl = buildAuthorizeUrl({
      discovery,
      clientId,
      redirectUri,
      scopes,
      state
    });

    if (redirect) {
      res.statusCode = 302;
      res.setHeader('Location', authorizeUrl);
      return res.end();
    }

    return res.status(200).json({ ok: true, authorize_url: authorizeUrl });
  } catch (error) {
    console.error('[linkedin start] failed', error);
    return res.status(500).json({ ok: false, error: 'linkedin_start_failed' });
  }
}
