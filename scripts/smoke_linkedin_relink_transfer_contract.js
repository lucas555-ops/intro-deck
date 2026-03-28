import fs from 'node:fs';

const source = fs.readFileSync(new URL('../api/oauth/callback/linkedin.js', import.meta.url), 'utf8');

const required = [
  "transfer_token",
  "stage = 'verify_transfer_token'",
  "stage = 'confirm_transfer'",
  "stage = 'render_transfer_confirm'",
  "Move connection here",
  "persistResult?.transferRequired",
  "notify_previous_owner",
  "LinkedIn connection moved to this Telegram account.",
  "Your LinkedIn connection was moved to another Telegram account."
];

for (const token of required) {
  if (!source.includes(token)) {
    throw new Error(`Missing LinkedIn relink transfer contract token: ${token}`);
  }
}

console.log('OK: linkedin relink transfer contract');
