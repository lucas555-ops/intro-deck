import { readFileSync } from 'node:fs';

const webhookSource = readFileSync(new URL('../api/webhook.js', import.meta.url), 'utf8');
const envSource = readFileSync(new URL('../src/config/env.js', import.meta.url), 'utf8');
const secretCompareSource = readFileSync(new URL('../src/lib/crypto/secretCompare.js', import.meta.url), 'utf8');

if (!webhookSource.includes("'x-telegram-bot-api-secret-token'")) {
  throw new Error('Webhook handler must read the Telegram secret header');
}
if (!webhookSource.includes('secretsMatch')) {
  throw new Error('Webhook handler must use shared secretsMatch helper');
}
if (!webhookSource.includes('invalid_webhook_secret')) {
  throw new Error('Webhook handler must reject invalid webhook secrets');
}
if (!webhookSource.includes('webhook_secret_not_configured')) {
  throw new Error('Webhook handler must fail closed when the secret is missing');
}
if (!secretCompareSource.includes('timingSafeEqual')) {
  throw new Error('Shared secret compare helper must use timingSafeEqual');
}
if (!envSource.includes('TELEGRAM_WEBHOOK_SECRET')) {
  throw new Error('Environment contract must include TELEGRAM_WEBHOOK_SECRET');
}

console.log('OK: webhook secret guard baseline');
