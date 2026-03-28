import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP031' });
const deliveryList = await surfaces.buildAdminDeliverySurface({
  state: {
    persistenceEnabled: true,
    segmentKey: 'due',
    page: 0,
    pageSize: 8,
    totalCount: 1,
    hasPrev: false,
    hasNext: false,
    introRequestId: null,
    counts: {
      failed: 0,
      retryDue: 1,
      exhausted: 0,
      sent: 0
    },
    records: [{
      notificationReceiptId: 31,
      introRequestId: 12,
      recipientDisplayName: 'Jane Founder',
      requesterDisplayName: 'Rustam Lukmanov',
      targetDisplayName: 'Jane Founder',
      operatorBucket: 'retry_due',
      attemptCount: 1,
      maxAttempts: 3,
      lastErrorCode: 'telegram_send_failed'
    }]
  }
});

if (!deliveryList.text.includes('🧾 Delivery')) {
  throw new Error('Admin delivery surface must expose the Delivery title');
}
if (!deliveryList.text.includes('Retry due 1')) {
  throw new Error('Admin delivery surface must include the retry due summary');
}

const deliveryKeyboard = JSON.stringify(deliveryList.reply_markup.inline_keyboard);
for (const callback of ['adm:dlv:seg:due', 'adm:dlv:open:31:due:0', 'adm:ops']) {
  if (!deliveryKeyboard.includes(callback)) {
    throw new Error(`Admin delivery keyboard missing ${callback}`);
  }
}

const deliveryDetail = await surfaces.buildAdminDeliveryRecordSurface({
  record: {
    notification_receipt_id: 31,
    intro_request_id: 12,
    event_type: 'intro_request_created',
    recipient_display_name: 'Jane Founder',
    operator_bucket: 'retry_due',
    delivery_status: 'failed',
    attempt_count: 1,
    max_attempts: 3,
    next_attempt_at: '2026-03-28T02:00:00Z',
    last_attempt_at: '2026-03-28T01:30:00Z',
    delivered_at: null,
    created_at: '2026-03-28T01:00:00Z',
    last_error_code: 'telegram_send_failed'
  },
  backCallback: 'adm:dlv'
});

const deliveryDetailKeyboard = JSON.stringify(deliveryDetail.reply_markup.inline_keyboard);
for (const callback of ['adm:intro:open:12:all:0', 'adm:dlv']) {
  if (!deliveryDetailKeyboard.includes(callback)) {
    throw new Error(`Admin delivery detail keyboard missing ${callback}`);
  }
}

const operatorComposerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const fragment of ['adm:dlv', 'adm:dlv:seg', 'adm:dlv:page', 'adm:dlv:open', 'adm:dlv:intro']) {
  if (!operatorComposerSource.includes(fragment)) {
    throw new Error(`Operator composer missing ${fragment} delivery routing`);
  }
}

console.log('OK: admin delivery contract');
