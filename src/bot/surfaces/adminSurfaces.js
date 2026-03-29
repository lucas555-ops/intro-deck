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
  return ADMIN_SEARCH_SCOPES[normalizeAdminSearchScope(scopeKey)]?.label || 'Поиск';
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
    return 'профиля ещё нет';
  }
  if (card.profile_state === 'active' && card.visibility_status === 'listed') {
    return 'готов • опубликован';
  }
  if (card.profile_state === 'active') {
    return 'готов • скрыт';
  }
  return 'не завершён';
}

function buildAdminStatusLabel(value, fallback = 'нет') {
  const normalized = typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : fallback;
  switch (normalized) {
    case 'none': return 'нет';
    case 'active': return 'активен';
    case 'inactive': return 'неактивен';
    case 'ready': return 'готов';
    case 'empty': return 'пусто';
    case 'draft': return 'черновик';
    case 'sending': return 'отправляется';
    case 'sent': return 'отправлен';
    case 'partial': return 'частично';
    case 'failed': return 'ошибка';
    case 'sent with failures':
    case 'sent_with_failures': return 'отправлен с ошибками';
    default: return formatShortStatus(value, fallback);
  }
}

function buildAdminHomeText({ summary = null } = {}) {
  return [
    '👑 Админка',
    '',
    'Компактный founder/operator overview.',
    '',
    'Воронка:',
    countLine('Пользователи всего', summary?.totalUsers || 0),
    countLine('Подключили LinkedIn', summary?.connectedUsers || 0),
    countLine('Начали профиль', summary?.profileStartedUsers || 0),
    countLine('Готовые профили', summary?.readyProfiles || 0),
    countLine('Готовые, но не опубликованы', summary?.readyNotListed || 0),
    countLine('Опубликованы', summary?.listedUsers || 0),
    countLine('Активны в каталоге', summary?.listedActiveUsers || 0),
    countLine('Без интро', summary?.noIntroYet || 0),
    countLine('Получили первое интро', summary?.firstIntroUsers || 0),
    countLine('Получили принятое интро', summary?.acceptedIntroUsers || 0),
    '',
    'Сводка 24ч / 7д:',
    `Новые пользователи +${summary?.newUsers24h || 0} / +${summary?.newUsers7d || 0}`,
    `Подключили LinkedIn +${summary?.connected24h || 0} / +${summary?.connected7d || 0}`,
    `Опубликованы +${summary?.listed24h || 0} / +${summary?.listed7d || 0}`,
    `Новые интро ${summary?.intros24h || 0} / ${summary?.intros7d || 0}`,
    `Принятые ${summary?.accepted7d || 0} • Отклонённые ${summary?.declined7d || 0}`,
    `Pending >24ч: ${summary?.pendingOlder24h || 0}`,
    `Ошибки доставки ${summary?.failures24h || 0} / ${summary?.failures7d || 0}`,
    `Рассылки ${summary?.broadcasts7d || 0}/7д • ЛС ${summary?.directMessages7d || 0}/7д`,
    '',
    `Уведомление: ${summary?.activeNotice ? 'активно' : 'неактивно'}`,
    `Последняя рассылка: ${buildAdminStatusLabel(summary?.latestBroadcastStatus, 'нет')}`
  ].join('\n');
}

function buildAdminHomeKeyboard({ summary = null } = {}) {
  return buildInlineKeyboard([
    [{ text: '🧰 Операции', callback_data: 'adm:ops' }],
    [{ text: '💬 Коммуникации', callback_data: 'adm:comms' }],
    [{ text: '💳 Монетизация', callback_data: 'adm:money' }],
    [{ text: '⚙️ Система', callback_data: 'adm:sys' }],
    [
      { text: `🔗 LinkedIn: ${summary?.connectedUsers || 0}`, callback_data: 'adm:home:funnel:connected' },
      { text: `🧩 Без профиля: ${summary?.profileStartedUsers != null ? Math.max(0, (summary?.connectedUsers || 0) - (summary?.profileStartedUsers || 0)) : 0}`, callback_data: 'adm:home:funnel:noprofile' }
    ],
    [
      { text: `✅ Не опубликованы: ${summary?.readyNotListed || 0}`, callback_data: 'adm:home:funnel:ready_not_listed' },
      { text: `📇 Опубликованы: ${summary?.listedUsers || 0}`, callback_data: 'adm:home:funnel:listed' }
    ],
    [
      { text: `📭 Без интро: ${summary?.noIntroYet || 0}`, callback_data: 'adm:home:funnel:nointro' },
      { text: `🤝 Принятые: ${summary?.acceptedIntroUsers || 0}`, callback_data: 'adm:home:funnel:accepted' }
    ],
    [
      { text: `📨 Первое интро: ${summary?.firstIntroUsers || 0}`, callback_data: 'adm:home:funnel:firstintro' },
      { text: `🧾 Ошибки доставки: ${summary?.failedDeliveries || 0}`, callback_data: 'adm:home:funnel:dlv_fail' }
    ],
    [
      { text: '👥 Пользователи', callback_data: 'adm:usr:list' },
      { text: '📨 Интро', callback_data: 'adm:intro:list' }
    ],
    [
      { text: '📣 Уведомление', callback_data: 'adm:not' },
      { text: '📬 Рассылка', callback_data: 'adm:bc' }
    ],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}


function buildAdminMonetizationText({ state = null, notice = null } = {}) {
  const summary = state?.summary || {};
  const pricing = state?.pricing || {};
  const recentReceipts = Array.isArray(state?.recentReceipts) ? state.recentReceipts.slice(0, 6) : [];
  const lines = [
    '💳 Монетизация',
    '',
    `Pro активные: ${summary.activePro || 0} • истёкшие: ${summary.expiredPro || 0}`,
    `Выручка: ${summary.revenue7dStars || 0}⭐ / 7д • ${summary.revenue30dStars || 0}⭐ / 30д`,
    `Покупки Pro 7д: ${summary.proPurchases7d || 0}`,
    '',
    'Контактная воронка 7д:',
    `Запросы: ${summary.contactRequests7d || 0} • оплачено: ${summary.contactPaid7d || 0}`,
    `Раскрыто: ${summary.contactRevealed7d || 0} • отклонено: ${summary.contactDeclined7d || 0}`,
    '',
    'DM воронка 7д:',
    `Создано: ${summary.dmCreated7d || 0} • оплачено: ${summary.dmPaid7d || 0}`,
    `Доставлено: ${summary.dmDelivered7d || 0} • принято: ${summary.dmAccepted7d || 0}`,
    `Блоки: ${summary.dmBlocked7d || 0} • репорты: ${summary.dmReported7d || 0} • активные сейчас: ${summary.dmActiveNow || 0}`,
    '',
    `Цены: Pro ${pricing.proMonthlyPriceStars || 0}⭐ • direct ${pricing.contactUnlockPriceStars || 0}⭐ • DM ${pricing.dmOpenPriceStars || 0}⭐`
  ];

  if (recentReceipts.length) {
    lines.push('', 'Последние покупки:');
    for (const receipt of recentReceipts) {
      lines.push(`• ${truncate(receipt.displayName || receipt.telegramUsername || 'user', 22)} — ${receipt.amountStars || 0}⭐ • ${formatShortStatus(receipt.receiptType, 'receipt')} • ${formatDateTimeShort(receipt.confirmedAt || receipt.purchasedAt)}`);
    }
  }

  if (notice) {
    lines.push('', notice);
  }

  return lines.join('\n');
}

function buildAdminMonetizationKeyboard({ state = null } = {}) {
  const summary = state?.summary || {};
  return buildInlineKeyboard([
    [
      { text: `⭐ Выручка 7д: ${summary.revenue7dStars || 0}`, callback_data: 'adm:money' },
      { text: `👑 Pro: ${summary.activePro || 0}`, callback_data: 'adm:money' }
    ],
    [
      { text: `🔓 Contact paid: ${summary.contactPaid7d || 0}`, callback_data: 'adm:money' },
      { text: `💬 DM paid: ${summary.dmPaid7d || 0}`, callback_data: 'adm:money' }
    ],
    [
      { text: `✅ Contact revealed: ${summary.contactRevealed7d || 0}`, callback_data: 'adm:money' },
      { text: `✅ DM accepted: ${summary.dmAccepted7d || 0}`, callback_data: 'adm:money' }
    ],
    [
      { text: `⛔ DM blocks: ${summary.dmBlocked7d || 0}`, callback_data: 'adm:money' },
      { text: `🚩 DM reports: ${summary.dmReported7d || 0}`, callback_data: 'adm:money' }
    ],
    [{ text: '↩️ Назад в Админку', callback_data: 'adm:home' }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

function buildOperationsHubText({ summary = null } = {}) {
  return [
    '🧰 Операции',
    '',
    'Продуктовая воронка и проблемные сегменты.',
    '',
    countLine('Пользователи', summary?.totalUsers || 0),
    countLine('Подключили LinkedIn', summary?.connectedUsers || 0),
    countLine('Начали профиль', summary?.profileStartedUsers || 0),
    countLine('Готовые профили', summary?.readyProfiles || 0),
    countLine('Готовые, но не опубликованы', summary?.readyNotListed || 0),
    countLine('Опубликованы неполные', summary?.listedIncomplete || 0),
    countLine('Проблемы доставки', summary?.deliveryIssues || 0),
    '',
    'Drilldowns:',
    `Подключили, но без профиля: ${summary?.connectedNoProfile || 0}`,
    `Готовые без навыков: ${summary?.readyNoSkills || 0}`,
    `Активны в каталоге: ${summary?.listedActive || 0} • неактивны ${summary?.listedInactive || 0}`,
    `Без интро: ${summary?.noIntroYet || 0}`,
    `Первое интро: ${summary?.firstIntroUsers || 0} • принятое ${summary?.acceptedIntroUsers || 0}`,
    `Новые интро 24ч: ${summary?.newIntros24h || 0}`,
    `Pending >24ч: ${summary?.pendingOlder24h || 0} • >72ч: ${summary?.staleIntros || 0}`,
    `Недавние relink: ${summary?.recentRelinks7d || 0}/7д`
  ].join('\n');
}

function buildOperationsHubKeyboard({ summary = null } = {}) {
  return buildInlineKeyboard([
    [
      { text: `🧩 Без профиля: ${summary?.connectedNoProfile || 0}`, callback_data: 'adm:ops:funnel:conn_noprofile' },
      { text: `🛠 Без навыков: ${summary?.readyNoSkills || 0}`, callback_data: 'adm:ops:funnel:ready_no_skills' }
    ],
    [
      { text: `📈 Активны: ${summary?.listedActive || 0}`, callback_data: 'adm:ops:funnel:listed_active' },
      { text: `🕯 Неактивны: ${summary?.listedInactive || 0}`, callback_data: 'adm:ops:funnel:listed_inactive' }
    ],
    [
      { text: `📭 Без интро: ${summary?.noIntroYet || 0}`, callback_data: 'adm:ops:funnel:no_intro' },
      { text: `⏳ Pending >24ч: ${summary?.pendingOlder24h || 0}`, callback_data: 'adm:ops:funnel:intro_p24' }
    ],
    [
      { text: `⌛ Pending >72ч: ${summary?.staleIntros || 0}`, callback_data: 'adm:ops:funnel:intro_p72' },
      { text: `🧾 Доставка: ${summary?.deliveryIssues || 0}`, callback_data: 'adm:ops:funnel:delivery_issue' }
    ],
    [
      { text: '👥 Пользователи', callback_data: 'adm:usr:list' },
      { text: '🚩 Качество', callback_data: 'adm:qual' }
    ],
    [
      { text: '📨 Интро', callback_data: 'adm:intro:list' },
      { text: '🧾 Доставка', callback_data: 'adm:dlv' }
    ],
    [{ text: '↩️ Назад в Админку', callback_data: 'adm:home' }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

function buildCommunicationsHubText({ state = null, notice = null } = {}) {
  const lines = [
    '💬 Коммуникации',
    '',
    'Уведомления, рассылки, исходящие и охват аудиторий.',
    '',
    `Активное уведомление: ${state?.notice?.isActive ? 'да' : 'нет'} • ${ADMIN_NOTICE_AUDIENCES[normalizeAdminNoticeAudience(state?.notice?.audienceKey || 'ALL')]?.label || 'Все пользователи'}`,
    `Видимость notice: ${state?.noticeVisibilityEstimate || 0}`,
    `Черновик broadcast: ${state?.broadcastDraft?.body ? 'готов' : 'пусто'}`,
    `Последняя рассылка: ${buildAdminStatusLabel(state?.latestBroadcastStatus, 'нет')}`,
    `Аудитория последней рассылки: ${state?.latestBroadcastRecipients || 0}`,
    `Доставлено: ${state?.latestBroadcastDelivered || 0} • ошибок: ${state?.latestBroadcastFailed || 0}`,
    countLine('Личные сообщения 24ч', state?.directMessages24h || 0),
    countLine('Личные сообщения 7д', state?.directMessages7d || 0),
    countLine('Ошибки outbox 24ч', state?.outboxFailures24h || 0),
    countLine('Ошибки outbox 7д', state?.outboxFailures7d || 0)
  ];
  if (notice) lines.push('', notice);
  return lines.join('\n');
}

function buildCommunicationsHubKeyboard({ state = null } = {}) {
  return buildInlineKeyboard([
    [
      { text: `📣 Видимость notice: ${state?.noticeVisibilityEstimate || 0}`, callback_data: 'adm:comms:funnel:notice_visibility' },
      { text: `📬 Последняя рассылка: ${state?.latestBroadcastRecipients || 0}`, callback_data: 'adm:comms:funnel:last_bc' }
    ],
    [
      { text: `❌ Ошибки исходящих: ${state?.recentOutboxFailures || 0}`, callback_data: 'adm:comms:funnel:outbox_fail' },
      { text: `✉️ ЛС 24ч: ${state?.directMessages24h || 0}`, callback_data: 'adm:comms:funnel:direct_recent' }
    ],
    [{ text: '📣 Уведомление', callback_data: 'adm:not' }],
    [{ text: '📬 Рассылка', callback_data: 'adm:bc' }],
    [{ text: '📌 Шаблоны', callback_data: 'adm:tpl' }],
    [{ text: '📤 Исходящие', callback_data: 'adm:outbox' }],
    [{ text: '↩️ Назад в Админку', callback_data: 'adm:home' }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

function buildSystemHubText({ summary = null } = {}) {
  return [
    '⚙️ Система',
    '',
    'Рантайм, повторные попытки, аудит и операторская активность.',
    '',
    countLine('Ждут повтора', summary?.retryDue || 0),
    countLine('Исчерпано', summary?.exhausted || 0),
    countLine('Ошибки доставки', summary?.failedDeliveries || 0),
    countLine('События аудита 7д', summary?.recentAuditEvents || 0),
    '',
    `Ошибки ${summary?.failures24h || 0}/24ч • ${summary?.failures7d || 0}/7д`,
    `Доставлено ${summary?.delivered24h || 0}/24ч • ${summary?.delivered7d || 0}/7д`,
    `Действия операторов ${summary?.operatorActions24h || 0}/24ч • ${summary?.operatorActions7d || 0}/7д`,
    `Изменения листинга ${summary?.listingChanges7d || 0}/7д • релинки ${summary?.relinks7d || 0}/7д`
  ].join('\n');
}

function buildSystemHubKeyboard({ summary = null } = {}) {
  return buildInlineKeyboard([
    [
      { text: `🔁 Ждут повтора: ${summary?.retryDue || 0}`, callback_data: 'adm:sys:funnel:retry_due' },
      { text: `🧯 Исчерпано: ${summary?.exhausted || 0}`, callback_data: 'adm:sys:funnel:exhausted' }
    ],
    [
      { text: `📜 Аудит 7д: ${summary?.recentAuditEvents || 0}`, callback_data: 'adm:sys:funnel:audit_recent' },
      { text: `📝 Изменения листинга: ${summary?.listingChanges7d || 0}`, callback_data: 'adm:sys:funnel:listing_changes' }
    ],
    [{ text: `🔄 Релинки 7д: ${summary?.relinks7d || 0}`, callback_data: 'adm:sys:funnel:relinks' }],
    [{ text: '🧭 Регламент запуска', callback_data: 'adm:runbook' }],
    [{ text: '🧊 Freeze', callback_data: 'adm:freeze' }],
    [{ text: '✅ Live verification', callback_data: 'adm:verify' }],
    [{ text: '🎭 Репетиция запуска', callback_data: 'adm:rehearse' }],
    [{ text: '🩺 Здоровье', callback_data: 'adm:health' }],
    [{ text: '📜 Аудит', callback_data: 'adm:audit' }],
    [{ text: '👮 Операторы', callback_data: 'adm:opscope' }],
    [{ text: '↩️ Назад в Админку', callback_data: 'adm:home' }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

function buildPlaceholderText({ title, description, nextStep }) {
  const lines = [title, '', description];
  if (nextStep) {
    lines.push('', `Следующий шаг: ${nextStep}`);
  }
  return lines.join('\n');
}

function buildDetailFooter(backCallback) {
  return buildInlineKeyboard([
    [{ text: '↩️ Назад', callback_data: backCallback }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
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
    return ['📨 Интро', '', notice || '⚠️ Данные интро недоступны в этой среде.'].join('\n');
  }

  const lines = [
    '📨 Интро',
    '',
    `Сегмент: ${ADMIN_INTRO_SEGMENTS[state.segmentKey]?.label || 'Все'} • стр. ${state.page + 1}`,
    `Видно в этом сегменте: ${state.totalCount}`,
    `Pending ${state.counts?.pending || 0} • принято ${state.counts?.accepted || 0} • отклонено ${state.counts?.declined || 0} • просрочено ${state.counts?.stale || 0} • сбой уведомления ${state.counts?.failedNotify || 0}`
  ];

  if (notice) {
    lines.push('', notice);
  }

  if (!state.intros?.length) {
    lines.push('', 'В этом сегменте пока нет интро.');
    return lines.join('\n');
  }

  lines.push('', 'Открой интро:');
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
    const label = truncate(`${item?.requesterDisplayName || 'Неизвестно'} → ${item?.targetDisplayName || 'Неизвестно'}`, 42);
    rows.push([{ text: `📄 ${label}`, callback_data: targetUserId ? `adm:intro:user:${targetUserId}:open:${item.introRequestId}:${segmentKey}:${state?.page || 0}` : `adm:intro:open:${item.introRequestId}:${segmentKey}:${state?.page || 0}` }]);
  }

  const pager = [];
  if (state?.hasPrev) {
    pager.push({ text: '◀️ Назад', callback_data: targetUserId ? `adm:intro:user:${targetUserId}:page:${segmentKey}:${Math.max(0, (state?.page || 0) - 1)}` : `adm:intro:page:${segmentKey}:${Math.max(0, (state?.page || 0) - 1)}` });
  }
  if (state?.hasNext) {
    pager.push({ text: 'Вперёд ▶️', callback_data: targetUserId ? `adm:intro:user:${targetUserId}:page:${segmentKey}:${(state?.page || 0) + 1}` : `adm:intro:page:${segmentKey}:${(state?.page || 0) + 1}` });
  }
  if (pager.length) {
    rows.push(pager);
  }

  rows.push([{ text: '🔎 Поиск интро', callback_data: 'adm:search:intros' }]);
  rows.push([{ text: targetUserId ? '↩️ Назад в карточку пользователя' : '↩️ Назад в Операции', callback_data: targetUserId ? `adm:usr:open:${targetUserId}:all:0` : 'adm:ops' }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminIntroDetailText({ intro = null, notificationSummary = null, recentReceipts = [], notice = null } = {}) {
  if (!intro) {
    return ['📄 Деталь интро', '', notice || '⚠️ Интро не найдено.'].join('\n');
  }

  const lines = [
    '📄 Деталь интро',
    '',
    `Отправитель: ${toDisplayValue(intro.requester_display_name)}${intro.requester_headline_user ? ` • ${truncate(intro.requester_headline_user, 60)}` : ''}`,
    `Получатель: ${toDisplayValue(intro.target_display_name)}${intro.target_headline_user ? ` • ${truncate(intro.target_headline_user, 60)}` : ''}`,
    `Статус: ${toDisplayValue(intro.status)}`,
    `Создано: ${formatDateTimeShort(intro.created_at)}`,
    `Обновлено: ${formatDateTimeShort(intro.updated_at)}`,
    '',
    'Сводка payload:',
    `${truncate(intro.requester_display_name, 32)} → ${truncate(intro.target_display_name, 32)}`,
    '',
    `Доставка: отправлено ${notificationSummary?.sentCount || 0} • ошибок ${notificationSummary?.failedCount || 0} • ждут повтора ${notificationSummary?.retryDueCount || 0} • исчерпано ${notificationSummary?.exhaustedCount || 0}`
  ];

  if (recentReceipts?.length) {
    lines.push('', 'Последние события доставки:');
    lines.push(...recentReceipts.slice(0, 3).map((item) => `• ${item.operatorBucket} • ${item.eventType} • попыток ${item.attemptCount}/${item.maxAttempts}`));
  }

  if (notice) {
    lines.push('', notice);
  }

  return lines.join('\n');
}

function buildAdminIntroDetailKeyboard({ intro = null, backCallback = 'adm:intro:list' } = {}) {
  const rows = [];
  if (intro?.requester_user_id) {
    rows.push([{ text: '👤 Отправитель', callback_data: `adm:usr:open:${intro.requester_user_id}:all:0` }]);
  }
  if (intro?.target_user_id) {
    rows.push([{ text: '👤 Получатель', callback_data: `adm:usr:open:${intro.target_user_id}:all:0` }]);
  }
  rows.push([{ text: '🧾 Доставка', callback_data: `adm:intro:dlv:${intro?.intro_request_id || 0}` }]);
  rows.push([{ text: '↩️ Назад к интро', callback_data: backCallback }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function renderDeliveryListLine(item, index, page = 0, pageSize = 8) {
  const ordinal = page * pageSize + index + 1;
  const target = truncate(item?.recipientDisplayName || 'Неизвестный получатель', 18);
  const counterpart = truncate(`${item?.requesterDisplayName || 'Неизвестно'} → ${item?.targetDisplayName || 'Неизвестно'}`, 24);
  const state = formatShortStatus(item?.operatorBucket, 'failed');
  const errorSuffix = item?.lastErrorCode ? ` • ${truncate(item.lastErrorCode, 16)}` : '';
  return `${ordinal}. ${target} • ${state} • ${counterpart} • попыток ${item?.attemptCount || 0}/${item?.maxAttempts || 0}${errorSuffix}`;
}

function buildAdminDeliveryText({ state = null, notice = null } = {}) {
  if (!state?.persistenceEnabled) {
    return ['🧾 Доставка', '', notice || '⚠️ Данные доставки недоступны в этой среде.'].join('\n');
  }

  const lines = [
    '🧾 Доставка',
    '',
    `Сегмент: ${ADMIN_DELIVERY_SEGMENTS[state.segmentKey]?.label || 'Все'} • стр. ${state.page + 1}`,
    state.introRequestId ? `Только для интро #${state.introRequestId}` : 'Все уведомления по интро',
    `Видно в этом сегменте: ${state.totalCount}`,
    `Ошибки ${state.counts?.failed || 0} • ждут повтора ${state.counts?.retryDue || 0} • исчерпано ${state.counts?.exhausted || 0} • доставлено ${state.counts?.sent || 0}`
  ];

  if (notice) {
    lines.push('', notice);
  }

  if (!state.records?.length) {
    lines.push('', 'Для этого сегмента пока нет записей доставки.');
    return lines.join('\n');
  }

  lines.push('', 'Открой запись доставки:');
  lines.push(...state.records.map((item, index) => renderDeliveryListLine(item, index, state.page, state.pageSize)));
  return lines.join('\n');
}

function buildAdminDeliveryKeyboard({ state = null } = {}) {
  const segmentKey = normalizeAdminDeliverySegment(state?.segmentKey);
  const introRequestId = state?.introRequestId || null;
  const rows = [...buildDeliverySegmentRows(segmentKey, introRequestId)];

  for (const item of state?.records || []) {
    const label = truncate(`${item?.recipientDisplayName || 'Неизвестно'} • ${item?.operatorBucket || 'failed'} • #${item?.notificationReceiptId}`, 42);
    const callback = introRequestId
      ? `adm:dlv:intro:${introRequestId}:open:${item.notificationReceiptId}`
      : `adm:dlv:open:${item.notificationReceiptId}:${segmentKey}:${state?.page || 0}`;
    rows.push([{ text: `🧾 ${label}`, callback_data: callback }]);
  }

  const pager = [];
  if (state?.hasPrev) {
    pager.push({ text: '◀️ Назад', callback_data: introRequestId ? `adm:dlv:intro:${introRequestId}:page:${segmentKey}:${Math.max(0, (state?.page || 0) - 1)}` : `adm:dlv:page:${segmentKey}:${Math.max(0, (state?.page || 0) - 1)}` });
  }
  if (state?.hasNext) {
    pager.push({ text: 'Вперёд ▶️', callback_data: introRequestId ? `adm:dlv:intro:${introRequestId}:page:${segmentKey}:${(state?.page || 0) + 1}` : `adm:dlv:page:${segmentKey}:${(state?.page || 0) + 1}` });
  }
  if (pager.length) {
    rows.push(pager);
  }

  rows.push([{ text: '🔎 Поиск доставки', callback_data: 'adm:search:delivery' }]);
  rows.push([{ text: introRequestId ? '↩️ Back to Intro Detail' : '↩️ Назад в Операции', callback_data: introRequestId ? `adm:intro:open:${introRequestId}:all:0` : 'adm:ops' }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminDeliveryRecordText({ record = null, notice = null } = {}) {
  if (!record) {
    return ['🧾 Деталь доставки', '', notice || 'Запись доставки не найдена.'].join('\n');
  }

  const lines = [
    '🧾 Деталь доставки',
    '',
    `Событие: ${toDisplayValue(record.event_type)}`,
    `Интро: #${record.intro_request_id || '—'}`,
    `Получатель: ${toDisplayValue(record.recipient_display_name)}`,
    `Статус: ${toDisplayValue(record.delivery_status)} • бакет ${toDisplayValue(record.operator_bucket)}`,
    `Попытки: ${record.attempt_count || 0}/${record.max_attempts || 0}`,
    `Следующий повтор: ${formatDateTimeShort(record.next_attempt_at)}`,
    `Последняя попытка: ${formatDateTimeShort(record.last_attempt_at)}`,
    `Доставлено: ${formatDateTimeShort(record.delivered_at)}`,
    `Создано: ${formatDateTimeShort(record.created_at)}`,
    `Ошибка: ${truncate(record.last_error_code || record.error_message, 180)}`
  ];

  if (notice) {
    lines.push('', notice);
  }
  return lines.join('\n');
}

function buildAdminDeliveryRecordKeyboard({ record = null, backCallback = 'adm:dlv' } = {}) {
  const rows = [];
  if (record?.recipient_user_id) {
    rows.push([{ text: '👤 Открыть пользователя', callback_data: `adm:usr:open:${record.recipient_user_id}:all:0` }]);
  }
  if (record?.intro_request_id) {
    rows.push([{ text: '📄 Открыть интро', callback_data: `adm:intro:open:${record.intro_request_id}:all:0` }]);
  }
  rows.push([{ text: '↩️ Назад к доставке', callback_data: backCallback }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function renderUsersListLine(item, index, page = 0, pageSize = 8) {
  const ordinal = page * pageSize + index + 1;
  const name = truncate(item?.displayName || item?.linkedinName || item?.telegramUsername || `User ${item?.telegramUserId}`, 22);
  const linkedIn = compactBooleanLabel(item?.hasLinkedIn, 'LI', 'no LI');
  const listing = item?.visibilityStatus === 'listed' ? 'listed' : item?.profileId ? 'hidden' : 'no profile';
  const readiness = item?.profileState === 'active' ? 'ready' : 'incomplete';
  const intros = item?.pendingIntroCount ? `pending ${item.pendingIntroCount}` : 'без pending';
  return `${ordinal}. ${name} • ${linkedIn} • ${listing} • ${readiness} • ${intros}`;
}

function buildUsersListText({ state = null, notice = null } = {}) {
  if (!state?.persistenceEnabled) {
    return [
      '👥 Пользователи',
      '',
      notice || '⚠️ Данные пользователей недоступны в этой среде.'
    ].join('\n');
  }

  const lines = [
    '👥 Пользователи',
    '',
    `Сегмент: ${ADMIN_USER_SEGMENTS[state.segmentKey]?.label || 'Все'} • стр. ${state.page + 1}`,
    countLine('Видно в этом сегменте', state.totalCount),
    `Подключили LinkedIn ${state.counts?.connected || 0} • без профиля ${state.counts?.connectedNoProfile || 0} • неполные ${state.counts?.incomplete || 0}`,
    `Готовы, но скрыты ${state.counts?.readyNotListed || 0} • готовы без навыков ${state.counts?.readyNoSkills || 0}`,
    `Опубликованы ${state.counts?.listed || 0} • активны ${state.counts?.listedActive || 0} • неактивны ${state.counts?.listedInactive || 0}`,
    `Без интро ${state.counts?.noIntroYet || 0} • pending-интро ${state.counts?.pendingIntros || 0} • релинки ${state.counts?.relinks || 0}`
  ];

  if (notice) {
    lines.push('', notice);
  }

  if (!state.users?.length) {
    lines.push('', 'В этом сегменте сейчас нет пользователей.');
    return lines.join('\n');
  }

  lines.push('', 'Открой карточку пользователя из quality-бакета:');
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
    pager.push({ text: '◀️ Назад', callback_data: `adm:usr:page:${segmentKey}:${Math.max(0, (state?.page || 0) - 1)}` });
  }
  if (state?.hasNext) {
    pager.push({ text: 'Вперёд ▶️', callback_data: `adm:usr:page:${segmentKey}:${(state?.page || 0) + 1}` });
  }
  if (pager.length) {
    rows.push(pager);
  }

  rows.push([{ text: '📦 Массовые действия', callback_data: `adm:bulk:user:${segmentKey}:${state?.page || 0}` }]);
  rows.push([{ text: '🔎 Поиск пользователей', callback_data: 'adm:search:users' }]);
  rows.push([{ text: state?.targetUserId ? '↩️ Назад в карточку пользователя' : '↩️ Назад в Операции', callback_data: state?.targetUserId ? `adm:usr:open:${state.targetUserId}:all:0` : 'adm:ops' }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminUserCardText({ card = null, notice = null } = {}) {
  if (!card) {
    return ['🪪 Карточка пользователя', '', notice || '⚠️ Пользователь не найден.'].join('\n');
  }

  const lines = [
    '🪪 Карточка пользователя',
    '',
    `Telegram: ${toDisplayValue(card.telegram_username ? `@${card.telegram_username}` : null, `id ${card.telegram_user_id}`)}`,
    `Display name: ${toDisplayValue(card.display_name, card.linkedin_name || '—')}`,
    `LinkedIn: ${card.linkedin_sub ? `connected • ${toDisplayValue(card.linkedin_name)}` : 'not connected'}`,
    `Profile: ${profileReadinessLabel(card)}`,
    `Listing: ${card.profile_id ? formatShortStatus(card.visibility_status, 'hidden') : '—'}`,
    `Skills: ${card.skills?.length || 0}`,
    `Headline: ${truncate(card.headline_user, 72)}`,
    `Интро: отправлено ${card.intro_sent_count || 0} • получено ${card.intro_received_count || 0} • pending ${card.pending_intro_count || 0}`,
    `Last active: ${formatDateTimeShort(card.last_seen_at)}`,
    `Quick links: message • intros • audit`
  ];

  if (card.operator_note_text) {
    lines.push('', `Заметка оператора: ${truncate(card.operator_note_text, 140)}`);
    lines.push(`Note updated: ${formatDateTimeShort(card.operator_note_updated_at)}`);
  } else {
    lines.push('', 'Заметка оператора: —');
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
    { text: '📨 Интро', callback_data: `adm:card:intros:${card?.user_id || 0}` },
    { text: '📜 Аудит', callback_data: `adm:card:audit:${card?.user_id || 0}` }
  ]);
  rows.push([{ text: '↩️ Назад к пользователям', callback_data: `adm:usr:page:${segmentKey}:${page}` }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminUserPublicCardText({ card = null, notice = null } = {}) {
  if (!card?.profile_id) {
    return ['👁 Превью публичной карточки', '', notice || 'У этого пользователя пока нет профиля.'].join('\n');
  }

  const lines = [
    '👁 Превью публичной карточки',
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
    [{ text: '↩️ Назад в карточку пользователя', callback_data: `adm:usr:open:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

function directTemplateLabel(templateKey) {
  return ADMIN_DIRECT_MESSAGE_TEMPLATES[templateKey]?.label || 'Blank message';
}

function noticeTemplateLabel(templateKey) {
  return ADMIN_NOTICE_TEMPLATES[normalizeAdminNoticeTemplate(templateKey)]?.label || 'Шаблон notice';
}

function broadcastTemplateLabel(templateKey) {
  return ADMIN_BROADCAST_TEMPLATES[normalizeAdminBroadcastTemplate(templateKey)]?.label || 'Шаблон broadcast';
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
    '✉️ Личное сообщение',
    '',
    `Цель: ${targetLabel}`,
    `Telegram: ${toDisplayValue(card?.telegram_username ? `@${card.telegram_username}` : null, card?.telegram_user_id ? `id ${card.telegram_user_id}` : draft?.targetTelegramUserId ? `id ${draft.targetTelegramUserId}` : '—')}`,
    `Template: ${directTemplateLabel(draft?.templateKey || 'blank')}`,
    `Обновлено: ${formatDateTimeShort(draft?.updatedAt)}`,
    '',
    draft?.body ? truncate(draft.body, 500) : 'Черновик direct message пока пустой.'
  ];
  if (notice) lines.push('', notice);
  return lines.join('\n');
}

function buildAdminUserMessageKeyboard({ targetUserId, segmentKey = 'all', page = 0 } = {}) {
  return buildInlineKeyboard([
    [{ text: '📌 Use template', callback_data: `adm:msg:tpl:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '✏️ Изменить текст', callback_data: `adm:msg:edit:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '👁 Превью', callback_data: `adm:msg:preview:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '🗑 Очистить черновик', callback_data: `adm:msg:clear:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '↩️ Назад в карточку пользователя', callback_data: `adm:usr:open:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

function buildAdminDirectTemplatePickerText({ card = null, state = null, notice = null } = {}) {
  const targetLabel = toDisplayValue(card?.display_name, card?.linkedin_name || card?.telegram_username || state?.draft?.targetDisplayName || 'this user');
  const lines = [
    '📌 Шаблон личного сообщения',
    '',
    `Цель: ${targetLabel}`,
    `Текущий шаблон: ${directTemplateLabel(state?.draft?.templateKey || 'blank')}`
  ];
  if (notice) lines.push('', notice);
  return lines.join('\n');
}

function buildAdminDirectTemplatePickerKeyboard({ targetUserId, segmentKey = 'all', page = 0, state = null } = {}) {
  const current = state?.draft?.templateKey || 'blank';
  const rows = Object.values(ADMIN_DIRECT_MESSAGE_TEMPLATES).map((item) => ([{ text: `${current === item.key ? '✅' : '▫️'} ${item.label}`, callback_data: `adm:msg:tplset:${targetUserId}:${segmentKey}:${page}:${item.key}` }]));
  rows.push([{ text: '↩️ Назад к сообщению', callback_data: `adm:card:msg:${targetUserId}:${segmentKey}:${page}` }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminDirectПревьюText({ card = null, state = null, notice = null } = {}) {
  const draft = state?.draft || {};
  const targetLabel = toDisplayValue(card?.display_name, card?.linkedin_name || card?.telegram_username || draft?.targetDisplayName || 'this user');
  const lines = [
    '👁 Превью личного сообщения',
    '',
    `Цель: ${targetLabel}`,
    `Template: ${directTemplateLabel(draft?.templateKey || 'blank')}`,
    '',
    draft?.body || 'Черновик direct message пока пустой.'
  ];
  if (notice) lines.push('', notice);
  return lines.join('\n');
}

function buildAdminDirectПревьюKeyboard({ targetUserId, segmentKey = 'all', page = 0 } = {}) {
  return buildInlineKeyboard([
    [{ text: '✅ Подтвердить отправку', callback_data: `adm:msg:confirm:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '↩️ Назад к сообщению', callback_data: `adm:card:msg:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

function buildAdminUserNotePromptText({ card = null } = {}) {
  return [
    '✍️ Заметка оператора',
    '',
    `Send the note text for ${toDisplayValue(card?.display_name, card?.linkedin_name || card?.telegram_username || 'this user')}.`,
    'The latest note will replace the previous one.',
    '',
    `Текущая заметка: ${truncate(card?.operator_note_text, 220)}`
  ].join('\n');
}

function buildAdminUserNotePromptKeyboard({ targetUserId, segmentKey = 'all', page = 0 } = {}) {
  return buildInlineKeyboard([
    [{ text: '↩️ Отмена', callback_data: `adm:card:cancelnote:${targetUserId}:${segmentKey}:${page}` }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}



function buildAdminQualityText({ state = null, notice = null } = {}) {
  if (!state?.persistenceEnabled) {
    return ['🚩 Качество', '', notice || '⚠️ Данные quality недоступны в этой среде.'].join('\n');
  }

  const lines = [
    '🚩 Качество',
    '',
    `Сегмент: ${ADMIN_QUALITY_SEGMENTS[state.segmentKey]?.label || 'Листинг неполный'} • стр. ${state.page + 1}`,
    countLine('Видно в этом бакете', state.totalCount),
    `Листинг неполный ${state.counts?.listedIncomplete || 0} • готовы, но не опубликованы ${state.counts?.readyNotListed || 0}`,
    `Не хватает полей ${state.counts?.missingCritical || 0} • дубли ${state.counts?.duplicateLike || 0} • релинки ${state.counts?.relink || 0}`
  ];

  if (notice) {
    lines.push('', notice);
  }

  if (!state.users?.length) {
    lines.push('', 'В этом quality-сегменте сейчас нет профилей.');
    return lines.join('\n');
  }

  lines.push('', 'Открой карточку пользователя из quality-бакета:');
  lines.push(...state.users.map((item, index) => `${state.page * state.pageSize + index + 1}. ${truncate(item?.displayName || item?.linkedinName || item?.telegramUsername || `User ${item?.telegramUserId}`, 22)} • ${qualityReasonLabel(item)} • навыков ${item?.skillsCount || 0} • pending ${item?.pendingIntroCount || 0}`));
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
  if (state?.hasPrev) pager.push({ text: '◀️ Назад', callback_data: `adm:qual:page:${segmentKey}:${Math.max(0, (state?.page || 0) - 1)}` });
  if (state?.hasNext) pager.push({ text: 'Вперёд ▶️', callback_data: `adm:qual:page:${segmentKey}:${(state?.page || 0) + 1}` });
  if (pager.length) rows.push(pager);

  rows.push([{ text: '📦 Массовые действия', callback_data: `adm:bulk:user:${segmentKey}:${state?.page || 0}` }]);
  rows.push([{ text: '🔎 Поиск пользователей', callback_data: 'adm:search:users' }]);
  rows.push([{ text: state?.targetUserId ? '↩️ Назад в карточку пользователя' : '↩️ Назад в Операции', callback_data: state?.targetUserId ? `adm:usr:open:${state.targetUserId}:all:0` : 'adm:ops' }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminAuditText({ state = null, notice = null } = {}) {
  if (!state?.persistenceEnabled) {
    return ['📜 Аудит', '', notice || '⚠️ Данные аудита недоступны в этой среде.'].join('\n');
  }

  const lines = [
    '📜 Аудит',
    '',
    `Сегмент: ${ADMIN_AUDIT_SEGMENTS[state.segmentKey]?.label || 'Все'} • стр. ${state.page + 1}`,
    state.targetUserId ? `Только для пользователя #${state.targetUserId}` : 'Недавние действия операторов и системы',
    countLine('Видно в этом сегменте', state.totalCount)
  ];
  if (notice) lines.push('', notice);
  if (!state.records?.length) {
    lines.push('', 'В этом сегменте аудита пока нет событий.');
    return lines.join('\n');
  }
  lines.push('', 'Последние события:');
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
  if (state?.hasPrev) pager.push({ text: '◀️ Назад', callback_data: targetUserId ? `adm:audit:user:${targetUserId}:page:${segmentKey}:${Math.max(0, (state?.page || 0) - 1)}` : `adm:audit:page:${segmentKey}:${Math.max(0, (state?.page || 0) - 1)}` });
  if (state?.hasNext) pager.push({ text: 'Вперёд ▶️', callback_data: targetUserId ? `adm:audit:user:${targetUserId}:page:${segmentKey}:${(state?.page || 0) + 1}` : `adm:audit:page:${segmentKey}:${(state?.page || 0) + 1}` });
  if (pager.length) rows.push(pager);
  rows.push([{ text: '🔎 Поиск аудита', callback_data: 'adm:search:audit' }]);
  rows.push([{ text: targetUserId ? '↩️ Назад в карточку пользователя' : '↩️ Назад в Систему', callback_data: targetUserId ? `adm:usr:open:${targetUserId}:all:0` : 'adm:sys' }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminAuditRecordText({ record = null, notice = null } = {}) {
  if (!record) {
    return ['📄 Деталь аудита', '', notice || 'Запись аудита не найдена.'].join('\n');
  }
  const detailText = record.detail ? JSON.stringify(record.detail, null, 2) : '—';
  const lines = [
    '📄 Деталь аудита',
    '',
    `Тип: ${toDisplayValue(record.event_type)}`,
    `Actor: ${formatAuditActor(record)}`,
    `Цель: ${formatAuditTarget(record)}`,
    `Создано: ${formatDateTimeShort(record.created_at)}`,
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
    rows.push([{ text: '👤 Открыть пользователя', callback_data: `adm:usr:open:${record.target_user_id}:all:0` }]);
  }
  if (record?.intro_request_id) {
    rows.push([{ text: '📄 Открыть интро', callback_data: `adm:intro:open:${record.intro_request_id}:all:0` }]);
  }
  if (record?.detail?.outboxId) {
    rows.push([{ text: '📤 Открыть outbox', callback_data: `adm:outbox:open:${record.detail.outboxId}` }]);
  }
  rows.push([{ text: '↩️ Назад к аудиту', callback_data: backCallback }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function adminNoticeAudienceLabel(audienceKey) {
  return ADMIN_NOTICE_AUDIENCES[normalizeAdminNoticeAudience(audienceKey)]?.label || 'Все пользователи';
}

function adminBroadcastAudienceLabel(audienceKey) {
  return ADMIN_BROADCAST_AUDIENCES[normalizeAdminBroadcastAudience(audienceKey)]?.label || 'Все подключённые';
}

function buildAdminNoticeText({ state = null, notice = null } = {}) {
  const current = state?.notice || { body: '', audienceKey: 'ALL', isActive: false };
  const lines = [
    '📣 Уведомление',
    '',
    `Статус: ${current.isActive ? 'активно' : 'неактивно'}`,
    `Аудитория: ${adminNoticeAudienceLabel(current.audienceKey)}`,
    `Оценка видимости: ${state?.estimate || 0}`,
    `Обновлено: ${formatDateTimeShort(current.updatedAt)}`,
    '',
    current.body ? truncate(current.body, 500) : 'Текст notice пока пустой.'
  ];
  if (notice) {
    lines.push('', notice);
  }
  return lines.join('\n');
}

function buildAdminNoticeKeyboard({ state = null } = {}) {
  const current = state?.notice || { isActive: false };
  return buildInlineKeyboard([
    [{ text: '✏️ Изменить текст', callback_data: 'adm:not:edit' }],
    [{ text: '📌 Шаблоны', callback_data: 'adm:not:tpl' }],
    [{ text: '🎯 Аудитория', callback_data: 'adm:not:aud' }],
    [{ text: '👁 Превью', callback_data: 'adm:not:preview' }],
    [{ text: current.isActive ? '⛔ Выключить' : '✅ Включить', callback_data: current.isActive ? 'adm:not:off' : 'adm:not:on' }],
    [{ text: '↩️ Назад в Коммуникации', callback_data: 'adm:comms' }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

function buildAdminNoticeAudienceSurface({ state = null, notice = null } = {}) {
  const current = state?.notice || { audienceKey: 'ALL' };
  const rows = Object.values(ADMIN_NOTICE_AUDIENCES).map((item) => ([{
    text: `${normalizeAdminNoticeAudience(current.audienceKey) === item.key ? '✅' : '▫️'} ${item.label}`,
    callback_data: `adm:not:aud:${item.key}`
  }]));
  rows.push([{ text: '↩️ Назад к уведомлению', callback_data: 'adm:not' }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  const lines = ['🎯 Аудитория notice', '', `Текущее: ${adminNoticeAudienceLabel(current.audienceKey)}`];
  if (notice) {
    lines.push('', notice);
  }
  return { text: lines.join('\n'), reply_markup: buildInlineKeyboard(rows) };
}

function buildAdminNoticeПревьюSurface({ state = null, notice = null } = {}) {
  const current = state?.notice || { body: '', audienceKey: 'ALL', isActive: false };
  const lines = [
    '👁 Превью уведомления',
    '',
    `Аудитория: ${adminNoticeAudienceLabel(current.audienceKey)}`,
    '',
    current.body ? current.body : 'Текст notice пока пустой.'
  ];
  if (notice) {
    lines.push('', notice);
  }
  return {
    text: lines.join('\n'),
    reply_markup: buildInlineKeyboard([
      [{ text: current.isActive ? '⛔ Выключить' : '✅ Включить', callback_data: current.isActive ? 'adm:not:off' : 'adm:not:on' }],
      [{ text: '↩️ Назад к уведомлению', callback_data: 'adm:not' }],
      [{ text: '🏠 Главная', callback_data: 'home:root' }]
    ])
  };
}

function buildAdminBroadcastText({ state = null, notice = null } = {}) {
  const draft = state?.draft || { body: '', audienceKey: 'ALL_CONNECTED' };
  const latest = state?.latestRecord || null;
  const lines = [
    '📬 Рассылка',
    '',
    `Аудитория: ${adminBroadcastAudienceLabel(draft.audienceKey)}`,
    countLine('Estimated recipients', state?.estimate || 0),
    `Обновлено: ${formatDateTimeShort(draft.updatedAt)}`
  ];

  if (latest) {
    lines.push(`Последняя задача: #${latest.id} • ${formatShortStatus(latest.status, 'none')}`);
    lines.push(`Progress: ${latest.delivered_count || 0}/${latest.estimated_recipient_count ?? 0} delivered • ${latest.failed_count || 0} failed • ${latest.pending_count || 0} pending`);
    lines.push(`Batch: ${latest.batch_size || '—'} • cursor ${latest.cursor || 0}`);
    if (latest.last_error) {
      lines.push(`Последняя ошибка: ${truncate(latest.last_error, 80)}`);
    }
  }

  lines.push('', draft.body ? truncate(draft.body, 420) : 'Черновик broadcast пока пустой.');
  if (notice) {
    lines.push('', notice);
  }
  return lines.join('\n');
}

function buildAdminBroadcastKeyboard({ state = null } = {}) {
  const latest = state?.latestRecord || null;
  const rows = [
    [{ text: '✏️ Изменить текст', callback_data: 'adm:bc:edit' }],
    [{ text: '📌 Шаблоны', callback_data: 'adm:bc:tpl' }],
    [{ text: '🎯 Аудитория', callback_data: 'adm:bc:aud' }],
    [{ text: '👁 Превью', callback_data: 'adm:bc:preview' }],
    [{ text: '📨 Отправить', callback_data: 'adm:bc:send' }],
    [{ text: '🔄 Обновить', callback_data: 'adm:bc:refresh' }]
  ];
  if (latest?.failed_count > 0 || latest?.retry_due_count > 0 || latest?.exhausted_count > 0) {
    rows.push([{ text: '🧾 Ошибки', callback_data: `adm:bc:fail:${latest.id}:0` }]);
  }
  rows.push([{ text: '🗑 Очистить черновик', callback_data: 'adm:bc:clear' }]);
  rows.push([{ text: '🔎 Поиск исходящих', callback_data: 'adm:search:outbox' }]);
  rows.push([{ text: '↩️ Назад в Коммуникации', callback_data: 'adm:comms' }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminBroadcastAudienceSurface({ state = null, notice = null } = {}) {
  const draft = state?.draft || { audienceKey: 'ALL_CONNECTED' };
  const rows = Object.values(ADMIN_BROADCAST_AUDIENCES).map((item) => ([{
    text: `${normalizeAdminBroadcastAudience(draft.audienceKey) === item.key ? '✅' : '▫️'} ${item.label}`,
    callback_data: `adm:bc:aud:${item.key}`
  }]));
  rows.push([{ text: '↩️ Назад к рассылке', callback_data: 'adm:bc' }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  const lines = ['🎯 Аудитория рассылки', '', `Текущее: ${adminBroadcastAudienceLabel(draft.audienceKey)}`];
  if (notice) {
    lines.push('', notice);
  }
  return { text: lines.join('\n'), reply_markup: buildInlineKeyboard(rows) };
}

function buildAdminBroadcastPreviewSurface({ state = null, notice = null } = {}) {
  const draft = state?.draft || { body: '', audienceKey: 'ALL_CONNECTED' };
  const lines = [
    '👁 Превью рассылки',
    '',
    `Аудитория: ${adminBroadcastAudienceLabel(draft.audienceKey)}`,
    `Estimated recipients: ${state?.estimate || 0}`,
    '',
    draft.body ? draft.body : 'Черновик broadcast пока пустой.'
  ];
  if (notice) {
    lines.push('', notice);
  }
  return {
    text: lines.join('\n'),
    reply_markup: buildInlineKeyboard([
      [{ text: '✅ Подтвердить отправку', callback_data: 'adm:bc:confirm' }],
      [{ text: '↩️ Назад к рассылке', callback_data: 'adm:bc' }],
      [{ text: '🏠 Главная', callback_data: 'home:root' }]
    ])
  };
}

function buildAdminTemplatesText({ state = null, notice = null } = {}) {
  const noticeTemplates = state?.noticeTemplates || [];
  const broadcastTemplates = state?.broadcastTemplates || [];
  const directTemplates = state?.directTemplates || [];
  const lines = [
    '📌 Шаблоны',
    '',
    `Шаблоны уведомлений: ${noticeTemplates.length}`,
    `Шаблоны рассылки: ${broadcastTemplates.length}`,
    `Шаблоны личных сообщений: ${directTemplates.length}`,
    '',
    'Шаблоны уведомлений подходят для компактных баннеров, шаблоны рассылки — для массовых касаний. Шаблоны личных сообщений доступны в карточке пользователя → сообщение.'
  ];
  if (notice) lines.push('', notice);
  return lines.join('\n');
}

function buildAdminTemplatesKeyboard() {
  return buildInlineKeyboard([
    [{ text: '📣 Шаблоны уведомлений', callback_data: 'adm:tpl:not' }],
    [{ text: '📬 Шаблоны рассылки', callback_data: 'adm:tpl:bc' }],
    [{ text: '✉️ Шаблоны личных сообщений', callback_data: 'adm:tpl:direct' }],
    [{ text: '↩️ Назад в Коммуникации', callback_data: 'adm:comms' }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

function buildAdminNoticeTemplatePickerText({ state = null, templates = [], notice = null } = {}) {
  const currentAudience = adminNoticeAudienceLabel(state?.notice?.audienceKey || 'ALL');
  const lines = [
    '📣 Шаблоны уведомлений',
    '',
    `Текущая аудитория: ${currentAudience}`,
    `Текущая оценка: ${state?.estimate || 0}`,
    '',
    'Выбери шаблон, чтобы предзаполнить текст уведомления и рекомендуемую аудиторию.'
  ];
  if (templates.length) {
    lines.push('', ...templates.map((item, index) => `${index + 1}. ${item.label} → ${adminNoticeAudienceLabel(item.audienceKey)}`));
  }
  if (notice) lines.push('', notice);
  return lines.join('\n');
}

function buildAdminNoticeTemplatePickerKeyboard({ templates = [] } = {}) {
  const rows = templates.map((item) => ([{ text: `📌 ${item.label}`, callback_data: `adm:not:tpl:${item.key}` }]));
  rows.push([{ text: '↩️ Назад к уведомлению', callback_data: 'adm:not' }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminBroadcastTemplatePickerText({ state = null, templates = [], notice = null } = {}) {
  const currentAudience = adminBroadcastAudienceLabel(state?.draft?.audienceKey || 'ALL_CONNECTED');
  const lines = [
    '📬 Шаблоны рассылки',
    '',
    `Текущая аудитория: ${currentAudience}`,
    `Текущая оценка: ${state?.estimate || 0}`,
    '',
    'Выбери шаблон, чтобы предзаполнить текст рассылки и рекомендуемую аудиторию.'
  ];
  if (templates.length) {
    lines.push('', ...templates.map((item, index) => `${index + 1}. ${item.label} → ${adminBroadcastAudienceLabel(item.audienceKey)}`));
  }
  if (notice) lines.push('', notice);
  return lines.join('\n');
}

function buildAdminBroadcastTemplatePickerKeyboard({ templates = [] } = {}) {
  const rows = templates.map((item) => ([{ text: `📌 ${item.label}`, callback_data: `adm:bc:tpl:${item.key}` }]));
  rows.push([{ text: '↩️ Назад к рассылке', callback_data: 'adm:bc' }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminOutboxText({ records = [], notice = null } = {}) {
  const lines = ['📤 Исходящие', ''];
  if (!records.length) {
    lines.push('Коммуникационных записей пока нет.');
    lines.push('После активации notice, отправки broadcast или direct message запись появится здесь.');
  } else {
    lines.push('Последние записи:');
    lines.push(...records.map((item, index) => `${index + 1}. ${item.event_type} • ${truncate(formatOutboxTarget(item), 20)} • ${formatShortStatus(item.status, 'draft')} • ок ${item.delivered_count ?? 0}/${item.estimated_recipient_count ?? '—'} • ошибок ${item.failed_count ?? 0} • ${formatDateTimeShort(item.sent_at || item.created_at)}`));
  }
  if (notice) {
    lines.push('', notice);
  }
  return lines.join('\n');
}

function buildAdminOutboxKeyboard({ records = [] } = {}) {
  const rows = records.map((item) => ([{ text: `📄 ${item.event_type} • #${item.id}`, callback_data: `adm:outbox:open:${item.id}` }]));
  rows.push([{ text: '🔎 Поиск исходящих', callback_data: 'adm:search:outbox' }]);
  rows.push([{ text: '↩️ Назад в Коммуникации', callback_data: 'adm:comms' }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminOutboxRecordText({ record = null, notice = null } = {}) {
  if (!record) {
    return ['📄 Запись исходящих', '', notice || 'Запись не найдена.'].join('\n');
  }
  const lines = [
    '📄 Запись исходящих',
    '',
    `Тип: ${record.event_type}`,
    `Статус: ${record.status}`,
    `Аудитория: ${record.audience_key || '—'}`,
    `Цель: ${formatOutboxTarget(record)}`,
    `Оценка: ${record.estimated_recipient_count ?? '—'}`,
    `Доставлено: ${record.delivered_count ?? '—'}`,
    `Ошибок: ${record.failed_count ?? '—'}`,
    `В ожидании: ${record.pending_count ?? '—'}`,
    `Размер батча: ${record.batch_size ?? '—'}`,
    `Курсор: ${record.cursor ?? '—'}`,
    `Старт: ${formatDateTimeShort(record.started_at)}`,
    `Завершено: ${formatDateTimeShort(record.finished_at)}`,
    `Создано: ${formatDateTimeShort(record.created_at)}`,
    `Отправлено: ${formatDateTimeShort(record.sent_at)}`,
    '',
    record.body || '—'
  ];
  if (record?.last_error) {
    lines.push('', `Последняя ошибка: ${truncate(record.last_error, 220)}`);
  }
  if (notice) {
    lines.push('', notice);
  }
  return lines.join('\n');
}

function buildAdminOutboxRecordKeyboard({ record = null } = {}) {
  const rows = [];
  if (record?.target_user_id) {
    rows.push([{ text: '👤 Открыть пользователя', callback_data: `adm:usr:open:${record.target_user_id}:all:0` }]);
  }
  if (record?.event_type === 'broadcast' && ((record?.failed_count || 0) > 0 || (record?.retry_due_count || 0) > 0 || (record?.exhausted_count || 0) > 0)) {
    rows.push([{ text: '🧾 Открыть ошибки', callback_data: `adm:bc:fail:${record.id}:0` }]);
  }
  rows.push([{ text: '↩️ Назад к исходящим', callback_data: 'adm:outbox' }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminBroadcastFailuresText({ state = null, notice = null } = {}) {
  if (!state?.record) {
    return ['🧾 Ошибки broadcast', '', notice || 'Запись broadcast не найдена.'].join('\n');
  }
  const lines = [
    '🧾 Ошибки broadcast',
    '',
    `Рассылка: #${state.record.id} • ${state.record.status}`,
    `Ошибки: ${state.totalCount || 0} • стр. ${(state.page || 0) + 1}`
  ];
  if (!state.items?.length) {
    lines.push('', 'Для этого broadcast нет получателей с ошибками или retry due.');
  } else {
    lines.push('', 'Получатели, требующие внимания:');
    lines.push(...state.items.map((item, index) => `${(state.page || 0) * (state.pageSize || 10) + index + 1}. ${truncate(item.target_display_name || item.target_telegram_username || `id ${item.target_telegram_user_id}`, 28)} • ${item.status} • попыток ${item.attempts} • ${truncate(item.last_error, 64)}`));
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
  if (state?.hasPrev) pager.push({ text: '◀️ Назад', callback_data: `adm:bc:fail:${state.outboxId}:${Math.max(0, (state.page || 0) - 1)}` });
  if (state?.hasNext) pager.push({ text: 'Вперёд ▶️', callback_data: `adm:bc:fail:${state.outboxId}:${(state.page || 0) + 1}` });
  if (pager.length) rows.push(pager);
  rows.push([{ text: '↩️ Назад к записи исходящих', callback_data: `adm:outbox:open:${state?.outboxId || 0}` }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function buildAdminCommsEditPromptSurface({ title, currentValue, cancelCallback }) {
  return {
    text: [title, '', 'Отправь новый текст следующим сообщением.', '', `Текущее значение: ${truncate(currentValue, 280)}`].join('\n'),
    reply_markup: buildInlineKeyboard([
      [{ text: '↩️ Отмена', callback_data: cancelCallback }],
      [{ text: '🏠 Главная', callback_data: 'home:root' }]
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
      return `${ordinal}. ${truncate(item.displayName || item.linkedinName || item.telegramUsername || `User ${item.telegramUserId}`, 26)} • ${item.hasLinkedIn ? 'LI' : 'без LI'} • ${item.visibilityStatus === 'listed' ? 'листинг' : item.profileState === 'active' ? 'скрыт' : 'неполный'} • pending ${item.pendingIntroCount || 0}`;
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
    `Текущий запрос: ${currentQuery || '—'}`
  ];
  if (notice) lines.push('', notice);
  return lines.join('\n');
}

function buildAdminSearchPromptKeyboard({ scopeKey } = {}) {
  return buildInlineKeyboard([
    [{ text: '↩️ Отмена', callback_data: adminSearchBackCallback(scopeKey) }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

function buildAdminSearchResultsText({ scopeKey, state = null, notice = null } = {}) {
  const lines = [
    `🔎 Результаты: ${adminSearchScopeLabel(scopeKey)}`,
    '',
    `Запрос: ${state?.queryText || '—'}`,
    `Результаты: ${state?.totalCount || 0} • стр. ${(state?.page || 0) + 1}`
  ];
  if (notice) lines.push('', notice);
  if (!state?.results?.length) {
    lines.push('', state?.queryText ? 'По этому запросу ничего не найдено.' : 'Запусти поиск, чтобы увидеть записи.');
    return lines.join('\n');
  }
  lines.push('', 'Открой результат:');
  lines.push(...state.results.map((item, index) => renderAdminSearchLine(scopeKey, item, index, state?.page || 0, state?.pageSize || 8)));
  return lines.join('\n');
}

function buildAdminSearchResultsKeyboard({ scopeKey, state = null } = {}) {
  const rows = [];
  for (const item of state?.results || []) {
    let callback = 'adm:home';
    let label = 'Открыть';
    if (scopeKey === 'users') {
      callback = `adm:usr:open:${item.userId}:all:0`;
      label = `🪪 ${truncate(item.displayName || item.linkedinName || item.telegramUsername || `User ${item.telegramUserId}`, 42)}`;
    } else if (scopeKey === 'intros') {
      callback = `adm:intro:open:${item.introRequestId}:all:0`;
      label = `📄 ${truncate(`${item.requesterDisplayName || 'Неизвестно'} → ${item.targetDisplayName || 'Неизвестно'}`, 42)}`;
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
  if (state?.hasPrev) pager.push({ text: '◀️ Назад', callback_data: `adm:search:${scopeKey}:page:${Math.max(0, (state?.page || 0) - 1)}` });
  if (state?.hasNext) pager.push({ text: 'Вперёд ▶️', callback_data: `adm:search:${scopeKey}:page:${(state?.page || 0) + 1}` });
  if (pager.length) rows.push(pager);
  rows.push([{ text: `🔎 Искать снова`, callback_data: `adm:search:${scopeKey}` }]);
  rows.push([{ text: '↩️ Назад', callback_data: adminSearchBackCallback(scopeKey) }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}


function buildHealthText({ step = 'STEP039' } = {}) {
  const flags = getPublicFlags();
  const operators = getOperatorConfig();
  const runtimeGuards = getRuntimeGuardConfig();
  return [
    '🩺 Здоровье',
    '',
    `Текущий шаг: ${step}`,
    boolLine('База данных настроена', flags.dbConfigured),
    boolLine('LinkedIn настроен', flags.linkedInConfigured),
    boolLine('Telegram настроен', flags.telegramConfigured),
    boolLine('Секрет webhook настроен', flags.telegramWebhookSecretConfigured),
    boolLine('Квитанции уведомлений настроены', flags.notificationReceiptsConfigured),
    boolLine('Повтор уведомлений настроен', flags.notificationRetryConfigured),
    boolLine('Операторский слой уведомлений настроен', flags.notificationOpsConfigured),
    boolLine('Операторская диагностика настроена', flags.operatorDiagnosticsSurfaceConfigured),
    `Операторов в allowlist: ${operators.operatorTelegramUserIds.length}`,
    `TTL дедупликации update: ${runtimeGuards.updateDedupeTtlSeconds}s`,
    `Троттлинг действий: ${runtimeGuards.actionThrottleSeconds}s`
  ].join('\n');
}

function buildHealthKeyboard() {
  return buildInlineKeyboard([
    [{ text: '🔁 Диагностика повторов', callback_data: 'adm:retry' }],
    [{ text: '👮 Операторы', callback_data: 'adm:opscope' }],
    [{ text: '↩️ Назад в Систему', callback_data: 'adm:sys' }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

function buildOperatorsText({ summary = null } = {}) {
  const operators = getOperatorConfig();
  const lines = [
    '👮 Операторы',
    '',
    `Операторских аккаунтов в allowlist: ${operators.operatorTelegramUserIds.length}`,
    countLine('Недавние события аудита', summary?.recentAuditEvents || 0),
    countLine('Ждут повтора', summary?.retryDue || 0),
    countLine('Исчерпано', summary?.exhausted || 0)
  ];

  if (!operators.operatorTelegramUserIds.length) {
    lines.push('ID операторов Telegram не настроены.');
  } else {
    lines.push('', 'ID операторов Telegram:');
    lines.push(...operators.operatorTelegramUserIds.map((value) => `• ${value}`));
  }

  return lines.join('\n');
}

function buildOperatorsKeyboard() {
  return buildInlineKeyboard([
    [{ text: '🩺 Здоровье', callback_data: 'adm:health' }],
    [{ text: '↩️ Назад в Систему', callback_data: 'adm:sys' }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

function buildLaunchRunbookText() {
  return [
    '🧭 Регламент запуска',
    '',
    'Режим STEP043: узкий launch/ops runbook + manual verification/rehearsal без новых фич и без широких мутаций.',
    '',
    'Ежедневный ритм:',
    '1) открыть Система и проверить retry/exhausted/failures',
    '2) открыть Операции и посмотреть bottlenecks: без профиля / ready-not-listed / pending >24ч / delivery issues',
    '3) открыть Коммуникации и проверить active notice / latest broadcast / outbox errors',
    '4) открыть Аудит и посмотреть relink / listing changes / bulk-prep',
    '5) только потом готовить notice, broadcast или direct follow-up',
    '',
    'Preflight перед notice/broadcast:',
    '• нет свежего callback/deployment инцидента',
    '• нет всплеска delivery failures / exhausted',
    '• сегмент и аудитория совпадают с реальной задачей',
    '• текст подтверждён оператором',
    '• после отправки будет ручной post-check через Outbox/Delivery',
    '',
    'Инциденты:',
    '• LinkedIn callback ломается → стоп коммуникации, сначала env/health/callback truth',
    '• delivery failures растут → стоп новые рассылки, открыть Delivery/Outbox/Audit',
    '• listed-incomplete растёт → сначала чистим Quality/Users, потом льём трафик',
    '',
    'Это read-only runbook. Live status not confirmed — manual verification required.'
  ].join('\n');
}

function buildLaunchRunbookKeyboard() {
  return buildInlineKeyboard([
    [{ text: '🧰 Операции', callback_data: 'adm:ops' }],
    [{ text: '💬 Коммуникации', callback_data: 'adm:comms' }],
    [{ text: '💳 Монетизация', callback_data: 'adm:money' }],
    [{ text: '⚙️ Система', callback_data: 'adm:sys' }],
    [{ text: '✅ Live verification', callback_data: 'adm:verify' }],
    [{ text: '🎭 Репетиция запуска', callback_data: 'adm:rehearse' }],
    [{ text: '🧊 Freeze', callback_data: 'adm:freeze' }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

function buildLaunchFreezeText() {
  return [
    '🧊 Freeze',
    '',
    'Назначение: удержать source baseline стабильным перед ручным запуском и live verification.',
    '',
    'Что замораживаем:',
    '• Telegram router contract',
    '• LinkedIn OIDC flow',
    '• visibility/listing truth',
    '• intro/request/decision truth',
    '• notice/broadcast/send flows',
    '• operator allowlist contract',
    '',
    'Что разрешено:',
    '• docs updates',
    '• narrow bugfix',
    '• smoke/QA sync',
    '• env/deploy verification',
    '',
    'Что не делаем:',
    '• новые product domains',
    '• heavy admin/BI expansion',
    '• broad schema widening',
    '• uncontrolled callback growth',
    '',
    'Правило перед merge/deploy:',
    '1) check + актуальные smokes',
    '2) docsStep/currentStep sync',
    '3) changed files list + QA checklist',
    '4) честный статус без claims о live readiness',
    '',
    'Выход из freeze только после ручного verification pass.'
  ].join('\n');
}

function buildLaunchFreezeKeyboard() {
  return buildInlineKeyboard([
    [{ text: '🧭 Регламент запуска', callback_data: 'adm:runbook' }],
    [{ text: '✅ Live verification', callback_data: 'adm:verify' }],
    [{ text: '🎭 Репетиция запуска', callback_data: 'adm:rehearse' }],
    [{ text: '🩺 Здоровье', callback_data: 'adm:health' }],
    [{ text: '⚙️ Система', callback_data: 'adm:sys' }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

function buildLiveVerificationText() {
  return [
    '✅ Live verification',
    '',
    'Назначение: провести честный ручной verification pass на deployed baseline без расширения scope.',
    '',
    'Порядок проверки:',
    '1) открыть landing / privacy / terms и проверить ссылку на @introdeckbot',
    '2) открыть /api/health и /api/health?full=1, сверить step/docsStep/flags',
    '3) в Telegram проверить /start, /menu, founder-only entry в 👑 Админка и /ops / /admin allowlist gating',
    '4) открыть Админка / Операции / Коммуникации / Система и убедиться, что surfaces живы',
    '5) пройти LinkedIn connect start и callback truth до сохранения identity/profile state',
    '6) проверить direct message, notice prep, broadcast preview и post-check через Outbox/Delivery/Audit',
    '',
    'Фиксируем отдельно:',
    '• source-confirmed',
    '• live-confirmed',
    '• blocked/unconfirmed',
    '• go / no-go',
    '',
    'Разрешённый итог: честный no-go. Нельзя писать, что live готово, если любой из критичных проходов не закрыт.'
  ].join('\n');
}

function buildLiveVerificationKeyboard() {
  return buildInlineKeyboard([
    [{ text: '🎭 Репетиция запуска', callback_data: 'adm:rehearse' }],
    [{ text: '🩺 Здоровье', callback_data: 'adm:health' }],
    [{ text: '🧊 Freeze', callback_data: 'adm:freeze' }],
    [{ text: '⚙️ Система', callback_data: 'adm:sys' }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

function buildLaunchRehearsalText() {
  return [
    '🎭 Репетиция запуска',
    '',
    'Назначение: прогнать founder/operator цикл на узком тестовом коридоре до реального launch verdict.',
    '',
    'Репетиция:',
    '1) health/preflight: retry/exhausted/failures не в аварийном состоянии',
    '2) founder account: /start → /menu → 👑 Админка видна',
    '3) operator shell: Админка / Операции / Коммуникации / Система / Регламент / Freeze / verification открываются',
    '4) users segment: открыть safe segment и проверить drilldowns / bulk-prep contract',
    '5) communications: подготовить notice или broadcast preview без широкого охвата',
    '6) direct message: отправить узкий тестовый ЛС на founder/test recipient',
    '7) post-check: Outbox / Delivery / Audit / Quality без скрытых ошибок и тупиков',
    '',
    'Критерии pass:',
    '• callback/router живы',
    '• LinkedIn/connect path не развален',
    '• коммуникации не дают неожиданных failures',
    '• admin surfaces и русские labels консистентны',
    '',
    'Если rehearsal падает — freeze сохраняется, идём в узкий bugfix, а не в новый scope.'
  ].join('\n');
}

function buildLaunchRehearsalKeyboard() {
  return buildInlineKeyboard([
    [{ text: '✅ Live verification', callback_data: 'adm:verify' }],
    [{ text: '💬 Коммуникации', callback_data: 'adm:comms' }],
    [{ text: '💳 Монетизация', callback_data: 'adm:money' }],
    [{ text: '⚙️ Система', callback_data: 'adm:sys' }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

function buildOperatorOnlyText() {
  return [
    '⚠️ Только для оператора',
    '',
    'Эта зона доступна только операторскому аккаунту.'
  ].join('\n');
}

function buildOperatorOnlyKeyboard() {
  return buildInlineKeyboard([
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

function buildAdminBulkActionsText({ state = null, page = 0, notice = null } = {}) {
  const lines = [
    '📦 Массовые действия',
    '',
    `Сегмент: ${state?.segmentLabel || ADMIN_USER_SEGMENTS[normalizeAdminUserSegment(state?.segmentKey)]?.label || 'Сегмент'} • стр. ${page + 1}`,
    'Безопасный режим: только подготовка шаблона и явное подтверждение в коммуникациях.'
  ];

  const noticeAction = state?.noticeAction || { supported: false, estimate: 0 };
  const broadcastAction = state?.broadcastAction || { supported: false, estimate: 0 };

  lines.push('', 'Notice:');
  if (noticeAction.supported) {
    lines.push(`Шаблон: ${noticeAction.templateLabel}`);
    lines.push(`Аудитория: ${noticeAction.audienceLabel}`);
    lines.push(`Оценка охвата: ${noticeAction.estimate || 0}`);
    if (state?.activeNotice) {
      lines.push('Guard: активный notice сначала нужно выключить вручную.');
    }
  } else {
    lines.push('Для этого сегмента safe notice preset не задан.');
  }

  lines.push('', 'Рассылка:');
  if (broadcastAction.supported) {
    lines.push(`Шаблон: ${broadcastAction.templateLabel}`);
    lines.push(`Аудитория: ${broadcastAction.audienceLabel}`);
    lines.push(`Оценка охвата: ${broadcastAction.estimate || 0}`);
  } else {
    lines.push('Для этого сегмента safe broadcast preset не задан.');
  }

  if (notice) {
    lines.push('', notice);
  }
  return lines.join('\n');
}

function buildAdminBulkActionsKeyboard({ state = null, page = 0 } = {}) {
  const segmentKey = normalizeAdminUserSegment(state?.segmentKey);
  const rows = [];

  if (state?.noticeAction?.supported) {
    rows.push([{ text: `📣 Подготовить notice (${state.noticeAction.estimate || 0})`, callback_data: `adm:bulk:user:${segmentKey}:${page}:not` }]);
  }
  if (state?.broadcastAction?.supported) {
    rows.push([{ text: `📬 Подготовить рассылку (${state.broadcastAction.estimate || 0})`, callback_data: `adm:bulk:user:${segmentKey}:${page}:bc` }]);
  }

  rows.push([{ text: '💬 Коммуникации', callback_data: 'adm:comms' }]);
  rows.push([{ text: '↩️ Назад к пользователям', callback_data: `adm:usr:page:${segmentKey}:${page}` }]);
  rows.push([{ text: '🏠 Главная', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

export function createAdminSurfaceBuilders({ currentStep = 'STEP048' } = {}) {
  return {
    buildAdminHomeSurface: async ({ summary = null } = {}) => ({
      text: buildAdminHomeText({ summary }),
      reply_markup: buildAdminHomeKeyboard({ summary })
    }),
    buildAdminOperationsSurface: async ({ summary = null } = {}) => ({
      text: buildOperationsHubText({ summary }),
      reply_markup: buildOperationsHubKeyboard({ summary })
    }),
    buildAdminCommunicationsSurface: async ({ state = null, notice = null } = {}) => ({
      text: buildCommunicationsHubText({ state, notice }),
      reply_markup: buildCommunicationsHubKeyboard({ state })
    }),
    buildAdminMonetizationSurface: async ({ state = null, notice = null } = {}) => ({
      text: buildAdminMonetizationText({ state, notice }),
      reply_markup: buildAdminMonetizationKeyboard({ state })
    }),
    buildAdminSystemSurface: async ({ summary = null } = {}) => ({
      text: buildSystemHubText({ summary }),
      reply_markup: buildSystemHubKeyboard({ summary })
    }),
    buildAdminHealthSurface: async () => ({
      text: buildHealthText({ step: currentStep }),
      reply_markup: buildHealthKeyboard()
    }),
    buildAdminOperatorsSurface: async ({ summary = null } = {}) => ({
      text: buildOperatorsText({ summary }),
      reply_markup: buildOperatorsKeyboard()
    }),
    buildAdminRunbookSurface: async () => ({
      text: buildLaunchRunbookText(),
      reply_markup: buildLaunchRunbookKeyboard()
    }),
    buildAdminFreezeSurface: async () => ({
      text: buildLaunchFreezeText(),
      reply_markup: buildLaunchFreezeKeyboard()
    }),
    buildAdminLiveVerificationSurface: async () => ({
      text: buildLiveVerificationText(),
      reply_markup: buildLiveVerificationKeyboard()
    }),
    buildAdminLaunchRehearsalSurface: async () => ({
      text: buildLaunchRehearsalText(),
      reply_markup: buildLaunchRehearsalKeyboard()
    }),
    buildAdminUsersSurface: async ({ state, notice = null }) => ({
      text: buildUsersListText({ state, notice }),
      reply_markup: buildUsersListKeyboard({ state })
    }),
    buildAdminBulkActionsSurface: async ({ state = null, page = 0, notice = null } = {}) => ({
      text: buildAdminBulkActionsText({ state, page, notice }),
      reply_markup: buildAdminBulkActionsKeyboard({ state, page })
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
    buildAdminNoticePreviewSurface: async ({ state = null, notice = null } = {}) => buildAdminNoticeПревьюSurface({ state, notice }),
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
      text: buildAdminDirectПревьюText({ card, state, notice }),
      reply_markup: buildAdminDirectПревьюKeyboard({ targetUserId: card?.user_id || state?.draft?.targetUserId || 0, segmentKey, page })
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
