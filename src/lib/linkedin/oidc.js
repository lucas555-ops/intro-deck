import crypto from 'node:crypto';

function base64UrlJson(input) {
  return Buffer.from(JSON.stringify(input), 'utf8').toString('base64url');
}

function parseBase64UrlJson(token) {
  return JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
}

function createSignature(payloadToken, secret) {
  return crypto.createHmac('sha256', secret).update(payloadToken).digest('base64url');
}

export async function fetchOidcDiscovery(oidcDiscoveryUrl) {
  const response = await fetch(oidcDiscoveryUrl, {
    method: 'GET',
    headers: { accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch LinkedIn OIDC discovery: ${response.status}`);
  }

  return response.json();
}

export function buildSignedState({ telegramUserId, telegramUsername = null, returnTo = '/menu', ttlSeconds, secret }) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    telegramUserId: String(telegramUserId),
    telegramUsername: telegramUsername ? String(telegramUsername) : null,
    returnTo,
    iat: now,
    exp: now + ttlSeconds,
    nonce: crypto.randomBytes(12).toString('hex')
  };

  const payloadToken = base64UrlJson(payload);
  const signature = createSignature(payloadToken, secret);
  return `${payloadToken}.${signature}`;
}

export function verifySignedState(stateToken, secret) {
  if (!stateToken || !stateToken.includes('.')) {
    throw new Error('Missing or malformed state token');
  }

  const [payloadToken, signature] = stateToken.split('.', 2);
  const expectedSignature = createSignature(payloadToken, secret);
  const provided = Buffer.from(signature, 'utf8');
  const expected = Buffer.from(expectedSignature, 'utf8');

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    throw new Error('Invalid state signature');
  }

  const payload = parseBase64UrlJson(payloadToken);
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    throw new Error('Expired state token');
  }

  return payload;
}

export function buildAuthorizeUrl({ discovery, clientId, redirectUri, scopes, state }) {
  const url = new URL(discovery.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeCodeForToken({ discovery, clientId, clientSecret, redirectUri, code }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri
  });

  const response = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json'
    },
    body
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`LinkedIn token exchange failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

export async function validateIdToken({ idToken, discovery, clientId }) {
  const { createRemoteJWKSet, jwtVerify } = await import('jose');
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri));
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: discovery.issuer,
    audience: clientId
  });
  return payload;
}

export async function fetchUserInfo({ discovery, accessToken }) {
  const response = await fetch(discovery.userinfo_endpoint, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/json'
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`LinkedIn userinfo failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}
