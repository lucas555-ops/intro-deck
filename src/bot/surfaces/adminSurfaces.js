import { getOperatorConfig, getPublicFlags, getRuntimeGuardConfig } from '../../config/env.js';
import { ADMIN_AUDIT_SEGMENTS, ADMIN_BROADCAST_AUDIENCES, ADMIN_BROADCAST_TEMPLATES, ADMIN_DELIVERY_SEGMENTS, ADMIN_DIRECT_MESSAGE_TEMPLATES, ADMIN_INTRO_SEGMENTS, ADMIN_NOTICE_AUDIENCES, ADMIN_NOTICE_TEMPLATES, ADMIN_QUALITY_SEGMENTS, ADMIN_SEARCH_SCOPES, ADMIN_USER_SEGMENTS, normalizeAdminAuditSegment, normalizeAdminBroadcastAudience, normalizeAdminBroadcastTemplate, normalizeAdminDeliverySegment, normalizeAdminIntroSegment, normalizeAdminNoticeAudience, normalizeAdminNoticeTemplate, normalizeAdminQualitySegment, normalizeAdminSearchScope, normalizeAdminUserSegment } from '../../db/adminRepo.js';

function buildInlineKeyboard(rows = []) {
  return { inline_keyboard: rows.filter((row) => Array.isArray(row) && row.length > 0) };
}

function toDisplayValue(value, fallback = '—') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function truncate(value, maxLength = 80) {
  const normalized = toDisplayValue(value, '');
  if (!normalized) {
    return '—';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function formatDateTimeShort(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return `${date.toISOString().slice(0, 16).replace('T', ' ')}Z`;
}

function formatShortStatus(value, fallback = 'none') {
  const normalized = typeof value === 'string' && value.trim() ? value.trim().replaceAll('_', ' ') : fallback;
  if (!normalized) {
    return fallback;
  }
  return normalized;
}

function compactBooleanLabel(value, yesLabel, noLabel) {
  return value ? yesLabel : noLabel;
}

function countLine(label, value) {
  return `${label}: ${value ?? 0}`;
}

function adminSearchScopeLabel(scopeKey) {
  return ADMIN_SEARCH_SCOPES[normalizeAdminSearchScope(scopeKey)]?.label || 'Search';
}

function adminSearchBackCallback(scopeKey) {
  switch (normalizeAdminSearchScope(scopeKey)) {
    case 'users': return 'adm:usr:list';
    case 'intros': return 'adm:intro:list';
    case 'delivery': return 'adm:dlv';
    case 'outbox': return 'adm:outbox';
    case 'audit': return 'adm:audit';
    default: return 'adm:home';
  }
}


function profileReadinessLabel(card) {
  if (!card?.profile_id) {
    return 'no profile yet';
  }
  if (card.profile_state === 'active' && card.visibility_status === 'listed') {
    return 'ready • listed';
  }
  if (card.profile_state === 'active') {
    return 'ready • hidden';
  }
  return 'incomplete';
}

function buildAdminHomeText({ summary = null } = {}) {
  return [
    '👑 Admin',
    '',
    'Operator control plane for Intro Deck.',
    '',
    countLine('Users', summary?.totalUsers || 0),
    countLine('Listed', summary?.listedUsers || 0),
    countLine('Pending intros', summary?.pendingIntros || 0),
    countLine('Failed deliveries', summary?.failedDeliveries || 0),
    `Notice: ${summary?.activeNotice ? 'active' : 'inactive'}`,
    `Broadcast: ${formatShortStatus(summary?.latestBroadcastStatus, 'none')}`,
    '',
    'Trends:',
    `Users +${summary?.newUsers24h || 0}/24h • +${summary?.newUsers7d || 0}/7d`,
    `Connected +${summary?.connected24h || 0}/24h • +${summary?.connected7d || 0}/7d`,
    `Listed +${summary?.listed24h || 0}/24h • +${summary?.listed7d || 0}/7d`,
    `Intros ${summary?.intros24h || 0}/24h • ${summary?.intros7d || 0}/7d`,
    `Accepted ${summary?.accepted7d || 0}/7d • Declined ${summary?.declined7d || 0}/7d`,
    `Pending >24h: ${summary?.pendingOlder24h || 0}`,
    `Delivery failures ${summary?.failures24h || 0}/24h • ${summary?.failures7d || 0}/7d`,
    `Broadcasts ${summary?.broadcasts7d || 0}/7d • Direct ${summary?.directMessages7d || 0}/7d`,
    '',
    'Quick actions:',
    'Users • Pending intros • Delivery issues • Notice • Broadcast • Outbox • Quality'
  ].join('\n');
}

function buildAdminHomeKeyboard() {
  return buildInlineKeyboard([
    [{ text: '🧰 Operations', callback_data: 'adm:ops' }],
    [{ text: '💬 Communications', callback_data: 'adm:comms' }],
    [{ text: '⚙️ System', callback_data: 'adm:sys' }],
    [
      { text: '👥 Users', callback_data: 'adm:usr:list' },
      { text: '📨 Pending intros', callback_data: 'adm:intro:seg:pend' }
    ],
    [
      { text: '🧾 Delivery issues', callback_data: 'adm:dlv:seg:fail' },
      { text: '🚩 Quality', callback_data: 'adm:qual' }
    ],
    [
      { text: '📣 Notice', callback_data: 'adm:not' },
      { text: '📬 Broadcast', callback_data: 'adm:bc' }
    ],
    [{ text: '📤 Outbox', callback_data: 'adm:outbox' }],
    [
      { text: '🔎 Users', callback_data: 'adm:search:users' },
      { text: '🔎 Intros', callback_data: 'adm:search:intros' }
    ],
    [
      { text: '🔎 Delivery', callback_data: 'adm:search:delivery' },
      { text: '🔎 Audit', callback_data: 'adm:search:audit' }
    ],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

function buildOperationsHubText({ summary = null } = {}) {
  return [
    '🧰 Operations',
    '',
    'Users, quality, intros, and delivery review. Fast path for the highest-friction operator work.',
    '',
    countLine('Users', summary?.totalUsers || 0),
    countLine('Ready not listed', summary?.readyNotListed || 0),
    countLine('Listed incomplete', summary?.listedIncomplete || 0),
    countLine('Pending intros', summary?.pendingIntros || 0),
    countLine('Stale intros', summary?.staleIntros || 0),
    countLine('Delivery issues', summary?.deliveryIssues || 0),
    '',
    'Pipeline:',
    `Connected, no profile: ${summary?.connectedNoProfile || 0}`,
    `Ready, no skills: ${summary?.readyNoSkills || 0}`,
    `Listed active: ${summary?.listedActive || 0} • inactive ${summary?.listedInactive || 0}`,
    `No intros yet: ${summary?.noIntroYet || 0}`,
    `Recent relinks: ${summary?.recentRelinks7d || 0}/7d`,
    `New intros: ${summary?.newIntros24h || 0}/24h`,
    `Accepted ${summary?.accepted7d || 0}/7d • Declined ${summary?.declined7d || 0}/7d`,
    `Pending >24h: ${summary?.pendingOlder24h || 0}`
  ].join('\n');
}

function buildOperationsHubKeyboard() {
  return buildInlineKeyboard([
    [{ text: '👥 Users', callback_data: 'adm:usr:list' }],
    [{ text: '🚩 Quality', callback_data: 'adm:qual' }],
    [{ text: '📨 Intros', callback_data: 'adm:intro:list' }],
    [{ text: '🧾 Delivery', callback_data: 'adm:dlv' }],
    [
      { text: '🔎 Search users', callback_data: 'adm:search:users' },
      { text: '🔎 Search intros', callback_data: 'adm:search:intros' }
    ],
    [{ text: '↩️ Back to Admin', callback_data: 'adm:home' }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

function buildCommunicationsHubText({ state = null, notice = null } = {}) {
  const lines = [
    '💬 Communications',
    '',
    'Notices, broadcasts, and unified outbox review. Use this hub for growth nudges and direct operator outreach.',
    '',
    `Notice: ${state?.notice?.isActive ? 'active' : 'inactive'} • ${ADMIN_NOTICE_AUDIENCES[normalizeAdminNoticeAudience(state?.notice?.audienceKey || 'ALL')]?.label || 'All users'}`,
    `Broadcast draft: ${state?.broadcastDraft?.body ? 'ready' : 'empty'}`,
    `Latest broadcast: ${formatShortStatus(state?.latestBroadcastStatus, 'none')}`,
    countLine('Recent direct sends', state?.recentDirectMessages || 0),
    countLine('Recent outbox failures', state?.recentOutboxFailures || 0),
    countLine('Outbox records', state?.outboxCount || 0),
    '',
    'Comms trends:',
    `Broadcasts: ${state?.broadcasts7d || 0}/7d`,
    `Broadcast delivery: ${state?.broadcastDeliveredRecipients7d || 0} ok • ${state?.broadcastFailedRecipients7d || 0} failed`,
    `Direct messages: ${state?.directMessages24h || 0}/24h • ${state?.directMessages7d || 0}/7d`,
    `Outbox failures: ${state?.outboxFailures24h || 0}/24h • ${state?.outboxFailures7d || 0}/7d`,
    `Latest broadcast recipients: ${state?.latestBroadcastRecipients || 0} • ok ${state?.latestBroadcastDelivered || 0} • fail ${state?.latestBroadcastFailed || 0}`
  ];

  if (notice) {
    lines.push('', notice);
  }

  return lines.join('\n');
}

function buildCommunicationsHubKeyboard() {
  return buildInlineKeyboard([
    [{ text: '📣 Notice', callback_data: 'adm:not' }],
    [{ text: '📬 Broadcast', callback_data: 'adm:bc' }],
    [{ text: '📌 Templates', callback_data: 'adm:tpl' }],
    [{ text: '📤 Outbox', callback_data: 'adm:outbox' }],
    [{ text: '🔎 Search outbox', callback_data: 'adm:search:outbox' }],
    [{ text: '↩️ Back to Admin', callback_data: 'adm:home' }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

function buildSystemHubText({ summary = null } = {}) {
  return [
    '⚙️ System',
    '',
    'Runtime health, retry visibility, audit, and operator scope. Use it when something looks off or needs a trail.',
    '',
    countLine('Retry due', summary?.retryDue || 0),
    countLine('Exhausted', summary?.exhausted || 0),
    countLine('Failed deliveries', summary?.failedDeliveries || 0),
    countLine('Recent audit events', summary?.recentAuditEvents || 0),
    '',
    'Runtime trends:',
    `Failures ${summary?.failures24h || 0}/24h • ${summary?.failures7d || 0}/7d`,
    `Delivered ${summary?.delivered24h || 0}/24h • ${summary?.delivered7d || 0}/7d`,
    `Operator actions ${summary?.operatorActions24h || 0}/24h • ${summary?.operatorActions7d || 0}/7d`,
    `Listing changes ${summary?.listingChanges7d || 0}/7d • relinks ${summary?.relinks7d || 0}/7d`
  ].join('\n');
}

function buildSystemHubKeyboard() {
  return buildInlineKeyboard([
    [{ text: '🩺 Health', callback_data: 'adm:health' }],
    [{ text: '🔁 Retry', callback_data: 'adm:retry' }],
    [{ text: '📜 Audit', callback_data: 'adm:audit' }],
    [{ text: '👮 Operators', callback_data: 'adm:opscope' }],
    [
      { text: '🔎 Search audit', callback_data: 'adm:search:audit' },
      { text: '🔎 Search delivery', callback_data: 'adm:search:delivery' }
    ],
    [{ text: '↩️ Back to Admin', callback_data: 'adm:home' }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

function buildPlaceholderText({ title, description, nextStep }) {
  const lines = [title, '', description];
  if (nextStep) {
    lines.push('', `Planned next: ${nextStep}`);
  }
  return lines.join('\n');
}

function buildDetailFooter(backCallback) {
  return buildInlineKeyboard([
    [{ text: '↩️ Back', callback_data: backCallback }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

function buildUsersSegmentRow(currentSegmentKey) {
  const ordered = ['all', 'conn', 'noprof', 'inc', 'noskills', 'ready', 'listd', 'listact', 'listinact', 'nointro', 'pend', 'relink'];
  const buttons = ordered.map((segmentKey) => ({
    text: `${currentSegmentKey === segmentKey ? '✅' : '▫️'} ${ADMIN_USER_SEGMENTS[segmentKey].label}`,
    callback_data: `adm:usr:seg:${segmentKey}`
  }));

  return [buttons.slice(0, 2), buttons.slice(2, 4), buttons.slice(4, 6), buttons.slice(6, 8), buttons.slice(8, 10), buttons.slice(10, 12)];
}


function buildIntroSegmentRows(currentSegmentKey) {
  const ordered = ['all', 'pend', 'p24', 'p72', 'acc', 'arec', 'dec', 'drec', 'fail', 'dprob'];
  const buttons = ordered.map((segmentKey) => ({
    text: `${currentSegmentKey === segmentKey ? '✅' : '▫️'} ${ADMIN_INTRO_SEGMENTS[segmentKey].label}`,
    callback_data: `adm:intro:seg:${segmentKey}`
  }));

  return [buttons.slice(0, 2), buttons.slice(2, 4), buttons.slice(4, 6), buttons.slice(6, 8), buttons.slice(8, 10)];
}

function buildDeliverySegmentRows(currentSegmentKey, introRequestId = null) {
  const ordered = ['all', 'fail', 'due', 'exh', 'ok'];
  const buttons = ordered.map((segmentKey) => ({
    text: `${currentSegmentKey === segmentKey ? '✅' : '▫️'} ${ADMIN_DELIVERY_SEGMENTS[segmentKey].label}`,
    callback_data: introRequestId
      ? `adm:dlv:intro:${introRequestId}:seg:${segmentKey}`
      : `adm:dlv:seg:${segmentKey}`
  }));

  return [buttons.slice(0, 2), buttons.slice(2, 5)];
}

function buildQualitySegmentRows(currentSegmentKey) {
  const ordered = ['listinc', 'ready', 'miss', 'dupe', 'relink'];
  const buttons = ordered.map((segmentKey) => ({
    text: `${currentSegmentKey === segmentKey ? '✅' : '▫️'} ${ADMIN_QUALITY_SEGMENTS[segmentKey].label}`,
    callback_data: `adm:qual:seg:${segmentKey}`
  }));

  return [buttons.slice(0, 2), buttons.slice(2, 4), buttons.slice(4, 5)];
}

function buildAuditSegmentRows(currentSegmentKey) {
  const ordered = ['all', 'not', 'bc', 'user', 'relink'];
  const buttons = ordered.map((segmentKey) => ({
    text: `${currentSegmentKey === segmentKey ? '✅' : '▫️'} ${ADMIN_AUDIT_SEGMENTS[segmentKey].label}`,
    callback_data: `adm:audit:seg:${segmentKey}`
  }));

  return [buttons.slice(0, 2), buttons.slice(2, 4), buttons.slice(4, 5)];
}

function qualityReasonLabel(item) {
  if (item?.listedIncomplete) {
    return 'listed incomplete';
  }
  if (item?.readyNotListed) {
    return 'ready not listed';
  }
  if (item?.missingCritical) {
    return 'missing fields';
  }
  if (item?.duplicateLike) {
    return 'duplicate-like';
  }
  return 'relink history';
}

function formatAuditActor(record) {
  if (record?.actor_display_name) return record.actor_display_name;
  if (record?.actor_telegram_username) return `@${record.actor_telegram_username}`;
  if (record?.actor_telegram_user_id) return `tg ${record.actor_telegram_user_id}`;
  return 'system';
}

function formatAuditTarget(record) {
  if (record?.target_display_name) return record.target_display_name;
  if (record?.target_telegram_username) return `@${record.target_telegram_username}`;
  if (record?.target_telegram_user_id) return `tg ${record.target_telegram_user_id}`;
  return '—';
}

function renderIntroListLine(item, index, page = 0, pageSize = 8) {
  const ordinal = page * pageSize + index + 1;
  const sender = truncate(item?.requesterDisplayName, 18);
  const target = truncate(item?.targetDisplayName, 18);
  const status = formatShortStatus(item?.status, 'pending');
  const age = formatDateTimeShort(item?.updatedAt || item?.createdAt);
  const warning = item?.deliveryProblemCount > 0 ? ' • delivery issue' : '';
  return `${ordinal}. ${sender} → ${target} • ${status} • ${age}${warning}`;
}

function buildAdminIntrosText({ state = null, notice = null } = {}) {
  if (!state?.persistenceEnabled) {
    return ['📨 Intros', '', notice || '⚠️ Intro data is unavailable in this environment.'].join('\n');
  }

  const lines = [
    '📨 Intros',
    '',
    `Segment: ${ADMIN_INTRO_SEGMENTS[state.segmentKey]?.label || 'All'} • page ${state.page + 1}`,
    `Visible in this segment: ${state.totalCount}`,
    `Pending ${state.counts?.pending || 0} • Accepted ${state.counts?.accepted || 0} • Declined ${state.counts?.declined || 0} • Stale ${state.counts?.stale || 0} • Failed notify ${state.counts?.failedNotify || 0}`
  ];

  if (notice) {
    lines.push('', notice);
  }

  if (!state.intros?.length) {
    lines.push('', 'No intros found for this segment yet.');
    return lines.join('\n');
  }

  lines.push('', 'Open an intro:');
  lines.push(...state.intros.map((item, index) => renderIntroListLine(item, index, state.page, state.pageSize)));
  return lines.join('\n');
}

function buildAdminIntrosKeyboard({ state = null } = {}) {
  const segmentKey = normalizeAdminIntroSegment(state?.segmentKey);
  const targetUserId = state?.targetUserId || null;
  const rows = buildIntroSegmentRows(segmentKey).map((row) => row.map((button) => ({
    ...button,
    callback_data: targetUserId ? `adm:intro:user:${targetUserId}:seg:${button.callback_data.split(':').pop()}` : button.callback_data
  })));

  for (const item of state?.intros || []) {
    const label = truncate(`${item?.requesterDisplayName || 'Unknown'} → ${item?.targetDisplayName || 'Unknown'}`, 42);
    rows.push([{ text: `📄 ${label}`, callback_data: targetUserId ? `adm:intro:user:${targetUserId}:open:${item.introRequestId}:${segmentKey}:${state?.page || 0}` : `adm:intro:open:${item.introRequestId}:${segmentKey}:${state?.page || 0}` }]);
  }

  const pager = [];
  if (state?.hasPrev) {
    pager.push({ text: '◀️ Prev', callback_data: targetUserId ? `adm:intro:user:${targetUserId}:page:${segmentKey}:${Math.max(0, (state?.page || 0) - 1)}` : `adm:intro:page:${segmentKey}:${Math.max(0, (state?.page || 0) - 1)}` });
  }
  if (state?.hasNext) {
    pager.push({ text: 'Next ▶️', callback_data: targetUserId ? `adm:intro:user:${targetUserId}:page:${segmentKey}:${(state?.page || 0) + 1}` : `adm:intro:page:${segmentKey}:${(state?.page || 0) + 1}` });
  }
  if (pager.length) {
    rows.push(pager);
  }

  rows.push([{ text: '🔎 Search intros', callback_data: 'adm:search:intros' }]);
  rows.push([{ text: targetUserId ? '↩️ Back to User Card' : '↩️ Back to Operations', callback_data: targetUserId ? `adm:usr:open:${targetUserId}:all:0` : 'adm:ops' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminIntroDetailText({ intro = null, notificationSummary = null, recentReceipts = [], notice = null } = {}) {
  if (!intro) {
    return ['📄 Intro Detail', '', notice || '⚠️ Intro not found.'].join('\n');
  }

  const lines = [
    '📄 Intro Detail',
    '',
    `Sender: ${toDisplayValue(intro.requester_display_name)}${intro.requester_headline_user ? ` • ${truncate(intro.requester_headline_user, 60)}` : ''}`,
    `Recipient: ${toDisplayValue(intro.target_display_name)}${intro.target_headline_user ? ` • ${truncate(intro.target_headline_user, 60)}` : ''}`,
    `Status: ${toDisplayValue(intro.status)}`,
    `Created: ${formatDateTimeShort(intro.created_at)}`,
    `Updated: ${formatDateTimeShort(intro.updated_at)}`,
    '',
    'Payload summary:',
    `${truncate(intro.requester_display_name, 32)} → ${truncate(intro.target_display_name, 32)}`,
    '',
    `Delivery: sent ${notificationSummary?.sentCount || 0} • failed ${notificationSummary?.failedCount || 0} • retry due ${notificationSummary?.retryDueCount || 0} • exhausted ${notificationSummary?.exhaustedCount || 0}`
  ];

  if (recentReceipts?.length) {
    lines.push('', 'Recent delivery events:');
    lines.push(...recentReceipts.slice(0, 3).map((item) => `• ${item.operatorBucket} • ${item.eventType} • attempts ${item.attemptCount}/${item.maxAttempts}`));
  }

  if (notice) {
    lines.push('', notice);
  }

  return lines.join('\n');
}

function buildAdminIntroDetailKeyboard({ intro = null, backCallback = 'adm:intro:list' } = {}) {
  const rows = [];
  if (intro?.requester_user_id) {
    rows.push([{ text: '👤 Sender', callback_data: `adm:usr:open:${intro.requester_user_id}:all:0` }]);
  }
  if (intro?.target_user_id) {
    rows.push([{ text: '👤 Recipient', callback_data: `adm:usr:open:${intro.target_user_id}:all:0` }]);
  }
  rows.push([{ text: '🧾 Delivery', callback_data: `adm:intro:dlv:${intro?.intro_request_id || 0}` }]);
  rows.push([{ text: '↩️ Back to Intros', callback_data: backCallback }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function renderDeliveryListLine(item, index, page = 0, pageSize = 8) {
  const ordinal = page * pageSize + index + 1;
  const target = truncate(item?.recipientDisplayName || 'Unknown recipient', 18);
  const counterpart = truncate(`${item?.requesterDisplayName || 'Unknown'} → ${item?.targetDisplayName || 'Unknown'}`, 24);
  const state = formatShortStatus(item?.operatorBucket, 'failed');
  const errorSuffix = item?.lastErrorCode ? ` • ${truncate(item.lastErrorCode, 16)}` : '';
  return `${ordinal}. ${target} • ${state} • ${counterpart} • tries ${item?.attemptCount || 0}/${item?.maxAttempts || 0}${errorSuffix}`;
}

function buildAdminDeliveryText({ state = null, notice = null } = {}) {
  if (!state?.persistenceEnabled) {
    return ['🧾 Delivery', '', notice || '⚠️ Delivery data is unavailable in this environment.'].join('\n');
  }

  const lines = [
    '🧾 Delivery',
    '',
    `Segment: ${ADMIN_DELIVERY_SEGMENTS[state.segmentKey]?.label || 'All'} • page ${state.page + 1}`,
    state.introRequestId ? `Scoped to intro #${state.introRequestId}` : 'All intro notifications',
    `Visible in this segment: ${state.totalCount}`,
    `Failures ${state.counts?.failed || 0} • Retry due ${state.counts?.retryDue || 0} • Exhausted ${state.counts?.exhausted || 0} • Delivered ${state.counts?.sent || 0}`
  ];

  if (notice) {
    lines.push('', notice);
  }

  if (!state.records?.length) {
    lines.push('', 'No delivery records found for this segment yet.');
    return lines.join('\n');
  }

  lines.push('', 'Open a delivery record:');
  lines.push(...state.records.map((item, index) => renderDeliveryListLine(item, index, state.page, state.pageSize)));
  return lines.join('\n');
}

function buildAdminDeliveryKeyboard({ state = null } = {}) {
  const segmentKey = normalizeAdminDeliverySegment(state?.segmentKey);
  const introRequestId = state?.introRequestId || null;
  const rows = [...buildDeliverySegmentRows(segmentKey, introRequestId)];

  for (const item of state?.records || []) {
    const label = truncate(`${item?.recipientDisplayName || 'Unknown'} • ${item?.operatorBucket || 'failed'} • #${item?.notificationReceiptId}`, 42);
    const callback = introRequestId
      ? `adm:dlv:intro:${introRequestId}:open:${item.notificationReceiptId}`
      : `adm:dlv:open:${item.notificationReceiptId}:${segmentKey}:${state?.page || 0}`;
    rows.push([{ text: `🧾 ${label}`, callback_data: callback }]);
  }

  const pager = [];
  if (state?.hasPrev) {
    pager.push({ text: '◀️ Prev', callback_data: introRequestId ? `adm:dlv:intro:${introRequestId}:page:${segmentKey}:${Math.max(0, (state?.page || 0) - 1)}` : `adm:dlv:page:${segmentKey}:${Math.max(0, (state?.page || 0) - 1)}` });
  }
  if (state?.hasNext) {
    pager.push({ text: 'Next ▶️', callback_data: introRequestId ? `adm:dlv:intro:${introRequestId}:page:${segmentKey}:${(state?.page || 0) + 1}` : `adm:dlv:page:${segmentKey}:${(state?.page || 0) + 1}` });
  }
  if (pager.length) {
    rows.push(pager);
  }

  rows.push([{ text: '🔎 Search delivery', callback_data: 'adm:search:delivery' }]);
  rows.push([{ text: introRequestId ? '↩️ Back to Intro Detail' : '↩️ Back to Operations', callback_data: introRequestId ? `adm:intro:open:${introRequestId}:all:0` : 'adm:ops' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminDeliveryRecordText({ record = null, notice = null } = {}) {
  if (!record) {
    return ['🧾 Delivery Detail', '', notice || 'Delivery record not found.'].join('\n');
  }

  const lines = [
    '🧾 Delivery Detail',
    '',
    `Event: ${toDisplayValue(record.event_type)}`,
    `Intro: #${record.intro_request_id || '—'}`,
    `Recipient: ${toDisplayValue(record.recipient_display_name)}`,
    `Status: ${toDisplayValue(record.delivery_status)} • bucket ${toDisplayValue(record.operator_bucket)}`,
    `Attempts: ${record.attempt_count || 0}/${record.max_attempts || 0}`,
    `Next retry: ${formatDateTimeShort(record.next_attempt_at)}`,
    `Last attempt: ${formatDateTimeShort(record.last_attempt_at)}`,
    `Delivered: ${formatDateTimeShort(record.delivered_at)}`,
    `Created: ${formatDateTimeShort(record.created_at)}`,
    `Error: ${truncate(record.last_error_code || record.error_message, 180)}`
  ];

  if (notice) {
    lines.push('', notice);
  }
  return lines.join('\n');
}

function buildAdminDeliveryRecordKeyboard({ record = null, backCallback = 'adm:dlv' } = {}) {
  const rows = [];
  if (record?.recipient_user_id) {
    rows.push([{ text: '👤 Open user', callback_data: `adm:usr:open:${record.recipient_user_id}:all:0` }]);
  }
  if (record?.intro_request_id) {
    rows.push([{ text: '📄 Open intro', callback_data: `adm:intro:open:${record.intro_request_id}:all:0` }]);
  }
  rows.push([{ text: '↩️ Back to Delivery', callback_data: backCallback }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function renderUsersListLine(item, index, page = 0, pageSize = 8) {
  const ordinal = page * pageSize + index + 1;
  const name = truncate(item?.displayName || item?.linkedinName || item?.telegramUsername || `User ${item?.telegramUserId}`, 22);
  const linkedIn = compactBooleanLabel(item?.hasLinkedIn, 'LI', 'no LI');
  const listing = item?.visibilityStatus === 'listed' ? 'listed' : item?.profileId ? 'hidden' : 'no profile';
  const readiness = item?.profileState === 'active' ? 'ready' : 'incomplete';
  const intros = item?.pendingIntroCount ? `pending ${item.pendingIntroCount}` : 'no pending';
  return `${ordinal}. ${name} • ${linkedIn} • ${listing} • ${readiness} • ${intros}`;
}

function buildUsersListText({ state = null, notice = null } = {}) {
  if (!state?.persistenceEnabled) {
    return [
      '👥 Users',
      '',
      notice || '⚠️ Users data is unavailable in this environment.'
    ].join('\n');
  }

  const lines = [
    '👥 Users',
    '',
    `Segment: ${ADMIN_USER_SEGMENTS[state.segmentKey]?.label || 'All'} • page ${state.page + 1}`,
    countLine('Visible in this segment', state.totalCount),
    `Connected ${state.counts?.connected || 0} • No profile ${state.counts?.connectedNoProfile || 0} • Incomplete ${state.counts?.incomplete || 0}`,
    `Ready hidden ${state.counts?.readyNotListed || 0} • Ready no skills ${state.counts?.readyNoSkills || 0}`,
    `Listed ${state.counts?.listed || 0} • active ${state.counts?.listedActive || 0} • inactive ${state.counts?.listedInactive || 0}`,
    `No intros yet ${state.counts?.noIntroYet || 0} • Pending intros ${state.counts?.pendingIntros || 0} • Relinks ${state.counts?.relinks || 0}`
  ];

  if (notice) {
    lines.push('', notice);
  }

  if (!state.users?.length) {
    lines.push('', 'No users match this segment right now.');
    return lines.join('\n');
  }

  lines.push('', 'Open a user card from the quality bucket:');
  lines.push(...state.users.map((item, index) => renderUsersListLine(item, index, state.page, state.pageSize)));
  return lines.join('\n');
}

function buildUsersListKeyboard({ state = null } = {}) {
  const segmentKey = normalizeAdminUserSegment(state?.segmentKey);
  const rows = [...buildUsersSegmentRow(segmentKey)];

  for (const item of state?.users || []) {
    const label = truncate(item?.displayName || item?.linkedinName || item?.telegramUsername || `User ${item?.telegramUserId}`, 42);
    rows.push([{ text: `🪪 ${label}`, callback_data: `adm:usr:open:${item.userId}:${segmentKey}:${state?.page || 0}` }]);
  }

  const pager = [];
  if (state?.hasPrev) {
    pager.push({ text: '◀️ Prev', callback_data: `adm:usr:page:${segmentKey}:${Math.max(0, (state?.page || 0) - 1)}` });
  }
  if (state?.hasNext) {
    pager.push({ text: 'Next ▶️', callback_data: `adm:usr:page:${segmentKey}:${(state?.page || 0) + 1}` });
  }
  if (pager.length) {
    rows.push(pager);
  }

  rows.push([{ text: '🔎 Search users', callback_data: 'adm:search:users' }]);
  rows.push([{ text: state?.targetUserId ? '↩️ Back to User Card' : '↩️ Back to Operations', callback_data: state?.targetUserId ? `adm:usr:open:${state.targetUserId}:all:0` : 'adm:ops' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminUserCardText({ card = null, notice = null } = {}) {
  if (!card) {
    return ['🪪 User card', '', notice || '⚠️ User not found.'].join('\n');
  }

  const lines = [
    '🪪 User Card',
    '',
    `Telegram: ${toDisplayValue(card.telegram_username ? `@${card.telegram_username}` : null, `id ${card.telegram_user_id}`)}`,
    `Display name: ${toDisplayValue(card.display_name, card.linkedin_name || '—')}`,
    `LinkedIn: ${card.linkedin_sub ? `connected • ${toDisplayValue(card.linkedin_name)}` : 'not connected'}`,
    `Profile: ${profileReadinessLabel(card)}`,
    `Listing: ${card.profile_id ? formatShortStatus(card.visibility_status, 'hidden') : '—'}`,
    `Skills: ${card.skills?.length || 0}`,
    `Headline: ${truncate(card.headline_user, 72)}`,
    `Intros: sent ${card.intro_sent_count || 0} • received ${card.intro_received_count || 0} • pending ${card.pending_intro_count || 0}`,
    `Last active: ${formatDateTimeShort(card.last_seen_at)}`,
    `Quick links: message • intros • audit`
  ];

  if (card.operator_note_text) {
    lines.push('', `Operator note: ${truncate(card.operator_note_text, 140)}`);
    lines.push(`Note updated: ${formatDateTimeShort(card.operator_note_updated_at)}`);
  } else {
    lines.push('', 'Operator note: —');
  }

  if (notice) {
    lines.push('', notice);
  }

  return lines.join('\n');
}

function buildAdminUserCardKeyboard({ card = null, segmentKey = 'all', page = 0 } = {}) {
  const rows = [];
  if (card?.profile_id) {
    rows.push([{ text: '👁 View public card', callback_data: `adm:card:view:${card.user_id}:${segmentKey}:${page}` }]);
    if (card.profile_state === 'active' && card.visibility_status === 'listed') {
      rows.push([{ text: '🙈 Hide listing', callback_data: `adm:card:hide:${card.user_id}:${segmentKey}:${page}` }]);
    } else if (card.profile_state === 'active') {
      rows.push([{ text: '🌍 Unhide listing', callback_data: `adm:card:unhide:${card.user_id}:${segmentKey}:${page}` }]);
    }
  }
  rows.push([
    { text: '✍️ Note', callback_data: `adm:card:note:${card?.user_id || 0}:${segmentKey}:${page}` },
    { text: '✉️ Message', callback_data: `adm:card:msg:${card?.user_id || 0}:${segmentKey}:${page}` }
  ]);
  rows.push([
    { text: '📨 Intros', callback_data: `adm:card:intros:${card?.user_id || 0}` },
    { text: '📜 Audit', callback_data: `adm:card:audit:${card?.user_id || 0}` }
  ]);
  rows.push([{ text: '↩️ Back to Users', callback_data: `adm:usr:page:${segmentKey}:${page}` }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminUserPublicCardText({ card = null, notice = null } = {}) {
  if (!card?.profile_id) {
    return ['👁 Public card preview', '', notice || 'This user does not have a profile yet.'].join('\n');
  }

  const lines = [
    '👁 Public card preview',
    '',
    toDisplayValue(card.display_name, card.linkedin_name || 'Unnamed member'),
    truncate(card.headline_user, 120),
    '',
    `Company: ${toDisplayValue(card.company_user)}`,
    `City: ${toDisplayValue(card.city_user)}`,
    `Industry: ${toDisplayValue(card.industry_user)}`,
    `Skills: ${Array.isArray(card.skills) && card.skills.length ? card.skills.map((skill) => skill.skill_label).join(', ') : '—'}`,
    `LinkedIn URL: ${toDisplayValue(card.linkedin_public_url)}`,
    '',
    `About: ${truncate(card.about_user, 320)}`,
    '',
    `Visibility: ${toDisplayValue(card.visibility_status)} • State: ${toDisplayValue(card.profile_state)}`
  ];

  if (notice) {
    lines.push('', notice);
  }

  return lines.join('\n');
}

function buildAdminUserPublicCardKeyboard({ targetUserId, segmentKey = 'all', page = 0 } = {}) {
  return buildInlineKeyboard([
    [{ text: '↩️ Back to User Card', callback_data: `adm:usr:open:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

function directTemplateLabel(templateKey) {
  return ADMIN_DIRECT_MESSAGE_TEMPLATES[templateKey]?.label || 'Blank message';
}

function noticeTemplateLabel(templateKey) {
  return ADMIN_NOTICE_TEMPLATES[normalizeAdminNoticeTemplate(templateKey)]?.label || 'Notice template';
}

function broadcastTemplateLabel(templateKey) {
  return ADMIN_BROADCAST_TEMPLATES[normalizeAdminBroadcastTemplate(templateKey)]?.label || 'Broadcast template';
}

function formatOutboxTarget(record) {
  if (record?.event_type === 'direct') {
    return toDisplayValue(record?.target_display_name, record?.target_telegram_username ? `@${record.target_telegram_username}` : record?.target_telegram_user_id ? `id ${record.target_telegram_user_id}` : 'direct target');
  }
  return toDisplayValue(record?.audience_key, '—');
}

function buildAdminUserMessageText({ card = null, state = null, notice = null } = {}) {
  const draft = state?.draft || {};
  const targetLabel = toDisplayValue(card?.display_name, card?.linkedin_name || card?.telegram_username || draft?.targetDisplayName || draft?.targetLinkedinName || 'this user');
  const lines = [
    '✉️ Direct message',
    '',
    `Target: ${targetLabel}`,
    `Telegram: ${toDisplayValue(card?.telegram_username ? `@${card.telegram_username}` : null, card?.telegram_user_id ? `id ${card.telegram_user_id}` : draft?.targetTelegramUserId ? `id ${draft.targetTelegramUserId}` : '—')}`,
    `Template: ${directTemplateLabel(draft?.templateKey || 'blank')}`,
    `Updated: ${formatDateTimeShort(draft?.updatedAt)}`,
    '',
    draft?.body ? truncate(draft.body, 500) : 'No direct message draft yet.'
  ];
  if (notice) lines.push('', notice);
  return lines.join('\n');
}

function buildAdminUserMessageKeyboard({ targetUserId, segmentKey = 'all', page = 0 } = {}) {
  return buildInlineKeyboard([
    [{ text: '📌 Use template', callback_data: `adm:msg:tpl:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '✏️ Edit text', callback_data: `adm:msg:edit:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '👁 Preview', callback_data: `adm:msg:preview:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '🗑 Clear draft', callback_data: `adm:msg:clear:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '↩️ Back to User Card', callback_data: `adm:usr:open:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

function buildAdminDirectTemplatePickerText({ card = null, state = null, notice = null } = {}) {
  const targetLabel = toDisplayValue(card?.display_name, card?.linkedin_name || card?.telegram_username || state?.draft?.targetDisplayName || 'this user');
  const lines = [
    '📌 Direct message template',
    '',
    `Target: ${targetLabel}`,
    `Current template: ${directTemplateLabel(state?.draft?.templateKey || 'blank')}`
  ];
  if (notice) lines.push('', notice);
  return lines.join('\n');
}

function buildAdminDirectTemplatePickerKeyboard({ targetUserId, segmentKey = 'all', page = 0, state = null } = {}) {
  const current = state?.draft?.templateKey || 'blank';
  const rows = Object.values(ADMIN_DIRECT_MESSAGE_TEMPLATES).map((item) => ([{ text: `${current === item.key ? '✅' : '▫️'} ${item.label}`, callback_data: `adm:msg:tplset:${targetUserId}:${segmentKey}:${page}:${item.key}` }]));
  rows.push([{ text: '↩️ Back to Message', callback_data: `adm:card:msg:${targetUserId}:${segmentKey}:${page}` }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminDirectPreviewText({ card = null, state = null, notice = null } = {}) {
  const draft = state?.draft || {};
  const targetLabel = toDisplayValue(card?.display_name, card?.linkedin_name || card?.telegram_username || draft?.targetDisplayName || 'this user');
  const lines = [
    '👁 Direct message preview',
    '',
    `Target: ${targetLabel}`,
    `Template: ${directTemplateLabel(draft?.templateKey || 'blank')}`,
    '',
    draft?.body || 'No direct message draft yet.'
  ];
  if (notice) lines.push('', notice);
  return lines.join('\n');
}

function buildAdminDirectPreviewKeyboard({ targetUserId, segmentKey = 'all', page = 0 } = {}) {
  return buildInlineKeyboard([
    [{ text: '✅ Confirm send', callback_data: `adm:msg:confirm:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '↩️ Back to Message', callback_data: `adm:card:msg:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

function buildAdminUserNotePromptText({ card = null } = {}) {
  return [
    '✍️ Operator note',
    '',
    `Send the note text for ${toDisplayValue(card?.display_name, card?.linkedin_name || card?.telegram_username || 'this user')}.`,
    'The latest note will replace the previous one.',
    '',
    `Current note: ${truncate(card?.operator_note_text, 220)}`
  ].join('\n');
}

function buildAdminUserNotePromptKeyboard({ targetUserId, segmentKey = 'all', page = 0 } = {}) {
  return buildInlineKeyboard([
    [{ text: '↩️ Cancel', callback_data: `adm:card:cancelnote:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}



function buildAdminQualityText({ state = null, notice = null } = {}) {
  if (!state?.persistenceEnabled) {
    return ['🚩 Quality', '', notice || '⚠️ Quality data is unavailable in this environment.'].join('\n');
  }

  const lines = [
    '🚩 Quality',
    '',
    `Segment: ${ADMIN_QUALITY_SEGMENTS[state.segmentKey]?.label || 'Listed incomplete'} • page ${state.page + 1}`,
    countLine('Visible in this bucket', state.totalCount),
    `Listed incomplete ${state.counts?.listedIncomplete || 0} • Ready not listed ${state.counts?.readyNotListed || 0}`,
    `Missing fields ${state.counts?.missingCritical || 0} • Duplicates ${state.counts?.duplicateLike || 0} • Relinks ${state.counts?.relink || 0}`
  ];

  if (notice) {
    lines.push('', notice);
  }

  if (!state.users?.length) {
    lines.push('', 'No profiles match this quality bucket right now.');
    return lines.join('\n');
  }

  lines.push('', 'Open a user card from the quality bucket:');
  lines.push(...state.users.map((item, index) => `${state.page * state.pageSize + index + 1}. ${truncate(item?.displayName || item?.linkedinName || item?.telegramUsername || `User ${item?.telegramUserId}`, 22)} • ${qualityReasonLabel(item)} • skills ${item?.skillsCount || 0} • pending ${item?.pendingIntroCount || 0}`));
  return lines.join('\n');
}

function buildAdminQualityKeyboard({ state = null } = {}) {
  const segmentKey = normalizeAdminQualitySegment(state?.segmentKey);
  const rows = [...buildQualitySegmentRows(segmentKey)];

  for (const item of state?.users || []) {
    const label = truncate(item?.displayName || item?.linkedinName || item?.telegramUsername || `User ${item?.telegramUserId}`, 42);
    rows.push([{ text: `🪪 ${label}`, callback_data: `adm:usr:open:${item.userId}:all:0` }]);
  }

  const pager = [];
  if (state?.hasPrev) pager.push({ text: '◀️ Prev', callback_data: `adm:qual:page:${segmentKey}:${Math.max(0, (state?.page || 0) - 1)}` });
  if (state?.hasNext) pager.push({ text: 'Next ▶️', callback_data: `adm:qual:page:${segmentKey}:${(state?.page || 0) + 1}` });
  if (pager.length) rows.push(pager);

  rows.push([{ text: '🔎 Search users', callback_data: 'adm:search:users' }]);
  rows.push([{ text: state?.targetUserId ? '↩️ Back to User Card' : '↩️ Back to Operations', callback_data: state?.targetUserId ? `adm:usr:open:${state.targetUserId}:all:0` : 'adm:ops' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminAuditText({ state = null, notice = null } = {}) {
  if (!state?.persistenceEnabled) {
    return ['📜 Audit', '', notice || '⚠️ Audit data is unavailable in this environment.'].join('\n');
  }

  const lines = [
    '📜 Audit',
    '',
    `Segment: ${ADMIN_AUDIT_SEGMENTS[state.segmentKey]?.label || 'All'} • page ${state.page + 1}`,
    state.targetUserId ? `Scoped to user #${state.targetUserId}` : 'Recent operator and system actions',
    countLine('Visible in this segment', state.totalCount)
  ];
  if (notice) lines.push('', notice);
  if (!state.records?.length) {
    lines.push('', 'No audit events for this segment yet.');
    return lines.join('\n');
  }
  lines.push('', 'Recent events:');
  lines.push(...state.records.map((item, index) => `${state.page * state.pageSize + index + 1}. ${truncate(item.event_type, 18)} • ${truncate(item.summary || '', 36)} • ${formatAuditActor(item)} • ${formatDateTimeShort(item.created_at)}`));
  return lines.join('\n');
}

function buildAdminAuditKeyboard({ state = null } = {}) {
  const segmentKey = normalizeAdminAuditSegment(state?.segmentKey);
  const targetUserId = state?.targetUserId || null;
  const rows = buildAuditSegmentRows(segmentKey).map((row) => row.map((button) => ({
    ...button,
    callback_data: targetUserId
      ? `adm:audit:user:${targetUserId}:seg:${button.callback_data.split(':').pop()}`
      : button.callback_data
  })));
  for (const item of state?.records || []) {
    rows.push([{ text: `📄 ${truncate(item.event_type, 18)} • #${item.id}`, callback_data: targetUserId ? `adm:audit:user:${targetUserId}:open:${item.id}:${segmentKey}:${state?.page || 0}` : `adm:audit:open:${item.id}:${segmentKey}:${state?.page || 0}` }]);
  }
  const pager = [];
  if (state?.hasPrev) pager.push({ text: '◀️ Prev', callback_data: targetUserId ? `adm:audit:user:${targetUserId}:page:${segmentKey}:${Math.max(0, (state?.page || 0) - 1)}` : `adm:audit:page:${segmentKey}:${Math.max(0, (state?.page || 0) - 1)}` });
  if (state?.hasNext) pager.push({ text: 'Next ▶️', callback_data: targetUserId ? `adm:audit:user:${targetUserId}:page:${segmentKey}:${(state?.page || 0) + 1}` : `adm:audit:page:${segmentKey}:${(state?.page || 0) + 1}` });
  if (pager.length) rows.push(pager);
  rows.push([{ text: '🔎 Search audit', callback_data: 'adm:search:audit' }]);
  rows.push([{ text: targetUserId ? '↩️ Back to User Card' : '↩️ Back to System', callback_data: targetUserId ? `adm:usr:open:${targetUserId}:all:0` : 'adm:sys' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminAuditRecordText({ record = null, notice = null } = {}) {
  if (!record) {
    return ['📄 Audit detail', '', notice || 'Audit record not found.'].join('\n');
  }
  const detailText = record.detail ? JSON.stringify(record.detail, null, 2) : '—';
  const lines = [
    '📄 Audit detail',
    '',
    `Type: ${toDisplayValue(record.event_type)}`,
    `Actor: ${formatAuditActor(record)}`,
    `Target: ${formatAuditTarget(record)}`,
    `Created: ${formatDateTimeShort(record.created_at)}`,
    `Intro: ${record.intro_request_id || '—'}`,
    `Delivery: ${record.notification_receipt_id || '—'}`,
    '',
    `Summary: ${toDisplayValue(record.summary)}`,
    '',
    detailText
  ];
  if (notice) lines.push('', notice);
  return lines.join('\n');
}

function buildAdminAuditRecordKeyboard({ record = null, backCallback = 'adm:audit' } = {}) {
  const rows = [];
  if (record?.target_user_id) {
    rows.push([{ text: '👤 Open user', callback_data: `adm:usr:open:${record.target_user_id}:all:0` }]);
  }
  if (record?.intro_request_id) {
    rows.push([{ text: '📄 Open intro', callback_data: `adm:intro:open:${record.intro_request_id}:all:0` }]);
  }
  if (record?.detail?.outboxId) {
    rows.push([{ text: '📤 Open outbox', callback_data: `adm:outbox:open:${record.detail.outboxId}` }]);
  }
  rows.push([{ text: '↩️ Back to Audit', callback_data: backCallback }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function adminNoticeAudienceLabel(audienceKey) {
  return ADMIN_NOTICE_AUDIENCES[normalizeAdminNoticeAudience(audienceKey)]?.label || 'All users';
}

function adminBroadcastAudienceLabel(audienceKey) {
  return ADMIN_BROADCAST_AUDIENCES[normalizeAdminBroadcastAudience(audienceKey)]?.label || 'All connected';
}

function buildAdminNoticeText({ state = null, notice = null } = {}) {
  const current = state?.notice || { body: '', audienceKey: 'ALL', isActive: false };
  const lines = [
    '📣 Notice',
    '',
    `Status: ${current.isActive ? 'active' : 'inactive'}`,
    `Audience: ${adminNoticeAudienceLabel(current.audienceKey)}`,
    `Estimated visibility: ${state?.estimate || 0}`,
    `Updated: ${formatDateTimeShort(current.updatedAt)}`,
    '',
    current.body ? truncate(current.body, 500) : 'No notice text yet.'
  ];
  if (notice) {
    lines.push('', notice);
  }
  return lines.join('\n');
}

function buildAdminNoticeKeyboard({ state = null } = {}) {
  const current = state?.notice || { isActive: false };
  return buildInlineKeyboard([
    [{ text: '✏️ Edit text', callback_data: 'adm:not:edit' }],
    [{ text: '📌 Templates', callback_data: 'adm:not:tpl' }],
    [{ text: '🎯 Audience', callback_data: 'adm:not:aud' }],
    [{ text: '👁 Preview', callback_data: 'adm:not:preview' }],
    [{ text: current.isActive ? '⛔ Disable' : '✅ Activate', callback_data: current.isActive ? 'adm:not:off' : 'adm:not:on' }],
    [{ text: '↩️ Back to Communications', callback_data: 'adm:comms' }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

function buildAdminNoticeAudienceSurface({ state = null, notice = null } = {}) {
  const current = state?.notice || { audienceKey: 'ALL' };
  const rows = Object.values(ADMIN_NOTICE_AUDIENCES).map((item) => ([{
    text: `${normalizeAdminNoticeAudience(current.audienceKey) === item.key ? '✅' : '▫️'} ${item.label}`,
    callback_data: `adm:not:aud:${item.key}`
  }]));
  rows.push([{ text: '↩️ Back to Notice', callback_data: 'adm:not' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  const lines = ['🎯 Notice audience', '', `Current: ${adminNoticeAudienceLabel(current.audienceKey)}`];
  if (notice) {
    lines.push('', notice);
  }
  return { text: lines.join('\n'), reply_markup: buildInlineKeyboard(rows) };
}

function buildAdminNoticePreviewSurface({ state = null } = {}) {
  const current = state?.notice || { body: '', audienceKey: 'ALL', isActive: false };
  return {
    text: [
      '👁 Notice preview',
      '',
      `Audience: ${adminNoticeAudienceLabel(current.audienceKey)}`,
      '',
      current.body ? current.body : 'No notice text yet.'
    ].join('\n'),
    reply_markup: buildInlineKeyboard([
      [{ text: current.isActive ? '⛔ Disable' : '✅ Activate', callback_data: current.isActive ? 'adm:not:off' : 'adm:not:on' }],
      [{ text: '↩️ Back to Notice', callback_data: 'adm:not' }],
      [{ text: '🏠 Home', callback_data: 'home:root' }]
    ])
  };
}

function buildAdminBroadcastText({ state = null, notice = null } = {}) {
  const draft = state?.draft || { body: '', audienceKey: 'ALL_CONNECTED' };
  const latest = state?.latestRecord || null;
  const lines = [
    '📬 Broadcast',
    '',
    `Audience: ${adminBroadcastAudienceLabel(draft.audienceKey)}`,
    countLine('Estimated recipients', state?.estimate || 0),
    `Updated: ${formatDateTimeShort(draft.updatedAt)}`
  ];

  if (latest) {
    lines.push(`Latest job: #${latest.id} • ${formatShortStatus(latest.status, 'none')}`);
    lines.push(`Progress: ${latest.delivered_count || 0}/${latest.estimated_recipient_count ?? 0} delivered • ${latest.failed_count || 0} failed • ${latest.pending_count || 0} pending`);
    lines.push(`Batch: ${latest.batch_size || '—'} • cursor ${latest.cursor || 0}`);
    if (latest.last_error) {
      lines.push(`Last error: ${truncate(latest.last_error, 80)}`);
    }
  }

  lines.push('', draft.body ? truncate(draft.body, 420) : 'No broadcast draft yet.');
  if (notice) {
    lines.push('', notice);
  }
  return lines.join('\n');
}

function buildAdminBroadcastKeyboard({ state = null } = {}) {
  const latest = state?.latestRecord || null;
  const rows = [
    [{ text: '✏️ Edit text', callback_data: 'adm:bc:edit' }],
    [{ text: '📌 Templates', callback_data: 'adm:bc:tpl' }],
    [{ text: '🎯 Audience', callback_data: 'adm:bc:aud' }],
    [{ text: '👁 Preview', callback_data: 'adm:bc:preview' }],
    [{ text: '📨 Send', callback_data: 'adm:bc:send' }],
    [{ text: '🔄 Refresh', callback_data: 'adm:bc:refresh' }]
  ];
  if (latest?.failed_count > 0 || latest?.retry_due_count > 0 || latest?.exhausted_count > 0) {
    rows.push([{ text: '🧾 Failures', callback_data: `adm:bc:fail:${latest.id}:0` }]);
  }
  rows.push([{ text: '🗑 Clear draft', callback_data: 'adm:bc:clear' }]);
  rows.push([{ text: '🔎 Search outbox', callback_data: 'adm:search:outbox' }]);
  rows.push([{ text: '↩️ Back to Communications', callback_data: 'adm:comms' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminBroadcastAudienceSurface({ state = null, notice = null } = {}) {
  const draft = state?.draft || { audienceKey: 'ALL_CONNECTED' };
  const rows = Object.values(ADMIN_BROADCAST_AUDIENCES).map((item) => ([{
    text: `${normalizeAdminBroadcastAudience(draft.audienceKey) === item.key ? '✅' : '▫️'} ${item.label}`,
    callback_data: `adm:bc:aud:${item.key}`
  }]));
  rows.push([{ text: '↩️ Back to Broadcast', callback_data: 'adm:bc' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  const lines = ['🎯 Broadcast audience', '', `Current: ${adminBroadcastAudienceLabel(draft.audienceKey)}`];
  if (notice) {
    lines.push('', notice);
  }
  return { text: lines.join('\n'), reply_markup: buildInlineKeyboard(rows) };
}

function buildAdminBroadcastPreviewSurface({ state = null, notice = null } = {}) {
  const draft = state?.draft || { body: '', audienceKey: 'ALL_CONNECTED' };
  const lines = [
    '👁 Broadcast preview',
    '',
    `Audience: ${adminBroadcastAudienceLabel(draft.audienceKey)}`,
    `Estimated recipients: ${state?.estimate || 0}`,
    '',
    draft.body ? draft.body : 'No broadcast draft yet.'
  ];
  if (notice) {
    lines.push('', notice);
  }
  return {
    text: lines.join('\n'),
    reply_markup: buildInlineKeyboard([
      [{ text: '✅ Confirm send', callback_data: 'adm:bc:confirm' }],
      [{ text: '↩️ Back to Broadcast', callback_data: 'adm:bc' }],
      [{ text: '🏠 Home', callback_data: 'home:root' }]
    ])
  };
}

function buildAdminTemplatesText({ state = null, notice = null } = {}) {
  const noticeTemplates = state?.noticeTemplates || [];
  const broadcastTemplates = state?.broadcastTemplates || [];
  const directTemplates = state?.directTemplates || [];
  const lines = [
    '📌 Templates',
    '',
    `Notice templates: ${noticeTemplates.length}`,
    `Broadcast templates: ${broadcastTemplates.length}`,
    `Direct templates: ${directTemplates.length}`,
    '',
    'Use notice templates for compact banners and broadcast templates for larger nudges. Direct-message templates stay available inside User Card → Message.'
  ];
  if (notice) lines.push('', notice);
  return lines.join('\n');
}

function buildAdminTemplatesKeyboard() {
  return buildInlineKeyboard([
    [{ text: '📣 Notice templates', callback_data: 'adm:tpl:not' }],
    [{ text: '📬 Broadcast templates', callback_data: 'adm:tpl:bc' }],
    [{ text: '✉️ Direct templates', callback_data: 'adm:tpl:direct' }],
    [{ text: '↩️ Back to Communications', callback_data: 'adm:comms' }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

function buildAdminNoticeTemplatePickerText({ state = null, templates = [], notice = null } = {}) {
  const currentAudience = adminNoticeAudienceLabel(state?.notice?.audienceKey || 'ALL');
  const lines = [
    '📣 Notice templates',
    '',
    `Current audience: ${currentAudience}`,
    `Current estimate: ${state?.estimate || 0}`,
    '',
    'Pick a template to prefill the notice text and suggested audience.'
  ];
  if (templates.length) {
    lines.push('', ...templates.map((item, index) => `${index + 1}. ${item.label} → ${adminNoticeAudienceLabel(item.audienceKey)}`));
  }
  if (notice) lines.push('', notice);
  return lines.join('\n');
}

function buildAdminNoticeTemplatePickerKeyboard({ templates = [] } = {}) {
  const rows = templates.map((item) => ([{ text: `📌 ${item.label}`, callback_data: `adm:not:tpl:${item.key}` }]));
  rows.push([{ text: '↩️ Back to Notice', callback_data: 'adm:not' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminBroadcastTemplatePickerText({ state = null, templates = [], notice = null } = {}) {
  const currentAudience = adminBroadcastAudienceLabel(state?.draft?.audienceKey || 'ALL_CONNECTED');
  const lines = [
    '📬 Broadcast templates',
    '',
    `Current audience: ${currentAudience}`,
    `Current estimate: ${state?.estimate || 0}`,
    '',
    'Pick a template to prefill the broadcast body and suggested audience.'
  ];
  if (templates.length) {
    lines.push('', ...templates.map((item, index) => `${index + 1}. ${item.label} → ${adminBroadcastAudienceLabel(item.audienceKey)}`));
  }
  if (notice) lines.push('', notice);
  return lines.join('\n');
}

function buildAdminBroadcastTemplatePickerKeyboard({ templates = [] } = {}) {
  const rows = templates.map((item) => ([{ text: `📌 ${item.label}`, callback_data: `adm:bc:tpl:${item.key}` }]));
  rows.push([{ text: '↩️ Back to Broadcast', callback_data: 'adm:bc' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminOutboxText({ records = [], notice = null } = {}) {
  const lines = ['📤 Outbox', ''];
  if (!records.length) {
    lines.push('No communications records yet.');
    lines.push('Once you activate a notice, send a broadcast, or send a direct message, it will appear here.');
  } else {
    lines.push('Recent records:');
    lines.push(...records.map((item, index) => `${index + 1}. ${item.event_type} • ${truncate(formatOutboxTarget(item), 20)} • ${formatShortStatus(item.status, 'draft')} • ok ${item.delivered_count ?? 0}/${item.estimated_recipient_count ?? '—'} • fail ${item.failed_count ?? 0} • ${formatDateTimeShort(item.sent_at || item.created_at)}`));
  }
  if (notice) {
    lines.push('', notice);
  }
  return lines.join('\n');
}

function buildAdminOutboxKeyboard({ records = [] } = {}) {
  const rows = records.map((item) => ([{ text: `📄 ${item.event_type} • #${item.id}`, callback_data: `adm:outbox:open:${item.id}` }]));
  rows.push([{ text: '🔎 Search outbox', callback_data: 'adm:search:outbox' }]);
  rows.push([{ text: '↩️ Back to Communications', callback_data: 'adm:comms' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminOutboxRecordText({ record = null, notice = null } = {}) {
  if (!record) {
    return ['📄 Outbox record', '', notice || 'Record not found.'].join('\n');
  }
  const lines = [
    '📄 Outbox record',
    '',
    `Type: ${record.event_type}`,
    `Status: ${record.status}`,
    `Audience: ${record.audience_key || '—'}`,
    `Target: ${formatOutboxTarget(record)}`,
    `Estimated: ${record.estimated_recipient_count ?? '—'}`,
    `Delivered: ${record.delivered_count ?? '—'}`,
    `Failed: ${record.failed_count ?? '—'}`,
    `Pending: ${record.pending_count ?? '—'}`,
    `Batch size: ${record.batch_size ?? '—'}`,
    `Cursor: ${record.cursor ?? '—'}`,
    `Started: ${formatDateTimeShort(record.started_at)}`,
    `Finished: ${formatDateTimeShort(record.finished_at)}`,
    `Created: ${formatDateTimeShort(record.created_at)}`,
    `Sent: ${formatDateTimeShort(record.sent_at)}`,
    '',
    record.body || '—'
  ];
  if (record?.last_error) {
    lines.push('', `Last error: ${truncate(record.last_error, 220)}`);
  }
  if (notice) {
    lines.push('', notice);
  }
  return lines.join('\n');
}

function buildAdminOutboxRecordKeyboard({ record = null } = {}) {
  const rows = [];
  if (record?.target_user_id) {
    rows.push([{ text: '👤 Open user', callback_data: `adm:usr:open:${record.target_user_id}:all:0` }]);
  }
  if (record?.event_type === 'broadcast' && ((record?.failed_count || 0) > 0 || (record?.retry_due_count || 0) > 0 || (record?.exhausted_count || 0) > 0)) {
    rows.push([{ text: '🧾 Open failures', callback_data: `adm:bc:fail:${record.id}:0` }]);
  }
  rows.push([{ text: '↩️ Back to Outbox', callback_data: 'adm:outbox' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminBroadcastFailuresText({ state = null, notice = null } = {}) {
  if (!state?.record) {
    return ['🧾 Broadcast failures', '', notice || 'No broadcast record found.'].join('\n');
  }
  const lines = [
    '🧾 Broadcast failures',
    '',
    `Broadcast: #${state.record.id} • ${state.record.status}`,
    `Failures: ${state.totalCount || 0} • page ${(state.page || 0) + 1}`
  ];
  if (!state.items?.length) {
    lines.push('', 'No failed or retry-due recipients for this broadcast.');
  } else {
    lines.push('', 'Recipients needing attention:');
    lines.push(...state.items.map((item, index) => `${(state.page || 0) * (state.pageSize || 10) + index + 1}. ${truncate(item.target_display_name || item.target_telegram_username || `id ${item.target_telegram_user_id}`, 28)} • ${item.status} • attempts ${item.attempts} • ${truncate(item.last_error, 64)}`));
  }
  if (notice) lines.push('', notice);
  return lines.join('\n');
}

function buildAdminBroadcastFailuresKeyboard({ state = null } = {}) {
  const rows = [];
  for (const item of state?.items || []) {
    const label = truncate(item.target_display_name || item.target_telegram_username || `id ${item.target_telegram_user_id}`, 42);
    rows.push([{ text: `👤 ${label}`, callback_data: `adm:usr:open:${item.target_user_id}:all:0` }]);
  }
  const pager = [];
  if (state?.hasPrev) pager.push({ text: '◀️ Prev', callback_data: `adm:bc:fail:${state.outboxId}:${Math.max(0, (state.page || 0) - 1)}` });
  if (state?.hasNext) pager.push({ text: 'Next ▶️', callback_data: `adm:bc:fail:${state.outboxId}:${(state.page || 0) + 1}` });
  if (pager.length) rows.push(pager);
  rows.push([{ text: '↩️ Back to Outbox record', callback_data: `adm:outbox:open:${state?.outboxId || 0}` }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminCommsEditPromptSurface({ title, currentValue, cancelCallback }) {
  return {
    text: [title, '', 'Send the new text in the next message.', '', `Current value: ${truncate(currentValue, 280)}`].join('\n'),
    reply_markup: buildInlineKeyboard([
      [{ text: '↩️ Cancel', callback_data: cancelCallback }],
      [{ text: '🏠 Home', callback_data: 'home:root' }]
    ])
  };
}

function boolLine(label, value) {
  return `${label}: ${value ? 'yes' : 'no'}`;
}

function renderAdminSearchLine(scopeKey, item, index, page = 0, pageSize = 8) {
  const ordinal = page * pageSize + index + 1;
  switch (normalizeAdminSearchScope(scopeKey)) {
    case 'users':
      return `${ordinal}. ${truncate(item.displayName || item.linkedinName || item.telegramUsername || `User ${item.telegramUserId}`, 26)} • ${item.hasLinkedIn ? 'LI' : 'no LI'} • ${item.visibilityStatus === 'listed' ? 'listed' : item.profileState === 'active' ? 'hidden' : 'incomplete'} • pending ${item.pendingIntroCount || 0}`;
    case 'intros':
      return `${ordinal}. ${truncate(item.requesterDisplayName, 18)} → ${truncate(item.targetDisplayName, 18)} • ${formatShortStatus(item.status, 'pending')} • ${formatDateTimeShort(item.updatedAt || item.createdAt)}`;
    case 'delivery':
      return `${ordinal}. ${truncate(item.recipientDisplayName, 18)} • ${formatShortStatus(item.operatorBucket, 'failed')} • ${truncate(item.errorMessage || item.lastErrorCode || '', 28)}`;
    case 'outbox':
      return `${ordinal}. ${item.event_type} • ${truncate(formatOutboxTarget(item), 20)} • ${formatShortStatus(item.status, 'draft')} • ${formatDateTimeShort(item.sent_at || item.created_at)}`;
    case 'audit':
    default:
      return `${ordinal}. ${truncate(item.event_type, 18)} • ${truncate(item.summary || '', 28)} • ${formatDateTimeShort(item.created_at)}`;
  }
}

function buildAdminSearchPromptText({ scopeKey, currentQuery = '', notice = null } = {}) {
  const lines = [
    `🔎 ${adminSearchScopeLabel(scopeKey)}`,
    '',
    'Send your search query in the next message.',
    '',
    `Current query: ${currentQuery || '—'}`
  ];
  if (notice) lines.push('', notice);
  return lines.join('\n');
}

function buildAdminSearchPromptKeyboard({ scopeKey } = {}) {
  return buildInlineKeyboard([
    [{ text: '↩️ Cancel', callback_data: adminSearchBackCallback(scopeKey) }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

function buildAdminSearchResultsText({ scopeKey, state = null, notice = null } = {}) {
  const lines = [
    `🔎 ${adminSearchScopeLabel(scopeKey)} results`,
    '',
    `Query: ${state?.queryText || '—'}`,
    `Results: ${state?.totalCount || 0} • page ${(state?.page || 0) + 1}`
  ];
  if (notice) lines.push('', notice);
  if (!state?.results?.length) {
    lines.push('', state?.queryText ? 'No matches found for this query.' : 'Run a search to see matching records.');
    return lines.join('\n');
  }
  lines.push('', 'Open a result:');
  lines.push(...state.results.map((item, index) => renderAdminSearchLine(scopeKey, item, index, state?.page || 0, state?.pageSize || 8)));
  return lines.join('\n');
}

function buildAdminSearchResultsKeyboard({ scopeKey, state = null } = {}) {
  const rows = [];
  for (const item of state?.results || []) {
    let callback = 'adm:home';
    let label = 'Open';
    if (scopeKey === 'users') {
      callback = `adm:usr:open:${item.userId}:all:0`;
      label = `🪪 ${truncate(item.displayName || item.linkedinName || item.telegramUsername || `User ${item.telegramUserId}`, 42)}`;
    } else if (scopeKey === 'intros') {
      callback = `adm:intro:open:${item.introRequestId}:all:0`;
      label = `📄 ${truncate(`${item.requesterDisplayName || 'Unknown'} → ${item.targetDisplayName || 'Unknown'}`, 42)}`;
    } else if (scopeKey === 'delivery') {
      callback = `adm:dlv:open:${item.notificationReceiptId}:all:0`;
      label = `🧾 ${truncate(item.recipientDisplayName || `Receipt ${item.notificationReceiptId}`, 42)}`;
    } else if (scopeKey === 'outbox') {
      callback = `adm:outbox:open:${item.id}`;
      label = `📤 ${truncate(`${item.event_type} • ${formatOutboxTarget(item)}`, 42)}`;
    } else if (scopeKey === 'audit') {
      callback = `adm:audit:open:${item.id}:all:0`;
      label = `📜 ${truncate(`${item.event_type} • ${item.summary || ''}`, 42)}`;
    }
    rows.push([{ text: label, callback_data: callback }]);
  }
  const pager = [];
  if (state?.hasPrev) pager.push({ text: '◀️ Prev', callback_data: `adm:search:${scopeKey}:page:${Math.max(0, (state?.page || 0) - 1)}` });
  if (state?.hasNext) pager.push({ text: 'Next ▶️', callback_data: `adm:search:${scopeKey}:page:${(state?.page || 0) + 1}` });
  if (pager.length) rows.push(pager);
  rows.push([{ text: `🔎 Search again`, callback_data: `adm:search:${scopeKey}` }]);
  rows.push([{ text: '↩️ Back', callback_data: adminSearchBackCallback(scopeKey) }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}


function buildHealthText({ step = 'STEP039' } = {}) {
  const flags = getPublicFlags();
  const operators = getOperatorConfig();
  const runtimeGuards = getRuntimeGuardConfig();
  return [
    '🩺 Health',
    '',
    `Current step: ${step}`,
    boolLine('Database configured', flags.dbConfigured),
    boolLine('LinkedIn configured', flags.linkedInConfigured),
    boolLine('Telegram configured', flags.telegramConfigured),
    boolLine('Webhook secret configured', flags.telegramWebhookSecretConfigured),
    boolLine('Notification receipts configured', flags.notificationReceiptsConfigured),
    boolLine('Notification retry configured', flags.notificationRetryConfigured),
    boolLine('Notification ops configured', flags.notificationOpsConfigured),
    boolLine('Operator diagnostics configured', flags.operatorDiagnosticsSurfaceConfigured),
    `Operators allowlisted: ${operators.operatorTelegramUserIds.length}`,
    `Update dedupe TTL: ${runtimeGuards.updateDedupeTtlSeconds}s`,
    `Action throttle: ${runtimeGuards.actionThrottleSeconds}s`
  ].join('\n');
}

function buildHealthKeyboard() {
  return buildInlineKeyboard([
    [{ text: '🔁 Retry diagnostics', callback_data: 'adm:retry' }],
    [{ text: '👮 Operators', callback_data: 'adm:opscope' }],
    [{ text: '↩️ Back to System', callback_data: 'adm:sys' }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

function buildOperatorsText({ summary = null } = {}) {
  const operators = getOperatorConfig();
  const lines = [
    '👮 Operators',
    '',
    `Allowlisted operator accounts: ${operators.operatorTelegramUserIds.length}`,
    countLine('Recent audit events', summary?.recentAuditEvents || 0),
    countLine('Retry due', summary?.retryDue || 0),
    countLine('Exhausted', summary?.exhausted || 0)
  ];

  if (!operators.operatorTelegramUserIds.length) {
    lines.push('No operator Telegram user ids are configured.');
  } else {
    lines.push('', 'Operator Telegram user ids:');
    lines.push(...operators.operatorTelegramUserIds.map((value) => `• ${value}`));
  }

  return lines.join('\n');
}

function buildOperatorsKeyboard() {
  return buildInlineKeyboard([
    [{ text: '🩺 Health', callback_data: 'adm:health' }],
    [{ text: '↩️ Back to System', callback_data: 'adm:sys' }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

function buildOperatorOnlyText() {
  return [
    '⚠️ Operator only',
    '',
    'This area is only available to the operator account.'
  ].join('\n');
}

function buildOperatorOnlyKeyboard() {
  return buildInlineKeyboard([
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

export function createAdminSurfaceBuilders({ currentStep = 'STEP039' } = {}) {
  return {
    buildAdminHomeSurface: async ({ summary = null } = {}) => ({
      text: buildAdminHomeText({ summary }),
      reply_markup: buildAdminHomeKeyboard()
    }),
    buildAdminOperationsSurface: async ({ summary = null } = {}) => ({
      text: buildOperationsHubText({ summary }),
      reply_markup: buildOperationsHubKeyboard()
    }),
    buildAdminCommunicationsSurface: async ({ state = null, notice = null } = {}) => ({
      text: buildCommunicationsHubText({ state, notice }),
      reply_markup: buildCommunicationsHubKeyboard()
    }),
    buildAdminSystemSurface: async ({ summary = null } = {}) => ({
      text: buildSystemHubText({ summary }),
      reply_markup: buildSystemHubKeyboard()
    }),
    buildAdminHealthSurface: async () => ({
      text: buildHealthText({ step: currentStep }),
      reply_markup: buildHealthKeyboard()
    }),
    buildAdminOperatorsSurface: async ({ summary = null } = {}) => ({
      text: buildOperatorsText({ summary }),
      reply_markup: buildOperatorsKeyboard()
    }),
    buildAdminUsersSurface: async ({ state, notice = null }) => ({
      text: buildUsersListText({ state, notice }),
      reply_markup: buildUsersListKeyboard({ state })
    }),
    buildAdminUserCardSurface: async ({ card, segmentKey = 'all', page = 0, notice = null }) => ({
      text: buildAdminUserCardText({ card, notice }),
      reply_markup: buildAdminUserCardKeyboard({ card, segmentKey, page })
    }),
    buildAdminUserPublicCardSurface: async ({ card, segmentKey = 'all', page = 0, notice = null }) => ({
      text: buildAdminUserPublicCardText({ card, notice }),
      reply_markup: buildAdminUserPublicCardKeyboard({ targetUserId: card?.user_id || 0, segmentKey, page })
    }),
    buildAdminUserMessageSurface: async ({ card, state = null, segmentKey = 'all', page = 0, notice = null }) => ({
      text: buildAdminUserMessageText({ card, state, notice }),
      reply_markup: buildAdminUserMessageKeyboard({ targetUserId: card?.user_id || state?.draft?.targetUserId || 0, segmentKey, page })
    }),
    buildAdminUserNotePromptSurface: async ({ card, segmentKey = 'all', page = 0 }) => ({
      text: buildAdminUserNotePromptText({ card }),
      reply_markup: buildAdminUserNotePromptKeyboard({ targetUserId: card?.user_id || 0, segmentKey, page })
    }),
    buildAdminIntrosSurface: async ({ state, notice = null }) => ({
      text: buildAdminIntrosText({ state, notice }),
      reply_markup: buildAdminIntrosKeyboard({ state })
    }),
    buildAdminIntroDetailSurface: async ({ intro, notificationSummary = null, recentReceipts = [], backCallback = 'adm:intro:list', notice = null }) => ({
      text: buildAdminIntroDetailText({ intro, notificationSummary, recentReceipts, notice }),
      reply_markup: buildAdminIntroDetailKeyboard({ intro, backCallback })
    }),
    buildAdminDeliverySurface: async ({ state, notice = null }) => ({
      text: buildAdminDeliveryText({ state, notice }),
      reply_markup: buildAdminDeliveryKeyboard({ state })
    }),
    buildAdminDeliveryRecordSurface: async ({ record = null, backCallback = 'adm:dlv', notice = null }) => ({
      text: buildAdminDeliveryRecordText({ record, notice }),
      reply_markup: buildAdminDeliveryRecordKeyboard({ record, backCallback })
    }),
    buildAdminQualitySurface: async ({ state, notice = null }) => ({
      text: buildAdminQualityText({ state, notice }),
      reply_markup: buildAdminQualityKeyboard({ state })
    }),
    buildAdminAuditSurface: async ({ state, notice = null }) => ({
      text: buildAdminAuditText({ state, notice }),
      reply_markup: buildAdminAuditKeyboard({ state })
    }),
    buildAdminAuditRecordSurface: async ({ record = null, backCallback = 'adm:audit', notice = null }) => ({
      text: buildAdminAuditRecordText({ record, notice }),
      reply_markup: buildAdminAuditRecordKeyboard({ record, backCallback })
    }),
    buildAdminNoticeSurface: async ({ state = null, notice = null } = {}) => ({
      text: buildAdminNoticeText({ state, notice }),
      reply_markup: buildAdminNoticeKeyboard({ state })
    }),
    buildAdminNoticeAudienceSurface: async ({ state = null, notice = null } = {}) => buildAdminNoticeAudienceSurface({ state, notice }),
    buildAdminNoticePreviewSurface: async ({ state = null } = {}) => buildAdminNoticePreviewSurface({ state }),
    buildAdminBroadcastSurface: async ({ state = null, notice = null } = {}) => ({
      text: buildAdminBroadcastText({ state, notice }),
      reply_markup: buildAdminBroadcastKeyboard({ state })
    }),
    buildAdminBroadcastAudienceSurface: async ({ state = null, notice = null } = {}) => buildAdminBroadcastAudienceSurface({ state, notice }),
    buildAdminBroadcastPreviewSurface: async ({ state = null, notice = null } = {}) => buildAdminBroadcastPreviewSurface({ state, notice }),
    buildAdminTemplatesSurface: async ({ state = null, notice = null } = {}) => ({
      text: buildAdminTemplatesText({ state, notice }),
      reply_markup: buildAdminTemplatesKeyboard()
    }),
    buildAdminNoticeTemplatePickerSurface: async ({ state = null, templates = [], notice = null } = {}) => ({
      text: buildAdminNoticeTemplatePickerText({ state, templates, notice }),
      reply_markup: buildAdminNoticeTemplatePickerKeyboard({ templates })
    }),
    buildAdminBroadcastTemplatePickerSurface: async ({ state = null, templates = [], notice = null } = {}) => ({
      text: buildAdminBroadcastTemplatePickerText({ state, templates, notice }),
      reply_markup: buildAdminBroadcastTemplatePickerKeyboard({ templates })
    }),
    buildAdminBroadcastFailuresSurface: async ({ state = null, notice = null } = {}) => ({
      text: buildAdminBroadcastFailuresText({ state, notice }),
      reply_markup: buildAdminBroadcastFailuresKeyboard({ state })
    }),
    buildAdminOutboxSurface: async ({ records = [], notice = null } = {}) => ({
      text: buildAdminOutboxText({ records, notice }),
      reply_markup: buildAdminOutboxKeyboard({ records })
    }),
    buildAdminOutboxRecordSurface: async ({ record = null, notice = null } = {}) => ({
      text: buildAdminOutboxRecordText({ record, notice }),
      reply_markup: buildAdminOutboxRecordKeyboard({ record })
    }),
    buildAdminDirectTemplatePickerSurface: async ({ card, state = null, segmentKey = 'all', page = 0, notice = null } = {}) => ({
      text: buildAdminDirectTemplatePickerText({ card, state, notice }),
      reply_markup: buildAdminDirectTemplatePickerKeyboard({ targetUserId: card?.user_id || state?.draft?.targetUserId || 0, segmentKey, page, state })
    }),
    buildAdminDirectPreviewSurface: async ({ card, state = null, segmentKey = 'all', page = 0, notice = null } = {}) => ({
      text: buildAdminDirectPreviewText({ card, state, notice }),
      reply_markup: buildAdminDirectPreviewKeyboard({ targetUserId: card?.user_id || state?.draft?.targetUserId || 0, segmentKey, page })
    }),
    buildAdminSearchPromptSurface: async ({ scopeKey = 'users', currentQuery = '', notice = null } = {}) => ({
      text: buildAdminSearchPromptText({ scopeKey, currentQuery, notice }),
      reply_markup: buildAdminSearchPromptKeyboard({ scopeKey })
    }),
    buildAdminSearchResultsSurface: async ({ scopeKey = 'users', state = null, notice = null } = {}) => ({
      text: buildAdminSearchResultsText({ scopeKey, state, notice }),
      reply_markup: buildAdminSearchResultsKeyboard({ scopeKey, state })
    }),
    buildAdminCommsEditPromptSurface: async ({ title, currentValue = '', cancelCallback }) => buildAdminCommsEditPromptSurface({ title, currentValue, cancelCallback }),
    buildAdminPlaceholderSurface: async ({ title, description, backCallback, nextStep }) => ({
      text: buildPlaceholderText({ title, description, nextStep }),
      reply_markup: buildDetailFooter(backCallback)
    }),
    buildOperatorOnlySurface: async () => ({
      text: buildOperatorOnlyText(),
      reply_markup: buildOperatorOnlyKeyboard()
    })
  };
}
