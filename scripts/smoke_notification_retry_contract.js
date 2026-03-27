import { readFileSync } from 'node:fs';

const migrationSource = readFileSync(new URL('../migrations/009_notification_retry_baseline.sql', import.meta.url), 'utf8');
if (!migrationSource.includes('attempt_count')) {
  throw new Error('Retry migration must add attempt_count');
}
if (!migrationSource.includes('next_attempt_at')) {
  throw new Error('Retry migration must add next_attempt_at');
}
if (!migrationSource.includes('max_attempts')) {
  throw new Error('Retry migration must add max_attempts');
}


const retentionMigrationSource = readFileSync(new URL('../migrations/011_notification_receipts_retention_policy_and_guard_cleanup.sql', import.meta.url), 'utf8');
if (!retentionMigrationSource.includes('recipient_user_id')) {
  throw new Error('Retention migration must touch recipient_user_id');
}
if (!retentionMigrationSource.includes('on delete set null')) {
  throw new Error('Retention migration must switch recipient_user_id to ON DELETE SET NULL');
}

const notificationRepoSource = readFileSync(new URL('../src/db/notificationRepo.js', import.meta.url), 'utf8');
if (!notificationRepoSource.includes('claimRetryableNotificationReceipts')) {
  throw new Error('Notification repo must expose claimRetryableNotificationReceipts');
}
if (!notificationRepoSource.includes('claimNotificationReceiptAttempt')) {
  throw new Error('Notification repo must expose claimNotificationReceiptAttempt');
}
if (!notificationRepoSource.includes('last_error_code')) {
  throw new Error('Notification repo must persist last_error_code');
}

const notificationStoreSource = readFileSync(new URL('../src/lib/storage/notificationStore.js', import.meta.url), 'utf8');
if (!notificationStoreSource.includes('retryDueNotificationReceipts')) {
  throw new Error('Notification store must expose retryDueNotificationReceipts');
}
if (!notificationStoreSource.includes('computeNextAttemptAt')) {
  throw new Error('Notification store must schedule nextAttemptAt on failed retryable sends');
}
if (!notificationStoreSource.includes('cleanupExpiredRuntimeGuards')) {
  throw new Error('Notification retry flow must run runtime guard cleanup');
}

const retryRouteSource = readFileSync(new URL('../api/cron/notification-retry.js', import.meta.url), 'utf8');
if (!retryRouteSource.includes('x-notification-retry-secret')) {
  throw new Error('Retry route must preserve x-notification-retry-secret auth');
}
if (!retryRouteSource.includes('Authorization')) {
  throw new Error('Retry route must support Authorization auth');
}
if (!retryRouteSource.includes('retryDueNotificationReceipts')) {
  throw new Error('Retry route must trigger retryDueNotificationReceipts');
}

const envSource = readFileSync(new URL('../src/config/env.js', import.meta.url), 'utf8');
if (!envSource.includes('NOTIFICATION_RETRY_SECRET')) {
  throw new Error('Env config must expose NOTIFICATION_RETRY_SECRET');
}
if (!envSource.includes('CRON_SECRET')) {
  throw new Error('Env config must expose CRON_SECRET');
}
if (!envSource.includes('NOTIFICATION_RETRY_DELAY_SECONDS')) {
  throw new Error('Env config must expose retry delay config');
}

console.log('OK: notification retry baseline contract');
