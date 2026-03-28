import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP031' });
const introList = await surfaces.buildAdminIntrosSurface({
  state: {
    persistenceEnabled: true,
    segmentKey: 'pend',
    page: 0,
    pageSize: 8,
    totalCount: 1,
    hasPrev: false,
    hasNext: false,
    counts: {
      pending: 1,
      accepted: 0,
      declined: 0,
      stale: 0,
      failedNotify: 1
    },
    intros: [{
      introRequestId: 12,
      requesterDisplayName: 'Rustam Lukmanov',
      targetDisplayName: 'Jane Founder',
      status: 'pending',
      deliveryProblemCount: 1
    }]
  }
});

if (!introList.text.includes('📨 Intros')) {
  throw new Error('Admin intros surface must expose the Intros title');
}
if (!introList.text.includes('Pending 1')) {
  throw new Error('Admin intros surface must include the pending summary');
}

const introKeyboard = JSON.stringify(introList.reply_markup.inline_keyboard);
for (const callback of ['adm:intro:seg:pend', 'adm:intro:open:12:pend:0', 'adm:ops']) {
  if (!introKeyboard.includes(callback)) {
    throw new Error(`Admin intros keyboard missing ${callback}`);
  }
}

const introDetail = await surfaces.buildAdminIntroDetailSurface({
  intro: {
    intro_request_id: 12,
    requester_user_id: 7,
    requester_display_name: 'Rustam Lukmanov',
    requester_headline_user: 'Founder',
    target_user_id: 9,
    target_display_name: 'Jane Founder',
    target_headline_user: 'Operator',
    status: 'pending',
    created_at: '2026-03-28T00:00:00Z',
    updated_at: '2026-03-28T01:00:00Z'
  },
  notificationSummary: {
    sentCount: 1,
    failedCount: 0,
    retryDueCount: 1,
    exhaustedCount: 0
  },
  recentReceipts: [{ operatorBucket: 'retry_due', eventType: 'intro_request_created', attemptCount: 1, maxAttempts: 3 }],
  segmentKey: 'pend',
  page: 0
});

const introDetailKeyboard = JSON.stringify(introDetail.reply_markup.inline_keyboard);
for (const callback of ['adm:usr:open:7:all:0', 'adm:usr:open:9:all:0', 'adm:intro:dlv:12']) {
  if (!introDetailKeyboard.includes(callback)) {
    throw new Error(`Admin intro detail keyboard missing ${callback}`);
  }
}

const operatorComposerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const fragment of ['adm:intro:list', 'adm:intro:seg', 'adm:intro:page', 'adm:intro:open', 'adm:intro:dlv']) {
  if (!operatorComposerSource.includes(fragment)) {
    throw new Error(`Operator composer missing ${fragment} intro routing`);
  }
}

console.log('OK: admin intros contract');
