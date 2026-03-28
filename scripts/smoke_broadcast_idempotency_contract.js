import { readFileSync } from 'node:fs';

const store = readFileSync(new URL('../src/lib/storage/adminStore.js', import.meta.url), 'utf8');
for (const fragment of [
  'await clearAdminBroadcastDraft(client);',
  'const batch = await withDbClient(async (client) => listAdminBroadcastDeliveryBatch(client, { outboxId: prep.outboxId, limit: prep.batchSize }));',
  'status: recipients.length > 0 ? \'sending\' : \'sent\'',
  'cursor: processedCount'
]) {
  if (!store.includes(fragment)) {
    throw new Error(`Broadcast idempotency flow missing ${fragment}`);
  }
}

const composer = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const fragment of ['adm:bc:refresh', 'adm:bc:fail:']) {
  if (!composer.includes(fragment)) {
    throw new Error(`Operator composer missing ${fragment}`);
  }
}

console.log('OK: broadcast idempotency contract');
