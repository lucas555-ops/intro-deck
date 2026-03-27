import { readFileSync } from 'node:fs';

const webhookSource = readFileSync(new URL('../api/webhook.js', import.meta.url), 'utf8');
const envSource = readFileSync(new URL('../src/config/env.js', import.meta.url), 'utf8');
const storeSource = readFileSync(new URL('../src/lib/storage/introRequestStore.js', import.meta.url), 'utf8');
const repoSource = readFileSync(new URL('../src/db/runtimeGuardRepo.js', import.meta.url), 'utf8');
const runtimeGuardStoreSource = readFileSync(new URL('../src/lib/storage/runtimeGuardStore.js', import.meta.url), 'utf8');
const notificationStoreSource = readFileSync(new URL('../src/lib/storage/notificationStore.js', import.meta.url), 'utf8');
const renderSource = readFileSync(new URL('../src/lib/telegram/render.js', import.meta.url), 'utf8');

if (!webhookSource.includes('claimWebhookUpdateReceipt')) {
  throw new Error('Webhook handler must claim update receipts before processing');
}
if (!webhookSource.includes('duplicate: true')) {
  throw new Error('Webhook handler must short-circuit duplicate updates');
}
if (!webhookSource.includes('invalid_update_id')) {
  throw new Error('Webhook handler must reject malformed update payloads');
}
if (!envSource.includes('TELEGRAM_UPDATE_DEDUPE_TTL_SECONDS')) {
  throw new Error('Env contract must include TELEGRAM_UPDATE_DEDUPE_TTL_SECONDS');
}
if (!envSource.includes('TELEGRAM_ACTION_THROTTLE_SECONDS')) {
  throw new Error('Env contract must include TELEGRAM_ACTION_THROTTLE_SECONDS');
}
if (!storeSource.includes('intro_request_throttled') || !storeSource.includes('intro_decision_throttled')) {
  throw new Error('Intro storage must expose throttled outcomes for send and decision actions');
}
if (!repoSource.includes('telegram_update_receipts') || !repoSource.includes('user_action_guards')) {
  throw new Error('Runtime guard repo must cover update receipts and user action guards');
}
if (!repoSource.includes('cleanupExpiredTelegramUpdateReceipts') || !repoSource.includes('cleanupExpiredUserActionGuards')) {
  throw new Error('Runtime guard repo must expose cleanup helpers');
}
if (!runtimeGuardStoreSource.includes('cleanupExpiredRuntimeGuards')) {
  throw new Error('Runtime guard store must expose cleanupExpiredRuntimeGuards');
}
if (!notificationStoreSource.includes('guardCleanup')) {
  throw new Error('Notification retry path must report guard cleanup summary');
}
if (!renderSource.includes('STEP020 baseline')) {
  throw new Error('Intro surfaces must expose STEP020 baseline text');
}

console.log('OK: anti-abuse / retry / dedupe hardening baseline');
