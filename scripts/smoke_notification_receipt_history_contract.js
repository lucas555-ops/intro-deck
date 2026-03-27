import { readFileSync } from 'node:fs';
import {
  buildNotificationReceiptBucketCounts,
  buildNotificationReceiptDiagnostics,
  normalizeNotificationReceiptBucket
} from '../src/lib/storage/notificationStore.js';

if (normalizeNotificationReceiptBucket('retry_due') !== 'retry_due') {
  throw new Error('normalizeNotificationReceiptBucket must accept retry_due');
}
if (normalizeNotificationReceiptBucket('bad_bucket') !== null) {
  throw new Error('normalizeNotificationReceiptBucket must reject unknown buckets');
}

const counts = buildNotificationReceiptBucketCounts([
  { operatorBucket: 'sent', receiptCount: 2 },
  { operatorBucket: 'failed', receiptCount: 1 },
  { operatorBucket: 'retry_due', receiptCount: 3 }
]);
if (counts.sent !== 2 || counts.failed != 1 || counts.retry_due !== 3 || counts.total !== 6) {
  throw new Error('buildNotificationReceiptBucketCounts must summarize operator counts');
}

const diagnostics = buildNotificationReceiptDiagnostics({
  counts: [{ operatorBucket: 'exhausted', receiptCount: 4 }],
  recent: [{ notificationReceiptId: 7 }],
  introSummary: { introRequestId: 11 }
});
if (diagnostics.counts.exhausted !== 4) {
  throw new Error('buildNotificationReceiptDiagnostics must include exhausted count');
}
if (diagnostics.recent.length !== 1 || diagnostics.introSummary?.introRequestId !== 11) {
  throw new Error('buildNotificationReceiptDiagnostics must keep recent rows and intro summary');
}

const migrationSource = readFileSync(new URL('../migrations/010_notification_receipt_history_operator_baseline.sql', import.meta.url), 'utf8');
if (!migrationSource.includes('idx_notification_receipts_intro_recent')) {
  throw new Error('STEP023 migration must add intro recent index');
}
if (!migrationSource.includes('idx_notification_receipts_status_recent')) {
  throw new Error('STEP023 migration must add status recent index');
}

const notificationRepoSource = readFileSync(new URL('../src/db/notificationRepo.js', import.meta.url), 'utf8');
if (!notificationRepoSource.includes('listRecentNotificationReceipts')) {
  throw new Error('Notification repo must expose listRecentNotificationReceipts');
}
if (!notificationRepoSource.includes('getNotificationReceiptBucketCounts')) {
  throw new Error('Notification repo must expose getNotificationReceiptBucketCounts');
}
if (!notificationRepoSource.includes('getIntroNotificationReceiptSummary')) {
  throw new Error('Notification repo must expose getIntroNotificationReceiptSummary');
}
if (!notificationRepoSource.includes('retry_due')) {
  throw new Error('Notification repo must derive retry_due bucket');
}
if (!notificationRepoSource.includes('exhausted')) {
  throw new Error('Notification repo must derive exhausted bucket');
}

const notificationStoreSource = readFileSync(new URL('../src/lib/storage/notificationStore.js', import.meta.url), 'utf8');
if (!notificationStoreSource.includes('getNotificationReceiptDiagnostics')) {
  throw new Error('Notification store must expose getNotificationReceiptDiagnostics');
}
if (!notificationStoreSource.includes('buildNotificationReceiptDiagnostics')) {
  throw new Error('Notification store must expose buildNotificationReceiptDiagnostics');
}

const diagnosticsRouteSource = readFileSync(new URL('../api/ops/notification-receipts.js', import.meta.url), 'utf8');
if (!diagnosticsRouteSource.includes('x-notification-ops-secret')) {
  throw new Error('Diagnostics route must protect itself with x-notification-ops-secret');
}
if (!diagnosticsRouteSource.includes('getNotificationReceiptDiagnostics')) {
  throw new Error('Diagnostics route must load receipt diagnostics');
}
if (!diagnosticsRouteSource.includes("availableBuckets: ['sent', 'failed', 'skipped', 'retry_due', 'exhausted']")) {
  throw new Error('Diagnostics route must declare available operator buckets');
}

const envSource = readFileSync(new URL('../src/config/env.js', import.meta.url), 'utf8');
if (!envSource.includes('NOTIFICATION_OPS_SECRET')) {
  throw new Error('Env config must expose NOTIFICATION_OPS_SECRET');
}
if (!envSource.includes('NOTIFICATION_RECEIPT_DIAGNOSTICS_LIMIT')) {
  throw new Error('Env config must expose diagnostics limit');
}

console.log('OK: receipt history / operator diagnostics baseline contract');
