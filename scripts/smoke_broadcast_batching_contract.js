import { readFileSync } from 'node:fs';

const migration = readFileSync(new URL('../migrations/017_admin_broadcast_batching.sql', import.meta.url), 'utf8');
for (const fragment of [
  'admin_broadcast_delivery_items',
  'batch_size',
  'cursor',
  "status in ('draft', 'queued', 'sending', 'sent', 'sent_with_failures', 'failed', 'disabled', 'cancelled')"
]) {
  if (!migration.includes(fragment)) {
    throw new Error(`Broadcast batching migration missing ${fragment}`);
  }
}

const repo = readFileSync(new URL('../src/db/adminRepo.js', import.meta.url), 'utf8');
for (const fragment of [
  'createAdminBroadcastDeliveryItems',
  'listAdminBroadcastDeliveryBatch',
  'summarizeAdminBroadcastDelivery',
  'listAdminBroadcastFailurePage'
]) {
  if (!repo.includes(fragment)) {
    throw new Error(`adminRepo missing ${fragment}`);
  }
}

const store = readFileSync(new URL('../src/lib/storage/adminStore.js', import.meta.url), 'utf8');
for (const fragment of [
  'const batchSize = 25;',
  "status: 'queued'",
  'createAdminBroadcastDeliveryItems',
  'listAdminBroadcastDeliveryBatch',
  'summarizeAdminBroadcastDelivery'
]) {
  if (!store.includes(fragment)) {
    throw new Error(`adminStore missing ${fragment}`);
  }
}

console.log('OK: broadcast batching contract');
