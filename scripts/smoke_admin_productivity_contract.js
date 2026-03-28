import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';
import { readFileSync } from 'node:fs';

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP036' });

const home = await surfaces.buildAdminHomeSurface({
  summary: {
    totalUsers: 10,
    listedUsers: 3,
    pendingIntros: 2,
    failedDeliveries: 1,
    activeNotice: true,
    latestBroadcastStatus: 'sent'
  }
});
const homeKeyboard = JSON.stringify(home.reply_markup.inline_keyboard);
for (const callback of ['adm:usr:list', 'adm:intro:seg:pend', 'adm:dlv:seg:fail', 'adm:not', 'adm:bc', 'adm:outbox', 'adm:qual']) {
  if (!homeKeyboard.includes(callback)) {
    throw new Error(`Admin home missing quick action: ${callback}`);
  }
}

const userCard = await surfaces.buildAdminUserCardSurface({
  card: {
    user_id: 9,
    telegram_user_id: 111,
    telegram_username: 'rustam',
    display_name: 'Rustam Lukmanov',
    linkedin_name: 'Rustam Lukmanov',
    linkedin_sub: 'abc',
    profile_id: 3,
    profile_state: 'active',
    visibility_status: 'listed',
    skills: [],
    headline_user: 'Founder',
    intro_sent_count: 0,
    intro_received_count: 1,
    pending_intro_count: 1,
    last_seen_at: new Date().toISOString()
  },
  segmentKey: 'all',
  page: 0
});
const userCardKeyboard = JSON.stringify(userCard.reply_markup.inline_keyboard);
for (const callback of ['adm:card:intros:9', 'adm:card:audit:9', 'adm:card:msg:9:all:0']) {
  if (!userCardKeyboard.includes(callback)) {
    throw new Error(`User card missing productivity shortcut: ${callback}`);
  }
}

const intros = await surfaces.buildAdminIntrosSurface({
  state: {
    persistenceEnabled: true,
    segmentKey: 'p24',
    page: 0,
    pageSize: 8,
    totalCount: 1,
    targetUserId: 9,
    hasPrev: false,
    hasNext: false,
    counts: { pending: 1, pending24h: 1, stale: 0, accepted: 0, acceptedRecent: 0, declined: 0, declinedRecent: 0, failedNotify: 0 },
    intros: [{ introRequestId: 12, requesterDisplayName: 'Rustam', targetDisplayName: 'Jane', status: 'pending', deliveryProblemCount: 0 }]
  }
});
const introsKeyboard = JSON.stringify(intros.reply_markup.inline_keyboard);
for (const callback of ['adm:intro:user:9:seg:p24', 'adm:intro:user:9:open:12:p24:0', 'adm:usr:open:9:all:0']) {
  if (!introsKeyboard.includes(callback)) {
    throw new Error(`Scoped intros keyboard missing ${callback}`);
  }
}

const auditDetail = await surfaces.buildAdminAuditRecordSurface({
  record: {
    id: 1,
    event_type: 'admin_direct_message_sent',
    summary: 'Direct message sent.',
    created_at: new Date().toISOString(),
    target_user_id: 9,
    intro_request_id: 12,
    detail: { outboxId: 44 }
  },
  backCallback: 'adm:audit:user:9:page:all:0'
});
const auditKeyboard = JSON.stringify(auditDetail.reply_markup.inline_keyboard);
for (const callback of ['adm:usr:open:9:all:0', 'adm:intro:open:12:all:0', 'adm:outbox:open:44']) {
  if (!auditKeyboard.includes(callback)) {
    throw new Error(`Audit detail missing cross-link ${callback}`);
  }
}

const composerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const needle of ['adm:card:intros:', 'adm:card:audit:', 'adm:intro:user:', 'adm:audit:user:']) {
  if (!composerSource.includes(needle)) {
    throw new Error(`Operator composer missing productivity route: ${needle}`);
  }
}

console.log('OK: admin productivity contract');
