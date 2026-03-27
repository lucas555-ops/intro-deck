import { buildAuthorizeUrl, buildSignedState, verifySignedState } from '../src/lib/linkedin/oidc.js';

const secret = '12345678901234567890123456789012';
const state = buildSignedState({
  telegramUserId: '123456789',
  telegramUsername: 'rustam',
  returnTo: '/menu',
  ttlSeconds: 600,
  secret
});

const payload = verifySignedState(state, secret);
if (payload.telegramUserId !== '123456789') {
  throw new Error('telegramUserId mismatch after state roundtrip');
}
if (payload.telegramUsername !== 'rustam') {
  throw new Error('telegramUsername mismatch after state roundtrip');
}

const authorizeUrl = buildAuthorizeUrl({
  discovery: { authorization_endpoint: 'https://www.linkedin.com/oauth/v2/authorization' },
  clientId: 'client-id',
  redirectUri: 'https://example.com/api/oauth/callback/linkedin',
  scopes: ['openid', 'profile', 'email'],
  state
});

const parsed = new URL(authorizeUrl);
if (parsed.searchParams.get('response_type') !== 'code') {
  throw new Error('response_type must be code');
}
if (parsed.searchParams.get('scope') !== 'openid profile email') {
  throw new Error('scopes missing from authorize URL');
}

console.log('OK: linkedin auth contract baseline');
