import fs from 'node:fs';

const source = fs.readFileSync(new URL('../api/oauth/callback/linkedin.js', import.meta.url), 'utf8');

const requiredStages = [
  "let stage = 'config'",
  "stage = 'verify_state'",
  "stage = 'fetch_discovery'",
  "stage = 'exchange_token'",
  "stage = 'validate_id_token'",
  "stage = 'fetch_userinfo'",
  "stage = 'extract_identity'",
  "stage = 'persist_identity'",
  "stage = 'notify_telegram'"
];

for (const token of requiredStages) {
  if (!source.includes(token)) {
    throw new Error(`Missing callback diagnostics stage token: ${token}`);
  }
}

if (!source.includes("console.error('[linkedin callback] failed', {")) {
  throw new Error('Structured linkedin callback failure logging missing');
}

if (!source.includes('Failure stage: <code>${escapeHtml(stage)}</code>')) {
  throw new Error('Failure stage hint missing from callback failure page');
}

console.log('OK: linkedin callback diagnostics contract');
