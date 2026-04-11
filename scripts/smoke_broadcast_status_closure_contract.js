import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP051.7.2' });

const broadcastSurface = await surfaces.buildAdminBroadcastSurface({
  state: {
    persistenceEnabled: true,
    draft: {
      body: 'Status closure draft',
      audienceKey: 'ALL_CONNECTED',
      mediaRef: null,
      buttonText: null,
      buttonUrl: null,
      updatedAt: new Date().toISOString()
    },
    estimate: 14,
    latestRecord: {
      id: 88,
      status: 'sending',
      delivered_count: 5,
      failed_count: 1,
      pending_count: 8,
      retry_due_count: 1,
      exhausted_count: 0,
      estimated_recipient_count: 14,
      started_at: new Date().toISOString(),
      finished_at: null,
      batch_size: 25,
      cursor: 6,
      last_error: 'chat not found'
    }
  }
});

if (!broadcastSurface.text.includes('Последняя задача: #88')) {
  throw new Error('Broadcast screen must expose the last task block');
}
for (const callback of ['adm:bc:last', 'adm:bc:fail:88:0']) {
  if (!JSON.stringify(broadcastSurface.reply_markup.inline_keyboard).includes(callback)) {
    throw new Error(`Broadcast surface missing ${callback}`);
  }
}

const outboxRecord = await surfaces.buildAdminOutboxRecordSurface({
  record: { id: 88, event_type: 'broadcast', status: 'sent_with_failures', failed_count: 1, retry_due_count: 1, exhausted_count: 0, body: 'Hello', audience_key: 'ALL_CONNECTED' },
  backCallback: 'adm:bc'
});
if (!JSON.stringify(outboxRecord.reply_markup.inline_keyboard).includes('adm:bc')) {
  throw new Error('Outbox record opened from broadcast must return to broadcast');
}

const source = readFileSync(new URL('../src/lib/storage/adminStore.js', import.meta.url), 'utf8');
if (!source.includes('sendAdminBroadcastPreviewToSelf')) {
  throw new Error('Broadcast preview-to-self helper is missing');
}

console.log('OK: broadcast status closure contract');
