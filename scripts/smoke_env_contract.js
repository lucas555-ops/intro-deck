import { readFileSync } from 'node:fs';

const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const requiredKeys = [
  'APP_BASE_URL',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'CRON_SECRET',
  'NOTIFICATION_RETRY_SECRET',
  'NOTIFICATION_OPS_SECRET',
  'NOTIFICATION_RECEIPT_DIAGNOSTICS_LIMIT',
  'OPERATOR_TELEGRAM_USER_IDS',
  'LINKEDIN_CLIENT_ID',
  'LINKEDIN_CLIENT_SECRET',
  'LINKEDIN_REDIRECT_URI',
  'LINKEDIN_SCOPES',
  'LINKEDIN_STATE_SECRET',
  'LINKEDIN_OIDC_DISCOVERY_URL',
  'DATABASE_URL',
  'DATABASE_SSLMODE'
];

for (const key of requiredKeys) {
  if (!envExample.includes(`${key}=`)) {
    throw new Error(`Missing ${key} in .env.example`);
  }
}

console.log('OK: env contract baseline present');
