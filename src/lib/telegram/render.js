import {
  DIRECTORY_INDUSTRY_BUCKETS,
  DIRECTORY_SKILLS,
  PROFILE_FIELDS,
  getContactModeLabel,
  summarizeDirectoryFilters
} from '../profile/contract.js';

function buildInlineKeyboard(rows) {
  return {
    inline_keyboard: rows
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inviteSourceLabel(source) {
  if (source === 'inline_share') {
    return 'inline';
  }
  if (source === 'invite_card') {
    return 'card';
  }
  return 'link';
}

function renderInviteFriendLine(item, index) {
  const name = toDisplayValue(item?.displayName, 'New contact');
  const headline = item?.headlineUser ? ` — ${truncate(item.headlineUser, 34)}` : '';
  const status = item?.status === 'activated' ? 'activated' : 'joined';
  return `${index + 1}. ${name}${headline} • ${status} via ${inviteSourceLabel(item?.source)} • ${formatDateShort(item?.joinedAt)}`;
}

function renderInviteHistoryLine(item, index, startIndex = 0) {
  const name = toDisplayValue(item?.displayName, 'New contact');
  const headline = item?.headlineUser ? ` — ${truncate(item.headlineUser, 40)}` : '';
  const joined = formatDateShort(item?.joinedAt);
  const activated = item?.status === 'activated' && item?.activatedAt ? formatDateShort(item?.activatedAt) : null;
  const status = item?.status === 'activated' ? 'activated' : 'joined';
  return `${startIndex + index + 1}. ${name}${headline} • ${status} via ${inviteSourceLabel(item?.source)} • joined ${joined}${activated ? ` • activated ${activated}` : ''}`;
}

function getInviteActivationRate(invitedCount = 0, activatedCount = 0) {
  const invited = Number(invitedCount || 0) || 0;
  const activated = Number(activatedCount || 0) || 0;
  if (invited <= 0) {
    return '0%';
  }
  return `${Math.round((activated / invited) * 1000) / 10}%`;
}

function renderAdminInviteTopLine(item, index) {
  return `${index + 1}. ${toDisplayValue(item?.displayName, 'Member')} — ${Number(item?.invitedCount || 0)} invited • ${Number(item?.activatedCount || 0)} activated • ${Number(item?.activationRate || 0)}%`;
}

function renderAdminInviteRecentLine(item, index) {
  const status = item?.status === 'activated' ? 'activated' : 'joined';
  return `${index + 1}. ${toDisplayValue(item?.referrerDisplayName, 'Member')} → ${toDisplayValue(item?.displayName, 'Member')} • ${status} via ${inviteSourceLabel(item?.source)} • ${formatDateShort(item?.joinedAt)}`;
}

function buildJoinIntroDeckAnchor(inviteUrl) {
  return inviteUrl ? `<a href="${escapeHtml(inviteUrl)}">Join Intro Deck</a>` : 'Join Intro Deck';
}

function toDisplayValue(value, fallback = '—') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function truncate(value, maxLength = 160) {
  const normalized = toDisplayValue(value, '');
  if (!normalized) {
    return '—';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function formatSkillSummary(profileSnapshot, fallback = '—') {
  const labels = Array.isArray(profileSnapshot?.skills) ? profileSnapshot.skills.map((skill) => skill.skill_label) : [];
  if (!labels.length) {
    return fallback;
  }

  return labels.join(', ');
}

function completionLine(profileSnapshot) {
  const completion = profileSnapshot?.completion;
  if (!completion) {
    return 'Profile completion: 0/0 fields • Skills 0/1+';
  }

  return `Profile completion: ${completion.filledCount}/${completion.totalCount} fields • Required ${completion.requiredFilledCount}/${completion.requiredCount} • Skills ${completion.skillsCount}/${completion.requiredSkillCount}+`;
}

function readinessLine(profileSnapshot) {
  const completion = profileSnapshot?.completion;
  if (!completion) {
    return 'Directory readiness: not ready yet';
  }

  if (!completion.hasRequiredSkills) {
    return 'Directory readiness: add at least 1 skill';
  }

  if (!completion.isReady) {
    return 'Directory readiness: complete all required fields';
  }

  if (profileSnapshot?.visibility_status === 'listed') {
    return 'Directory readiness: ready • currently listed';
  }

  return 'Directory readiness: ready • currently hidden';
}

function linkedinIdentityImportLine(profileSnapshot) {
  if (!profileSnapshot?.linkedin_sub) {
    return null;
  }

  const imported = [];
  if (profileSnapshot?.linkedin_name) imported.push('name');
  if (profileSnapshot?.linkedin_picture_url) imported.push('photo');
  if (profileSnapshot?.linkedin_locale) imported.push(`locale=${profileSnapshot.linkedin_locale}`);

  return imported.length
    ? `LinkedIn import: basic identity synced (${imported.join(' • ')})`
    : 'LinkedIn import: basic identity synced';
}


function buildLinkedInIdentityDetailLines(profileSnapshot, { includeEmail = false } = {}) {
  if (!profileSnapshot?.linkedin_sub) {
    return [];
  }

  const lines = [];
  if (profileSnapshot?.linkedin_name) lines.push(`• Name: ${profileSnapshot.linkedin_name}`);
  if (profileSnapshot?.linkedin_given_name) lines.push(`• Given name: ${profileSnapshot.linkedin_given_name}`);
  if (profileSnapshot?.linkedin_family_name) lines.push(`• Family name: ${profileSnapshot.linkedin_family_name}`);
  if (profileSnapshot?.linkedin_picture_url) lines.push('• Photo: imported');
  if (profileSnapshot?.linkedin_locale) lines.push(`• Locale: ${profileSnapshot.linkedin_locale}`);
  if (includeEmail && profileSnapshot?.linkedin_email) lines.push(`• Email: ${profileSnapshot.linkedin_email}`);
  return lines;
}

function buildBackHomeRow(backText, backCallbackData) {
  return [
    { text: backText, callback_data: backCallbackData },
    { text: '🏠 Home', callback_data: 'home:root' }
  ];
}

function buildFieldStatusLines(profileSnapshot) {
  const completion = profileSnapshot?.completion;
  if (!completion?.fields?.length) {
    return ['No profile fields yet'];
  }

  const lines = completion.fields.map((field) => `${field.filled ? '✅' : '▫️'} ${field.label}: ${truncate(field.value, 90)}`);
  lines.push(`${completion.hasRequiredSkills ? '✅' : '▫️'} Skills: ${formatSkillSummary(profileSnapshot)}`);
  return lines;
}

function skillButton(profileSnapshot, skill) {
  const selected = Array.isArray(profileSnapshot?.skills) && profileSnapshot.skills.some((item) => item.skill_slug === skill.slug);
  return {
    text: `${selected ? '✅' : '▫️'} ${skill.label}`,
    callback_data: `p:skt:${skill.slug}`
  };
}

function filterSkillButton(filterSummary, skill) {
  const selected = Array.isArray(filterSummary?.selectedSkillSlugs) && filterSummary.selectedSkillSlugs.includes(skill.slug);
  return {
    text: `${selected ? '✅' : '▫️'} ${skill.label}`,
    callback_data: `dir:fs:${skill.slug}`
  };
}

function filterIndustryButton(filterSummary, industryBucket) {
  const selected = filterSummary?.selectedIndustrySlug === industryBucket.slug;
  return {
    text: `${selected ? '✅' : '▫️'} ${industryBucket.label}`,
    callback_data: `dir:fi:${industryBucket.slug}`
  };
}

function directoryProfileLabel(profileSnapshot) {
  const name = toDisplayValue(profileSnapshot.display_name, profileSnapshot.linkedin_name || 'Unnamed profile');
  const headline = toDisplayValue(profileSnapshot.headline_user, 'No headline');
  return `${name} — ${truncate(headline, 28)}`;
}

function profileContactModeSummary(profileSnapshot) {
  const label = getContactModeLabel(profileSnapshot?.contact_mode);
  if (profileSnapshot?.contact_mode === 'paid_unlock_requires_approval') {
    return `${label} • owner approval required`;
  }
  return label;
}

function hiddenTelegramUsernameSummary(profileSnapshot) {
  const value = typeof profileSnapshot?.telegram_username_hidden === 'string' ? profileSnapshot.telegram_username_hidden.trim() : '';
  return value ? `@${value}` : 'not set';
}

function directContactAvailabilityLine(profileSnapshot) {
  if (profileSnapshot?.is_viewer) {
    return `Hidden Telegram username: ${hiddenTelegramUsernameSummary(profileSnapshot)}`;
  }

  if (profileSnapshot?.contact_mode === 'paid_unlock_requires_approval') {
    return 'Direct contact: available by paid request • recipient approval required';
  }

  return 'Direct contact: intro only';
}

function canViewerRequestDirectContact(profileSnapshot) {
  return Boolean(!profileSnapshot?.is_viewer && profileSnapshot?.profile_id && profileSnapshot?.contact_mode === 'paid_unlock_requires_approval');
}

function canViewerRequestDm(profileSnapshot) {
  return Boolean(!profileSnapshot?.is_viewer && profileSnapshot?.profile_id);
}

function renderDmThreadLine(item, index) {
  const name = toDisplayValue(item?.display_name, 'Unknown member');
  const headline = truncate(item?.headline_user, 36);
  const paidHint = Number.isFinite(Number(item?.price_stars_snapshot)) ? ` • ${item.price_stars_snapshot}⭐` : '';
  return `${index + 1}. ${name} — ${headline} • ${item?.status || 'pending'}${paidHint} • ${formatDateShort(item?.last_message_at || item?.updated_at || item?.created_at)}`;
}

function renderDmMessageLine(message, viewerUserId) {
  const direction = String(message?.sender_user_id) === String(viewerUserId) ? 'You' : 'Them';
  const kind = message?.message_kind === 'request' ? 'request' : 'message';
  return `${direction} • ${kind} • ${formatDateTimeShort(message?.created_at)}
${truncate(message?.message_text, 280)}`;
}

function renderContactUnlockLine(item, index) {
  const name = toDisplayValue(item?.display_name, 'Unknown member');
  const headline = truncate(item?.headline_user, 36);
  const paidHint = Number.isFinite(Number(item?.price_stars_snapshot)) ? ` • ${item.price_stars_snapshot}⭐` : '';
  const revealHint = item?.status === 'revealed' && item?.revealed_contact_value ? ` • @${String(item.revealed_contact_value).replace(/^@+/, '')}` : '';
  return `${index + 1}. ${name} — ${headline} • ${item?.status || 'pending'}${paidHint}${revealHint} • ${formatDateShort(item?.requested_at || item?.updated_at)}`;
}

function renderFilterSummaryLines(filterSummary = summarizeDirectoryFilters()) {
  return [
    `Search: ${filterSummary.textQueryLabel}`,
    `City: ${filterSummary.cityQueryLabel}`,
    `Industry: ${filterSummary.industryLabel}`,
    `Skills: ${filterSummary.skillLabels}`
  ];
}

function formatDateShort(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toISOString().slice(0, 10);
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

function notificationBucketLabel(bucket) {
  if (bucket === 'retry_due') {
    return 'retry due';
  }
  if (bucket === 'exhausted') {
    return 'exhausted';
  }
  if (bucket === 'failed') {
    return 'failed';
  }
  if (bucket === 'skipped') {
    return 'skipped';
  }
  if (bucket === 'sent') {
    return 'sent';
  }
  return 'all';
}

function renderNotificationReceiptLine(item, index) {
  const introRequestId = item?.introRequestId ? `intro #${item.introRequestId}` : 'intro —';
  const errorCode = item?.lastErrorCode ? ` • ${item.lastErrorCode}` : '';
  const nextAttempt = item?.operatorBucket === 'retry_due' || item?.operatorBucket === 'failed'
    ? ` • next ${formatDateTimeShort(item?.nextAttemptAt)}`
    : '';

  return `${index + 1}. ${introRequestId} • ${item?.eventType || 'event'} • ${notificationBucketLabel(item?.operatorBucket)} • attempt ${item?.attemptCount || 0}/${item?.maxAttempts || 0} • last ${formatDateTimeShort(item?.lastAttemptAt || item?.deliveredAt || item?.createdAt)}${nextAttempt}${errorCode}`;
}

function collectOperatorIntroButtons({ diagnostics = null, hotRetryDue = [], hotFailed = [], hotExhausted = [] } = {}) {
  const unique = new Set();
  const items = [
    ...(diagnostics?.recent || []),
    ...hotRetryDue,
    ...hotFailed,
    ...hotExhausted
  ];

  for (const item of items) {
    if (item?.introRequestId) {
      unique.add(item.introRequestId);
    }

    if (unique.size >= 3) {
      break;
    }
  }

  return Array.from(unique);
}

function renderIntroRequestLine(item, index) {
  const name = toDisplayValue(item?.display_name, 'Unknown member');
  const headline = truncate(item?.headline_user, 36);
  const contactHint = introContactHint(item);
  const historyHint = item?.archived_snapshot_only ? 'archived snapshot' : null;
  return `${index + 1}. ${name} — ${headline} • ${item?.status || 'pending'} • ${formatDateShort(item?.created_at)}${contactHint ? ` • ${contactHint}` : ''}${historyHint ? ` • ${historyHint}` : ''}`;
}

function hasLinkedInUrl(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function canViewerOpenDirectoryLinkedIn(profileSnapshot) {
  if (!hasLinkedInUrl(profileSnapshot?.linkedin_public_url)) {
    return false;
  }

  if (profileSnapshot?.is_viewer) {
    return true;
  }

  return profileSnapshot?.contact_mode === 'external_link';
}

function directoryContactLabel(profileSnapshot) {
  const publicLinkedInLabel = profileSnapshot?.is_viewer
    ? `Public LinkedIn URL: ${toDisplayValue(profileSnapshot?.linkedin_public_url)}`
    : profileSnapshot?.contact_mode === 'intro_request'
      ? (hasLinkedInUrl(profileSnapshot?.linkedin_public_url) ? 'Public LinkedIn URL: shared after accepted intro' : 'Public LinkedIn URL: not provided')
      : `Public LinkedIn URL: ${toDisplayValue(profileSnapshot?.linkedin_public_url)}`;

  return `${publicLinkedInLabel}
${directContactAvailabilityLine(profileSnapshot)}`;
}

function canOpenReceivedSenderLinkedIn(item) {
  return item?.role === 'received' && hasLinkedInUrl(item?.linkedin_public_url);
}

function canOpenAcceptedTargetLinkedIn(item) {
  return item?.role === 'sent' && item?.status === 'accepted' && hasLinkedInUrl(item?.linkedin_public_url);
}

function introContactHint(item) {
  if (canOpenReceivedSenderLinkedIn(item)) {
    return item?.status === 'pending' ? 'sender link available for review' : 'sender link available';
  }

  if (canOpenAcceptedTargetLinkedIn(item)) {
    return 'contact unlocked';
  }

  if (item?.role === 'sent' && item?.status === 'accepted') {
    return 'accepted • no shared link set';
  }

  return null;
}


function introRoleLabel(item) {
  return item?.role === 'received' ? 'Received intro' : 'Sent intro';
}

function notificationHeadline(value) {
  const normalized = truncate(value, 72);
  return normalized === '—' ? 'No headline' : normalized;
}

function homeNextStepLine(profileSnapshot) {
  if (!profileSnapshot?.linkedin_sub) {
    return 'Next step: connect LinkedIn to create your profile card.';
  }

  if (!profileSnapshot?.completion?.isReady) {
    return 'Next step: complete your profile to appear in the directory.';
  }

  if (profileSnapshot?.visibility_status === 'listed') {
    return 'Your profile is live in the directory.';
  }

  return 'Next step: list your profile when you are ready to accept intros.';
}

export function renderIntroNotificationText({ eventType = null, introRequest = null } = {}) {
  const member = toDisplayValue(introRequest?.display_name, 'Unknown member');
  const headline = notificationHeadline(introRequest?.headline_user);

  if (eventType === 'intro_request_created') {
    return [
      '📬 New intro request',
      '',
      `${member} wants to connect.`,
      headline,
      '',
      'Open the intro inbox or review this request directly.'
    ].join('\n');
  }

  if (eventType === 'intro_request_accepted') {
    return [
      '✅ Intro accepted',
      '',
      `${member} accepted your intro request.`,
      headline,
      '',
      'Open the intro detail to review the current contact outcome.'
    ].join('\n');
  }

  if (eventType === 'intro_request_declined') {
    return [
      '❌ Intro declined',
      '',
      `${member} declined your intro request.`,
      headline,
      '',
      'Open the intro detail to review the final state.'
    ].join('\n');
  }

  return [
    '🧾 Intro receipt',
    '',
    `${member}`,
    headline
  ].join('\n');
}

export function renderIntroNotificationKeyboard({ eventType = null, introRequestId = null } = {}) {
  const rows = [];

  if (introRequestId) {
    rows.push([{ text: '🧾 View intro', callback_data: `intro:view:${introRequestId}` }]);
  }

  if (eventType === 'intro_request_created') {
    rows.push([{ text: '📥 Open inbox', callback_data: 'intro:inbox' }]);
  }

  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

function introStatusNote(item) {
  if (item?.role === 'received' && item?.status === 'pending') {
    return 'You can accept or decline this intro request.';
  }

  if (item?.role === 'received' && item?.status === 'accepted') {
    return 'You accepted this intro request. If you submitted a public LinkedIn URL, the requester can now open it from their accepted intro row.';
  }

  if (item?.role === 'received' && item?.status === 'declined') {
    return 'You declined this intro request. No contact is unlocked for the requester.';
  }

  if (item?.role === 'sent' && item?.status === 'pending') {
    return 'Waiting for the recipient to accept or decline this intro request.';
  }

  if (item?.role === 'sent' && item?.status === 'accepted' && canOpenAcceptedTargetLinkedIn(item)) {
    return 'Accepted. The recipient shared a LinkedIn URL and you can open it below.';
  }

  if (item?.role === 'sent' && item?.status === 'accepted') {
    return 'Accepted. The recipient did not provide a public LinkedIn URL.';
  }

  if (item?.role === 'sent' && item?.status === 'declined') {
    return 'Declined. No contact was unlocked.';
  }

  if (item?.archived_snapshot_only) {
    return 'The live counterparty profile is gone, but the intro history snapshot is preserved here.';
  }

  return 'Intro decision state is visible here.';
}

export function buildLinkedInStartUrl({ appBaseUrl, telegramUserId, returnTo = '/menu' }) {
  const url = new URL('/api/oauth/start/linkedin', appBaseUrl);
  url.searchParams.set('tg_id', String(telegramUserId));
  url.searchParams.set('ret', returnTo);
  return url.toString();
}

export function renderHomeText({ profileSnapshot = null, persistenceEnabled = false, directoryStats = null, introInboxStats = null, isOperator = false, notice = null } = {}) {
  const lines = [
    '💼 Intro Deck',
    '',
    'Trusted profiles and warm intros inside Telegram.',
    ''
  ];

  if (!persistenceEnabled) {
    lines.push('Profile saving is unavailable right now.');
  } else if (!profileSnapshot?.linkedin_sub) {
    lines.push('LinkedIn: not connected yet');
    lines.push(homeNextStepLine(profileSnapshot));
  } else {
    const displayName = profileSnapshot.display_name || profileSnapshot.linkedin_name || 'Profile linked';
    lines.push(`Connected as: ${displayName}`);
    const linkedInImportLine = linkedinIdentityImportLine(profileSnapshot);
    if (linkedInImportLine) {
      lines.push(linkedInImportLine);
    }
    lines.push(`Profile status: ${profileSnapshot.profile_state || 'draft'} • ${profileSnapshot.visibility_status || 'hidden'}`);
    lines.push(completionLine(profileSnapshot));
    lines.push(readinessLine(profileSnapshot));
    lines.push(`Skills: ${formatSkillSummary(profileSnapshot)}`);
    lines.push(homeNextStepLine(profileSnapshot));
  }

  if (directoryStats) {
    lines.push('');
    lines.push(`Directory: ${directoryStats.totalCount} live profile${directoryStats.totalCount === 1 ? '' : 's'}`);
  }

  if (introInboxStats) {
    lines.push('');
    lines.push(`Intros: ${introInboxStats.receivedPending || 0} pending received • ${introInboxStats.sentPending || 0} pending sent`);
  }

  if (isOperator) {
    lines.push('');
    lines.push('Admin tools are available for this account.');
  }

  if (notice) {
    lines.push('');
    lines.push(notice);
  }

  return lines.join('\n');
}

export function renderHomeKeyboard({ appBaseUrl, telegramUserId, profileSnapshot = null, persistenceEnabled = false, isOperator = false }) {
  const rows = [];
  const isLinkedInConnected = Boolean(profileSnapshot?.linkedin_sub);

  if (!isLinkedInConnected) {
    rows.push([{ text: '🔐 Connect LinkedIn', url: buildLinkedInStartUrl({ appBaseUrl, telegramUserId }) }]);
  } else if (persistenceEnabled) {
    const profileLabel = profileSnapshot?.completion?.isReady ? '🧩 Edit profile' : '🧩 Complete profile';
    rows.push([
      { text: profileLabel, callback_data: 'p:menu' },
      { text: '🌐 Browse directory', callback_data: 'dir:list:0' }
    ]);
  }

  if (persistenceEnabled && !isLinkedInConnected) {
    rows.push([
      { text: '🌐 Browse directory', callback_data: 'dir:list:0' },
      { text: '⭐ Plans', callback_data: 'plans:root' }
    ]);
  }

  if (persistenceEnabled && isLinkedInConnected) {
    rows.push([
      { text: '📥 Intro inbox', callback_data: 'intro:inbox' },
      { text: '💬 DM inbox', callback_data: 'dm:inbox' }
    ]);
    rows.push([
      { text: '⭐ Plans', callback_data: 'plans:root' },
      { text: '📨 Invite contacts', callback_data: 'invite:root' }
    ]);
  }

  rows.push([{ text: '❓ Help', callback_data: 'help:root' }]);

  if (isOperator) {
    rows.push([{ text: '👑 Админка', callback_data: 'adm:home' }]);
  }

  return buildInlineKeyboard(rows);
}

export function renderHelpText() {
  return [
    '❓ Help',
    '',
    'Use Intro Deck to connect your LinkedIn identity, complete a concise profile inside Telegram, browse trusted professionals, send warm intros, open gated DM requests, and manage Pro access when you need direct contact.',
    '',
    'Start here:',
    '• connect LinkedIn',
    '• complete your profile',
    '• browse the directory',
    '• check your intro inbox',
    '• review your DM inbox',
    '• open plans / Pro status',
    '• invite trusted contacts'
  ].join('\n');
}

export function renderHelpKeyboard() {
  return buildInlineKeyboard([
    [
      { text: '🧩 Profile', callback_data: 'p:menu' },
      { text: '🌐 Browse directory', callback_data: 'dir:list:0' }
    ],
    [
      { text: '📥 Intro inbox', callback_data: 'intro:inbox' },
      { text: '💬 DM inbox', callback_data: 'dm:inbox' }
    ],
    [
      { text: '⭐ Plans', callback_data: 'plans:root' },
      { text: '📨 Invite contacts', callback_data: 'invite:root' }
    ],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

function pricingReceiptLabel(receipt) {
  if (receipt?.receiptType === 'subscription') {
    return 'Pro';
  }
  if (receipt?.receiptType === 'contact_unlock') {
    return 'Direct contact';
  }
  if (receipt?.receiptType === 'dm_open') {
    return 'DM open';
  }
  return toDisplayValue(receipt?.receiptType, 'Receipt');
}

export function renderPricingText({ pricingState = null } = {}) {
  const state = pricingState || {};
  const pricing = state.pricing || {};
  const subscriptionConfig = state.subscriptionConfig || {};
  const subscription = state.subscription || null;
  const recentReceipts = Array.isArray(state.recentReceipts) ? state.recentReceipts.slice(0, 5) : [];
  const lines = [
    '⭐ Intro Deck Pro',
    '',
    'Use Pro when you want direct-contact requests and DM request opens included during your active subscription.',
    ''
  ];

  if (!state.persistenceEnabled) {
    lines.push('Pricing and purchase history are unavailable right now.');
  } else if (subscription?.isActive) {
    lines.push(`Status: Pro active until ${formatDateShort(subscription.expiresAt)}`);
  } else if (subscription?.expiresAt) {
    lines.push(`Status: Pro inactive • last expired ${formatDateShort(subscription.expiresAt)}`);
  } else {
    lines.push('Status: Pro not active yet');
  }

  lines.push('');
  lines.push(`Pro monthly: ${pricing.proMonthlyPriceStars || 0}⭐ • ${subscriptionConfig.proMonthlyDurationDays || 30} days`);
  lines.push(`Direct contact request: ${pricing.contactUnlockPriceStars || 0}⭐ each without Pro`);
  lines.push(`DM request open: ${pricing.dmOpenPriceStars || 0}⭐ each without Pro`);
  lines.push('');
  lines.push('Included with active Pro:');
  lines.push('• direct-contact request opens');
  lines.push('• DM request opens');

  if (recentReceipts.length) {
    lines.push('');
    lines.push('Recent purchases:');
    for (const receipt of recentReceipts) {
      lines.push(`• ${pricingReceiptLabel(receipt)} • ${receipt?.amountStars || 0}⭐ • ${formatDateShort(receipt?.confirmedAt || receipt?.purchasedAt)}`);
    }
  }

  if (state.reason && !state.persistenceEnabled) {
    lines.push('');
    lines.push(`Reason: ${state.reason}`);
  }

  return lines.join('\n');
}

export function renderPricingKeyboard({ pricingState = null } = {}) {
  const state = pricingState || {};
  const pricing = state.pricing || {};
  const subscription = state.subscription || null;
  const rows = [];

  if (state.persistenceEnabled) {
    if (subscription?.isActive) {
      rows.push([{ text: `✅ Pro active • until ${formatDateShort(subscription.expiresAt)}`, callback_data: 'plans:root' }]);
    } else {
      rows.push([{ text: `⭐ Buy Pro • ${pricing.proMonthlyPriceStars || 0}⭐`, callback_data: 'plans:buy:pro' }]);
    }
    rows.push([
      { text: '🔄 Refresh', callback_data: 'plans:root' },
      { text: '🏠 Home', callback_data: 'home:root' }
    ]);
    return buildInlineKeyboard(rows);
  }

  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

export function renderProfileMenuText({ profileSnapshot = null, persistenceEnabled = false, notice = null } = {}) {
  const lines = [
    '🧩 Profile editor',
    ''
  ];

  if (!persistenceEnabled) {
    lines.push('Profile editing is unavailable right now.');
  } else if (!profileSnapshot?.linkedin_sub) {
    lines.push('Connect LinkedIn first, then return here to complete your profile.');
  } else {
    lines.push('🔗 LinkedIn');
    lines.push(`• Connected as: ${profileSnapshot.linkedin_name || profileSnapshot.display_name || 'LinkedIn user'}`);
    const linkedInImportLine = linkedinIdentityImportLine(profileSnapshot);
    if (linkedInImportLine) {
      lines.push(`• ${linkedInImportLine.replace(/^LinkedIn import:\s*/i, '')}`);
    }
    lines.push(...buildLinkedInIdentityDetailLines(profileSnapshot, { includeEmail: true }));
    lines.push('• These LinkedIn basics are stored privately. Only your card fields below appear publicly.');
    lines.push('');

    lines.push('🪪 Your card');
    lines.push(`• Public card name: ${toDisplayValue(profileSnapshot.display_name, profileSnapshot.linkedin_name || '—')}`);
    lines.push(`• Profile status: ${profileSnapshot.profile_state || 'draft'}`);
    lines.push(`• Visibility: ${profileSnapshot.visibility_status || 'hidden'}`);
    lines.push(`• ${readinessLine(profileSnapshot)}`);
    lines.push(`• ${completionLine(profileSnapshot)}`);
    lines.push('');

    lines.push('🔒 Contact');
    lines.push(`• Hidden Telegram username: ${hiddenTelegramUsernameSummary(profileSnapshot)}`);
    lines.push(`• Contact mode: ${profileContactModeSummary(profileSnapshot)}`);
    lines.push('');

    lines.push('✍️ Card fields');
    lines.push(...buildFieldStatusLines(profileSnapshot));
  }

  if (notice) {
    lines.push('');
    lines.push(notice);
  }

  return lines.join('\n');
}

export function renderProfileMenuKeyboard({ appBaseUrl = null, telegramUserId = null, profileSnapshot = null, persistenceEnabled = false } = {}) {
  if (!persistenceEnabled) {
    return buildInlineKeyboard([
      [{ text: '🏠 Home', callback_data: 'home:root' }]
    ]);
  }

  if (!profileSnapshot?.linkedin_sub) {
    const rows = [];
    if (appBaseUrl && telegramUserId) {
      rows.push([{ text: '🔐 Connect LinkedIn', url: buildLinkedInStartUrl({ appBaseUrl, telegramUserId }) }]);
    }
    rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
    return buildInlineKeyboard(rows);
  }

  const visibilityLabel = profileSnapshot?.visibility_status === 'listed' ? '🙈 Hide from directory' : '🌐 List in directory';

  return buildInlineKeyboard([
    [
      { text: '✏️ Display name', callback_data: 'p:ed:dn' },
      { text: '✏️ Headline', callback_data: 'p:ed:hl' }
    ],
    [
      { text: '🏢 Company', callback_data: 'p:ed:co' },
      { text: '📍 City', callback_data: 'p:ed:ci' }
    ],
    [
      { text: '🏷 Industry', callback_data: 'p:ed:in' },
      { text: '📝 About', callback_data: 'p:ed:ab' }
    ],
    [
      { text: '🔗 LinkedIn URL', callback_data: 'p:ed:li' },
      { text: '🔐 Telegram', callback_data: 'p:ed:tg' }
    ],
    [{ text: '🧠 Skills', callback_data: 'p:sk' }],
    [{ text: '💳 Contact mode', callback_data: 'p:cm' }],
    [{ text: '👁 Preview card', callback_data: 'p:prev' }],
    [{ text: visibilityLabel, callback_data: 'p:vis' }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

export function renderProfilePreviewText({ profileSnapshot = null, persistenceEnabled = false, notice = null } = {}) {
  const lines = [
    '👁 Profile preview',
    ''
  ];

  if (!persistenceEnabled) {
    lines.push('Preview is unavailable right now.');
  } else if (!profileSnapshot?.linkedin_sub) {
    lines.push('Connect LinkedIn first before previewing your profile.');
  } else {
    lines.push('🪪 Public card');
    lines.push(`${toDisplayValue(profileSnapshot.display_name, profileSnapshot.linkedin_name || 'Unnamed profile')}`);
    lines.push(toDisplayValue(profileSnapshot.headline_user));
    lines.push('');
    lines.push(`🏢 Company: ${toDisplayValue(profileSnapshot.company_user)}`);
    lines.push(`📍 City: ${toDisplayValue(profileSnapshot.city_user)}`);
    lines.push(`🏷 Industry: ${toDisplayValue(profileSnapshot.industry_user)}`);
    lines.push(`🧠 Skills: ${formatSkillSummary(profileSnapshot)}`);
    lines.push(`🔗 Public LinkedIn URL: ${toDisplayValue(profileSnapshot.linkedin_public_url)}`);
    lines.push('');

    lines.push('🔒 Contact & status');
    lines.push(`• Hidden Telegram username: ${hiddenTelegramUsernameSummary(profileSnapshot)}`);
    lines.push(`• Contact mode: ${profileContactModeSummary(profileSnapshot)}`);
    lines.push(`• Visibility: ${toDisplayValue(profileSnapshot.visibility_status)}`);
    lines.push(`• State: ${toDisplayValue(profileSnapshot.profile_state)}`);
    lines.push('');

    lines.push('📝 About');
    lines.push(truncate(profileSnapshot.about_user, 320));
    lines.push('');

    lines.push('📊 Directory readiness');
    lines.push(`• ${readinessLine(profileSnapshot)}`);

    const identityLines = buildLinkedInIdentityDetailLines(profileSnapshot, { includeEmail: true });
    if (identityLines.length) {
      lines.push('');
      lines.push('🔗 LinkedIn basics synced privately');
      lines.push(...identityLines);
      lines.push('• These LinkedIn basics are stored privately and do not replace your public card fields automatically, except the initial card name seed.');
    }
  }

  if (notice) {
    lines.push('');
    lines.push(notice);
  }

  return lines.join('\n');
}

export function renderProfilePreviewKeyboard() {
  return buildInlineKeyboard([
    [
      { text: '↩️ Back to profile', callback_data: 'p:menu' },
      { text: '🏠 Home', callback_data: 'home:root' }
    ]
  ]);
}

export function renderProfileInputPrompt({ fieldKey, profileSnapshot = null } = {}) {
  const meta = PROFILE_FIELDS[fieldKey];
  if (!meta) {
    throw new Error(`Unsupported field key for prompt: ${fieldKey}`);
  }

  const currentValue = profileSnapshot?.[meta.column] || null;
  const lines = [
    `✏️ Edit ${meta.label}`,
    '',
    meta.prompt,
    '',
    `• Current value: ${toDisplayValue(currentValue)}`,
    `• Limit: ${meta.maxLength} characters`,
    '',
    'Reply with plain text in the chat. Your next text message will update this field.',
    'Use the buttons below to go back or return home.'
  ];

  return lines.join('\n');
}

export function renderProfileInputKeyboard() {
  return buildInlineKeyboard([
    [
      { text: '↩️ Back to profile', callback_data: 'p:menu' },
      { text: '🏠 Home', callback_data: 'home:root' }
    ]
  ]);
}

export function renderDirectoryFilterInputPrompt({ kind, filterSummary = summarizeDirectoryFilters() } = {}) {
  const label = kind === 'q' ? 'Search text' : 'City';
  const prompt = kind === 'q'
    ? 'Send a short text query for the public directory. It matches display name, headline, company, industry, and about.'
    : 'Send a city or location fragment to narrow the public directory.';
  const currentValue = kind === 'q' ? filterSummary.textQueryLabel : filterSummary.cityQueryLabel;
  const limit = kind === 'q' ? 80 : 60;

  return [
    `✏️ Edit ${label}`,
    '',
    prompt,
    '',
    `Current value: ${currentValue}`,
    `Limit: ${limit} characters`,
    '',
    'Reply with plain text in the chat. Your next text message will update this directory filter.',
    'Use the buttons below to go back or return home.'
  ].join('\n');
}

export function renderDirectoryFilterInputKeyboard() {
  return buildInlineKeyboard([
    [{ text: '↩️ Back to filters', callback_data: 'dir:flt' }],
    [{ text: '🌐 Browse directory', callback_data: 'dir:list:0' }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

export function renderProfileSkillsText({ profileSnapshot = null, persistenceEnabled = false, notice = null } = {}) {
  const lines = [
    '🧠 Skills selection',
    '',
    'Pick the skills or lanes that best describe your work. At least 1 skill is required before the profile can become directory-ready.',
    ''
  ];

  if (!persistenceEnabled) {
    lines.push('Persistence is disabled in this environment. Skill selection is unavailable.');
  } else if (!profileSnapshot?.linkedin_sub) {
    lines.push('Connect LinkedIn first before editing skills.');
  } else {
    lines.push(`Selected skills: ${formatSkillSummary(profileSnapshot)}`);
    lines.push(completionLine(profileSnapshot));
    lines.push(readinessLine(profileSnapshot));
  }

  if (notice) {
    lines.push('');
    lines.push(notice);
  }

  return lines.join('\n');
}

export function renderProfileSkillsKeyboard({ profileSnapshot = null } = {}) {
  const skillRows = [];
  for (let index = 0; index < DIRECTORY_SKILLS.length; index += 2) {
    const chunk = DIRECTORY_SKILLS.slice(index, index + 2).map((skill) => skillButton(profileSnapshot, skill));
    skillRows.push(chunk);
  }

  return buildInlineKeyboard([
    ...skillRows,
    [{ text: '🧹 Clear skills', callback_data: 'p:sk:clr' }],
    [{ text: '👁 Preview card', callback_data: 'p:prev' }],
    [
      { text: '↩️ Back to profile', callback_data: 'p:menu' },
      { text: '🏠 Home', callback_data: 'home:root' }
    ]
  ]);
}

export function renderProfileSavedNotice({ fieldLabel, profileSnapshot }) {
  return [
    `✅ ${fieldLabel} saved.`,
    '',
    completionLine(profileSnapshot),
    readinessLine(profileSnapshot)
  ].join('\n');
}

export function renderProfileSavedKeyboard() {
  return buildInlineKeyboard([
    [{ text: '👁 Preview card', callback_data: 'p:prev' }],
    [
      { text: '↩️ Back to profile', callback_data: 'p:menu' },
      { text: '🏠 Home', callback_data: 'home:root' }
    ]
  ]);
}

export function renderDirectoryListText({ profiles = [], page = 0, totalCount = 0, persistenceEnabled = false, filterSummary = summarizeDirectoryFilters(), viewerProfile = null, notice = null } = {}) {
  const lines = [
    '🌐 Public directory',
    '',
    'Browse listed, active profiles. Use filters to narrow by text, city, industry, or skills.',
    '',
    ...renderFilterSummaryLines(filterSummary)
  ];

  if (!persistenceEnabled) {
    lines.push('');
    lines.push('Directory browse is unavailable right now.');
  } else if (!profiles.length) {
    lines.push('');
    if (!filterSummary.isDefault) {
      lines.push('No listed profiles match the current filters.');
    } else if (viewerProfile?.linkedin_sub && !viewerProfile?.completion?.isReady) {
      lines.push('No listed profiles yet. Complete your profile to become one of the first visible members.');
    } else if (viewerProfile?.completion?.isReady && viewerProfile?.visibility_status !== 'listed') {
      lines.push('No listed profiles yet. Your profile is ready — list it to be one of the first visible members.');
    } else {
      lines.push('No listed profiles yet. Check back soon or complete your own profile to join the directory.');
    }
  } else {
    lines.push('');
    lines.push(`Page: ${page + 1}`);
    lines.push(`Listed profiles: ${totalCount}`);
    lines.push('');
    profiles.forEach((profile, index) => {
      const marker = profile.is_viewer ? '• you' : '• open';
      lines.push(`${index + 1}. ${directoryProfileLabel(profile)} ${marker}`);
    });
  }

  if (notice) {
    lines.push('');
    lines.push(notice);
  }

  return lines.join('\n');
}

export function renderDirectoryListKeyboard({ profiles = [], page = 0, hasPrev = false, hasNext = false, viewerProfile = null, filterSummary = summarizeDirectoryFilters() } = {}) {
  const rows = profiles.map((profile, index) => [{
    text: `${index + 1}. ${truncate(toDisplayValue(profile.display_name, profile.linkedin_name || 'Unnamed'), 28)}`,
    callback_data: `dir:open:${profile.profile_id}:${page}`
  }]);

  const pagerRow = [];
  if (hasPrev) {
    pagerRow.push({ text: '⬅️ Prev', callback_data: `dir:list:${page - 1}` });
  }
  if (hasNext) {
    pagerRow.push({ text: 'Next ➡️', callback_data: `dir:list:${page + 1}` });
  }
  if (pagerRow.length) {
    rows.push(pagerRow);
  }

  rows.push([{ text: '🎯 Filters', callback_data: 'dir:flt' }]);

  if (!profiles.length && viewerProfile?.linkedin_sub) {
    if (!viewerProfile?.completion?.isReady) {
      rows.push([{ text: '🧩 Complete my profile', callback_data: 'p:menu' }]);
    } else if (viewerProfile?.visibility_status !== 'listed' && filterSummary.isDefault) {
      rows.push([{ text: '🌍 List my profile', callback_data: 'p:vis' }]);
    } else {
      rows.push([{ text: '👁 Preview my card', callback_data: 'p:prev' }]);
    }
  }

  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

export function renderDirectoryCardText({ profileSnapshot = null, persistenceEnabled = false, notice = null } = {}) {
  const lines = [
    '👤 Directory profile',
    ''
  ];

  if (!persistenceEnabled) {
    lines.push('Persistence is disabled in this environment. Directory card is unavailable.');
  } else if (!profileSnapshot?.profile_id) {
    lines.push('Listed profile not found.');
  } else {
    lines.push(`${toDisplayValue(profileSnapshot.display_name, profileSnapshot.linkedin_name || 'Unnamed profile')}${profileSnapshot.is_viewer ? ' • you' : ''}`);
    lines.push(toDisplayValue(profileSnapshot.headline_user));
    lines.push('');
    lines.push(`Company: ${toDisplayValue(profileSnapshot.company_user)}`);
    lines.push(`City: ${toDisplayValue(profileSnapshot.city_user)}`);
    lines.push(`Industry: ${toDisplayValue(profileSnapshot.industry_user)}`);
    lines.push(`Skills: ${formatSkillSummary(profileSnapshot)}`);
    lines.push(directoryContactLabel(profileSnapshot));
    lines.push('');
    lines.push(`About: ${truncate(profileSnapshot.about_user, 320)}`);
    lines.push('');
    lines.push(`Visibility: ${toDisplayValue(profileSnapshot.visibility_status)}`);
    lines.push(`Contact mode: ${profileContactModeSummary(profileSnapshot)}`);
    lines.push(`State: ${toDisplayValue(profileSnapshot.profile_state)}`);
  }

  if (notice) {
    lines.push('');
    lines.push(notice);
  }

  return lines.join('\n');
}

export function renderDirectoryCardKeyboard({ profileSnapshot = null, page = 0 } = {}) {
  const rows = [];

  if (canViewerOpenDirectoryLinkedIn(profileSnapshot)) {
    rows.push([{ text: profileSnapshot?.is_viewer ? '🔗 Open my LinkedIn' : '🔗 Open LinkedIn', url: profileSnapshot.linkedin_public_url.trim() }]);
  }

  if (!profileSnapshot?.is_viewer && profileSnapshot?.contact_mode === 'intro_request' && profileSnapshot?.profile_id) {
    rows.push([{ text: '✉️ Request intro', callback_data: `dir:intro:${profileSnapshot.profile_id}:${page}` }]);
  }

  if (canViewerRequestDirectContact(profileSnapshot)) {
    rows.push([{ text: '⭐ Request direct contact', callback_data: `dir:unlock:${profileSnapshot.profile_id}:${page}` }]);
  }

  if (canViewerRequestDm(profileSnapshot)) {
    rows.push([{ text: '💬 DM request', callback_data: `dir:dm:${profileSnapshot.profile_id}:${page}` }]);
  }

  rows.push([{ text: '↩️ Back to directory', callback_data: `dir:list:${page}` }]);
  rows.push([{ text: '🎯 Filters', callback_data: 'dir:flt' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);

  return buildInlineKeyboard(rows);
}

export function renderIntroInboxText({ persistenceEnabled = false, inboxState = null, contactUnlockInbox = null, notice = null } = {}) {
  const lines = [
    '📥 Intro inbox',
    '',
    'Review incoming intros and track the ones you have sent.'
  ];

  if (!persistenceEnabled) {
    lines.push('');
    lines.push('Intro inbox is unavailable right now.');
  } else {
    const counts = inboxState?.counts || { receivedPending: 0, receivedTotal: 0, sentPending: 0, sentTotal: 0 };
    const receivedItems = Array.isArray(inboxState?.received) ? inboxState.received : [];
    const sentItems = Array.isArray(inboxState?.sent) ? inboxState.sent : [];
    const unlockReceivedItems = Array.isArray(contactUnlockInbox?.received) ? contactUnlockInbox.received : [];
    const unlockSentItems = Array.isArray(contactUnlockInbox?.sent) ? contactUnlockInbox.sent : [];
    const receivedPending = receivedItems.filter((item) => item?.status === 'pending');
    const receivedProcessed = receivedItems.filter((item) => item?.status !== 'pending');

    lines.push('');
    lines.push(`Received: ${counts.receivedPending}/${counts.receivedTotal} pending/total`);
    lines.push(`Sent: ${counts.sentPending}/${counts.sentTotal} pending/total`);

    if (receivedPending.length) {
      lines.push('');
      lines.push('Received pending actions:');
      receivedPending.forEach((item, index) => lines.push(renderIntroRequestLine(item, index)));
    }

    if (receivedProcessed.length) {
      lines.push('');
      lines.push('Received recent decisions:');
      receivedProcessed.forEach((item, index) => lines.push(renderIntroRequestLine(item, index)));
    }

    if (sentItems.length) {
      lines.push('');
      lines.push('Sent recent requests:');
      sentItems.forEach((item, index) => lines.push(renderIntroRequestLine(item, index)));
    }

    if (unlockReceivedItems.length) {
      lines.push('');
      lines.push('Direct contact requests to review:');
      unlockReceivedItems.forEach((item, index) => lines.push(renderContactUnlockLine(item, index)));
    }

    if (unlockSentItems.length) {
      lines.push('');
      lines.push('Sent direct contact requests:');
      unlockSentItems.forEach((item, index) => lines.push(renderContactUnlockLine(item, index)));
    }

    if (!(receivedItems.length || sentItems.length || unlockReceivedItems.length || unlockSentItems.length)) {
      lines.push('');
      lines.push('No intro requests yet. Browse the directory and send the first one from a public profile card.');
    }
  }

  if (notice) {
    lines.push('');
    lines.push(notice);
  }

  return lines.join('\n');
}

export function renderIntroInboxKeyboard({ inboxState = null, contactUnlockInbox = null } = {}) {
  const rows = [];
  const receivedItems = Array.isArray(inboxState?.received) ? inboxState.received : [];
  const sentItems = Array.isArray(inboxState?.sent) ? inboxState.sent : [];
  const unlockReceivedItems = Array.isArray(contactUnlockInbox?.received) ? contactUnlockInbox.received : [];
  const unlockSentItems = Array.isArray(contactUnlockInbox?.sent) ? contactUnlockInbox.sent : [];

  for (const [index, item] of receivedItems.entries()) {
    const label = truncate(toDisplayValue(item?.display_name, `Received ${index + 1}`), 20);
    rows.push([
      { text: `📥 ${index + 1}. ${label}`, callback_data: `intro:view:${item?.intro_request_id || 0}` },
      { text: '👤 Open profile', callback_data: item?.profile_id ? `intro:open:${item.profile_id}` : 'intro:noop' }
    ]);

    if (canOpenReceivedSenderLinkedIn(item)) {
      rows.push([{ text: '🔗 Sender LinkedIn', url: item.linkedin_public_url.trim() }]);
    }

    if (item?.status === 'pending') {
      rows.push([
        { text: '✅ Accept', callback_data: `intro:acc:${item?.intro_request_id || 0}` },
        { text: '❌ Decline', callback_data: `intro:dec:${item?.intro_request_id || 0}` }
      ]);
    }
  }

  for (const [index, item] of sentItems.entries()) {
    const label = truncate(toDisplayValue(item?.display_name, `Sent ${index + 1}`), 20);
    rows.push([
      { text: `📤 ${index + 1}. ${label}`, callback_data: `intro:view:${item?.intro_request_id || 0}` },
      { text: '👤 Open profile', callback_data: item?.profile_id ? `intro:open:${item.profile_id}` : 'intro:noop' }
    ]);

    if (canOpenAcceptedTargetLinkedIn(item)) {
      rows.push([{ text: '🔓 Open contact', url: item.linkedin_public_url.trim() }]);
    }
  }


  for (const [index, item] of unlockReceivedItems.entries()) {
    const label = truncate(toDisplayValue(item?.display_name, `Direct ${index + 1}`), 20);
    rows.push([{ text: `🔐 ${index + 1}. ${label}`, callback_data: `cu:view:${item?.contact_unlock_request_id || 0}` }]);
    if (item?.status === 'paid_pending_approval') {
      rows.push([
        { text: '✅ Approve', callback_data: `cu:acc:${item?.contact_unlock_request_id || 0}` },
        { text: '❌ Decline', callback_data: `cu:dec:${item?.contact_unlock_request_id || 0}` }
      ]);
    }
  }

  for (const [index, item] of unlockSentItems.entries()) {
    const label = truncate(toDisplayValue(item?.display_name, `Direct ${index + 1}`), 20);
    rows.push([{ text: `⭐ ${index + 1}. ${label}`, callback_data: `cu:view:${item?.contact_unlock_request_id || 0}` }]);
    if (item?.status === 'revealed' && item?.revealed_contact_value) {
      const clean = String(item.revealed_contact_value).replace(/^@+/, '');
      rows.push([{ text: '🔓 Open contact', url: `https://t.me/${clean}` }]);
    }
  }

  rows.push([{ text: '🔄 Refresh', callback_data: 'intro:inbox' }]);
  rows.push([{ text: '💬 DM inbox', callback_data: 'dm:inbox' }]);
  rows.push([{ text: '🌐 Browse directory', callback_data: 'dir:list:0' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);

  return buildInlineKeyboard(rows);
}

export function renderIntroDetailText({ persistenceEnabled = false, introRequest = null, notice = null } = {}) {
  const lines = [
    '🧾 Intro request',
    '',
    'Review the current state of this intro and any unlocked contact details.'
  ];

  if (!persistenceEnabled) {
    lines.push('');
    lines.push('Persistence is disabled in this environment. Intro detail is unavailable.');
  } else if (!introRequest?.intro_request_id) {
    lines.push('');
    lines.push('Intro request not found.');
  } else {
    lines.push('');
    lines.push(`Perspective: ${introRoleLabel(introRequest)}`);
    lines.push(`Member: ${toDisplayValue(introRequest.display_name, 'Unknown member')}`);
    lines.push(`Headline: ${truncate(introRequest.headline_user, 120)}`);
    lines.push(`Status: ${toDisplayValue(introRequest.status)}`);
    lines.push(`Created: ${formatDateShort(introRequest.created_at)}`);
    lines.push(`Updated: ${formatDateShort(introRequest.updated_at)}`);
    lines.push(`Profile card: ${introRequest.profile_id ? 'available' : introRequest.archived_snapshot_only ? 'removed • archived snapshot preserved' : 'not available'}`);

    if (introRequest.archived_snapshot_only) {
      lines.push('History safety: live profile is gone, archived intro snapshot is preserved.');
    }

    if (canOpenReceivedSenderLinkedIn(introRequest)) {
      lines.push(`Sender LinkedIn: ${introRequest.status === 'pending' ? 'available for review' : 'available'}`);
    } else if (introRequest.role === 'received') {
      lines.push('Sender LinkedIn: not shared');
    }

    if (canOpenAcceptedTargetLinkedIn(introRequest)) {
      lines.push('Unlocked contact: LinkedIn URL available');
    } else if (introRequest.role === 'sent' && introRequest.status === 'accepted') {
      lines.push('Unlocked contact: recipient did not share a LinkedIn URL');
    } else if (introRequest.role === 'sent') {
      lines.push('Unlocked contact: not available yet');
    }

    lines.push('');
    lines.push(introStatusNote(introRequest));
  }

  if (notice) {
    lines.push('');
    lines.push(notice);
  }

  return lines.join('\n');
}

export function renderIntroDetailKeyboard({ introRequest = null } = {}) {
  const rows = [];

  if (introRequest?.profile_id) {
    rows.push([{ text: '👤 Open profile', callback_data: `intro:open:${introRequest.profile_id}` }]);
  }

  if (canOpenReceivedSenderLinkedIn(introRequest)) {
    rows.push([{ text: '🔗 Sender LinkedIn', url: introRequest.linkedin_public_url.trim() }]);
  }

  if (canOpenAcceptedTargetLinkedIn(introRequest)) {
    rows.push([{ text: '🔓 Open contact', url: introRequest.linkedin_public_url.trim() }]);
  }

  if (introRequest?.role === 'received' && introRequest?.status === 'pending') {
    rows.push([
      { text: '✅ Accept', callback_data: `intro:acc:${introRequest.intro_request_id}` },
      { text: '❌ Decline', callback_data: `intro:dec:${introRequest.intro_request_id}` }
    ]);
  }

  rows.push([{ text: '↩️ Back to inbox', callback_data: 'intro:inbox' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);

  return buildInlineKeyboard(rows);
}

export function renderContactUnlockDetailText({ persistenceEnabled = false, request = null, notice = null } = {}) {
  const lines = [
    '🔐 Direct contact request',
    '',
    'Review the current state of this direct Telegram contact request.'
  ];

  if (!persistenceEnabled) {
    lines.push('', 'Persistence is disabled in this environment. Direct contact detail is unavailable.');
  } else if (!request?.contact_unlock_request_id) {
    lines.push('', 'Direct contact request not found.');
  } else {
    lines.push('');
    lines.push(`Perspective: ${request.role === 'received' ? 'Received direct contact request' : 'Sent direct contact request'}`);
    lines.push(`Member: ${toDisplayValue(request.display_name, 'Unknown member')}`);
    lines.push(`Headline: ${truncate(request.headline_user, 120)}`);
    lines.push(`Status: ${toDisplayValue(request.status)}`);
    lines.push(`Payment: ${toDisplayValue(request.payment_state)}`);
    lines.push(`Price: ${Number.isFinite(Number(request.price_stars_snapshot)) ? `${request.price_stars_snapshot}⭐` : '—'}`);
    lines.push(`Requested: ${formatDateShort(request.requested_at)}`);
    if (request.role === 'sent') {
      if (request.status === 'revealed' && request.revealed_contact_value) {
        lines.push(`Unlocked Telegram username: @${String(request.revealed_contact_value).replace(/^@+/, '')}`);
      } else if (request.status === 'paid_pending_approval') {
        lines.push('Direct contact is still waiting for recipient approval.');
      } else if (request.status === 'declined') {
        lines.push('No Telegram username was revealed.');
      }
    } else {
      lines.push(request.status === 'paid_pending_approval'
        ? 'You can approve or decline this direct contact request.'
        : request.status === 'revealed'
          ? 'You approved this request and your hidden Telegram username was revealed to the requester.'
          : 'This direct contact request is no longer actionable.');
    }
  }

  if (notice) {
    lines.push('', notice);
  }

  return lines.join('\n');
}

export function renderContactUnlockDetailKeyboard({ request = null } = {}) {
  const rows = [];

  if (request?.profile_id) {
    rows.push([{ text: '👤 Open profile', callback_data: `intro:open:${request.profile_id}` }]);
  }

  if (request?.role === 'received' && request?.status === 'paid_pending_approval') {
    rows.push([
      { text: '✅ Approve', callback_data: `cu:acc:${request.contact_unlock_request_id}` },
      { text: '❌ Decline', callback_data: `cu:dec:${request.contact_unlock_request_id}` }
    ]);
  }

  if (request?.role === 'sent' && request?.status === 'revealed' && request?.revealed_contact_value) {
    const clean = String(request.revealed_contact_value).replace(/^@+/, '');
    rows.push([{ text: '🔓 Open contact', url: `https://t.me/${clean}` }]);
  }

  rows.push([{ text: '↩️ Back to inbox', callback_data: 'intro:inbox' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}


export function renderDmInboxText({ persistenceEnabled = false, inboxState = null, notice = null } = {}) {
  const lines = [
    '💬 DM inbox',
    '',
    'Review incoming DM requests and continue active member conversations.'
  ];

  if (!persistenceEnabled) {
    lines.push('', 'DM inbox is unavailable right now.');
  } else {
    const counts = inboxState?.counts || { received_pending: 0, received_total: 0, sent_pending: 0, sent_total: 0, active_total: 0 };
    const receivedItems = Array.isArray(inboxState?.received) ? inboxState.received : [];
    const sentItems = Array.isArray(inboxState?.sent) ? inboxState.sent : [];
    lines.push('');
    lines.push(`Received DM requests: ${counts.received_pending}/${counts.received_total} pending/total`);
    lines.push(`Sent DM requests: ${counts.sent_pending}/${counts.sent_total} pending/total`);
    lines.push(`Active conversations: ${counts.active_total || 0}`);

    if (receivedItems.length) {
      lines.push('', 'Incoming DM requests / threads:');
      receivedItems.forEach((item, index) => lines.push(renderDmThreadLine(item, index)));
    }

    if (sentItems.length) {
      lines.push('', 'Sent DM requests / threads:');
      sentItems.forEach((item, index) => lines.push(renderDmThreadLine(item, index)));
    }

    if (!(receivedItems.length || sentItems.length)) {
      lines.push('', 'No DM requests yet. Open a listed profile card to start one.');
    }
  }

  if (notice) {
    lines.push('', notice);
  }

  return lines.join('\n');
}

export function renderDmInboxKeyboard({ inboxState = null } = {}) {
  const rows = [];
  const receivedItems = Array.isArray(inboxState?.received) ? inboxState.received : [];
  const sentItems = Array.isArray(inboxState?.sent) ? inboxState.sent : [];

  for (const [index, item] of receivedItems.entries()) {
    const label = truncate(toDisplayValue(item?.display_name, `Incoming ${index + 1}`), 20);
    rows.push([{ text: `📨 ${index + 1}. ${label}`, callback_data: `dm:view:${item?.dm_thread_id || 0}` }]);
    if (item?.status === 'pending_recipient') {
      rows.push([
        { text: '✅ Accept', callback_data: `dm:acc:${item?.dm_thread_id || 0}` },
        { text: '❌ Decline', callback_data: `dm:dec:${item?.dm_thread_id || 0}` }
      ]);
    }
  }

  for (const [index, item] of sentItems.entries()) {
    const label = truncate(toDisplayValue(item?.display_name, `Sent ${index + 1}`), 20);
    rows.push([{ text: `💬 ${index + 1}. ${label}`, callback_data: `dm:view:${item?.dm_thread_id || 0}` }]);
  }

  rows.push([{ text: '🔄 Refresh', callback_data: 'dm:inbox' }]);
  rows.push([{ text: '🌐 Browse directory', callback_data: 'dir:list:0' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

export function renderDmThreadText({ persistenceEnabled = false, thread = null, viewerTelegramUserId = null, notice = null } = {}) {
  const lines = [
    '🧾 DM thread',
    '',
    'Review the current DM request state and continue the conversation when active.'
  ];

  if (!persistenceEnabled) {
    lines.push('', 'DM thread detail is unavailable right now.');
  } else if (!thread?.dm_thread_id) {
    lines.push('', 'DM thread not found.');
  } else {
    lines.push('');
    lines.push(`Perspective: ${thread.role === 'received' ? 'Received DM request' : 'Sent DM request'}`);
    lines.push(`Member: ${toDisplayValue(thread.display_name, 'Unknown member')}`);
    lines.push(`Headline: ${truncate(thread.headline_user, 120)}`);
    lines.push(`Status: ${toDisplayValue(thread.status)}`);
    lines.push(`Payment: ${toDisplayValue(thread.payment_state)}`);
    lines.push(`Price: ${Number.isFinite(Number(thread.price_stars_snapshot)) ? `${thread.price_stars_snapshot}⭐` : '—'}`);
    lines.push(`Created: ${formatDateShort(thread.created_at)}`);
    if (thread.first_message_text) {
      lines.push('', `First message: ${truncate(thread.first_message_text, 280)}`);
    }
    const messages = Array.isArray(thread.messages) ? thread.messages : [];
    if (messages.length) {
      lines.push('', 'Conversation:');
      messages.slice(-8).forEach((message) => lines.push(renderDmMessageLine(message, viewerTelegramUserId)));
    }
  }

  if (notice) {
    lines.push('', notice);
  }

  return lines.join('\n');
}

export function renderDmThreadKeyboard({ thread = null } = {}) {
  const rows = [];

  if (thread?.role === 'received' && thread?.status === 'pending_recipient') {
    rows.push([
      { text: '✅ Accept', callback_data: `dm:acc:${thread.dm_thread_id}` },
      { text: '❌ Decline', callback_data: `dm:dec:${thread.dm_thread_id}` }
    ]);
    rows.push([
      { text: '⛔ Block', callback_data: `dm:blk:${thread.dm_thread_id}` },
      { text: '🚩 Report', callback_data: `dm:rpt:${thread.dm_thread_id}` }
    ]);
  }

  if (thread?.role === 'sent' && thread?.status === 'payment_pending') {
    rows.push([{ text: '⭐ Pay and deliver request', callback_data: `dm:pay:${thread.dm_thread_id}` }]);
  }

  if (thread?.status === 'active') {
    rows.push([{ text: '✉️ Send message', callback_data: `dm:send:${thread.dm_thread_id}` }]);
  }

  rows.push([{ text: '↩️ Back to DM inbox', callback_data: 'dm:inbox' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

export function renderDirectoryFiltersText({ persistenceEnabled = false, filterSummary = summarizeDirectoryFilters(), notice = null } = {}) {
  const lines = [
    '🎯 Directory filters',
    '',
    'Use text, city, one industry bucket, and any number of skills to narrow the public directory. Skill filters match any selected skill.',
    '',
    ...renderFilterSummaryLines(filterSummary)
  ];

  if (!persistenceEnabled) {
    lines.push('');
    lines.push('Persistence is disabled in this environment. Directory filters are unavailable.');
  }

  if (notice) {
    lines.push('');
    lines.push(notice);
  }

  return lines.join('\n');
}

export function renderDirectoryFiltersKeyboard({ filterSummary = summarizeDirectoryFilters() } = {}) {
  const rows = [];

  rows.push([
    { text: `🔎 Search: ${truncate(filterSummary.textQueryLabel, 18)}`, callback_data: 'dir:ft:q' },
    { text: `📍 City: ${truncate(filterSummary.cityQueryLabel, 18)}`, callback_data: 'dir:ft:c' }
  ]);

  if (filterSummary.textQuery || filterSummary.cityQuery) {
    const clearRow = [];
    if (filterSummary.textQuery) {
      clearRow.push({ text: '✖️ Clear search', callback_data: 'dir:fx:q' });
    }
    if (filterSummary.cityQuery) {
      clearRow.push({ text: '✖️ Clear city', callback_data: 'dir:fx:c' });
    }
    rows.push(clearRow);
  }

  for (const bucket of DIRECTORY_INDUSTRY_BUCKETS) {
    rows.push([filterIndustryButton(filterSummary, bucket)]);
  }

  for (let index = 0; index < DIRECTORY_SKILLS.length; index += 2) {
    const chunk = DIRECTORY_SKILLS.slice(index, index + 2).map((skill) => filterSkillButton(filterSummary, skill));
    rows.push(chunk);
  }

  if (!filterSummary.isDefault) {
    rows.push([{ text: '🧹 Clear filters', callback_data: 'dir:fc' }]);
  }
  rows.push([{ text: '↩️ Back to directory', callback_data: 'dir:list:0' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);

  return buildInlineKeyboard(rows);
}



export function renderInviteText({ inviteState = null, notice = null } = {}) {
  const lines = [
    '📨 Invite contacts',
    '',
    'Share your personal Intro Deck invite straight into any chat.',
    'Keep sharing, performance, and invite history together here without overloading Home.'
  ];

  if (!inviteState?.persistenceEnabled) {
    lines.push('', 'Invite tracking is unavailable right now.');
  } else {
    const invitedCount = Number(inviteState.invitedCount || 0) || 0;
    const activatedCount = Number(inviteState.activatedCount || 0) || 0;
    lines.push('', '<b>Snapshot</b>');
    lines.push(`• Invited: ${invitedCount}`);
    lines.push(`• Activated: ${activatedCount}`);
    lines.push(`• Activation rate: ${getInviteActivationRate(invitedCount, activatedCount)}`);
    lines.push(`• Invite code: <code>${escapeHtml(inviteState.inviteCode || '—')}</code>`);
    if (inviteState.invitedBy?.displayName) {
      lines.push(`• Joined from: ${escapeHtml(inviteState.invitedBy.displayName)}`);
    }

    lines.push('', '<b>Next step</b>');
    lines.push('• Open Performance for source split and recent 7-day quality.');
    lines.push('• Open Invite history for the full paged list, even before your first invite arrives.');
  }

  if (notice) {
    lines.push('', escapeHtml(notice));
  }

  return lines.join('\n');
}

export function renderInviteKeyboard({ inviteState = null } = {}) {
  const rows = [];
  if (inviteState?.persistenceEnabled && inviteState?.inviteLink) {
    rows.push([{ text: '📨 Share invite', switch_inline_query: inviteState.shareInlineQuery || 'invite' }]);
    rows.push([
      { text: '🔗 Link + copy', callback_data: 'invite:show_link' },
      { text: '🧾 Invite card', callback_data: 'invite:send_card' }
    ]);
    rows.push([
      { text: '📊 Performance', callback_data: 'invite:perf' },
      { text: '📋 Invite history', callback_data: 'invite:hist:1' }
    ]);
    rows.push([{ text: '🔄 Refresh', callback_data: 'invite:root' }]);
  }
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

export function renderInvitePerformanceText({ inviteState = null, notice = null } = {}) {
  const invitedCount = Number(inviteState?.invitedCount || 0) || 0;
  const activatedCount = Number(inviteState?.activatedCount || 0) || 0;
  const lines = [
    '📊 Invite performance',
    '',
    'See invite quality, source mix, and recent momentum without overloading the main invite hub.',
    '',
    '<b>All-time</b>',
    `• Invited: ${invitedCount}`,
    `• Activated: ${activatedCount}`,
    `• Activation rate: ${getInviteActivationRate(invitedCount, activatedCount)}`,
    '',
    '<b>By source</b>',
    `• Inline share: ${Number(inviteState?.inlineShareCount || 0) || 0}`,
    `• Link + copy: ${Number(inviteState?.rawLinkCount || 0) || 0}`,
    `• Invite card: ${Number(inviteState?.inviteCardCount || 0) || 0}`,
    '',
    '<b>Last 7 days</b>',
    `• Invited: ${Number(inviteState?.joined7d || 0) || 0}`,
    `• Activated: ${Number(inviteState?.activated7d || 0) || 0}`
  ];

  if (inviteState?.activationHint) {
    lines.push('', '<b>Activation rule</b>');
    lines.push(`• Current signal: ${escapeHtml(inviteState.activationHint)}.`);
  }

  if (!(invitedCount > 0)) {
    lines.push('', '<b>Nothing to measure yet</b>');
    lines.push('• No invited contacts yet. Use Share invite, Link + copy, or Invite card to start your first invite flow.');
  }

  if (notice) {
    lines.push('', escapeHtml(notice));
  }

  return lines.join('\n');
}

export function renderInvitePerformanceKeyboard({ inviteState = null } = {}) {
  const rows = [
    [{ text: '📋 Invite history', callback_data: 'invite:hist:1' }],
    [{ text: '📨 Invite contacts', callback_data: 'invite:root' }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ];
  return buildInlineKeyboard(rows);
}

export function renderInviteHistoryText({ inviteState = null, historyState = null, notice = null } = {}) {
  const totalCount = Number(historyState?.totalCount || 0) || 0;
  const currentPage = Number(historyState?.page || 1) || 1;
  const totalPages = Number(historyState?.totalPages || 1) || 1;
  const startIndex = Number(historyState?.startIndex || 0) || 0;
  const endIndex = Number(historyState?.endIndex || 0) || 0;
  const lines = [
    '📋 Invite history',
    '',
    'Open the full paged list of invited contacts here. This screen stays available even before your first invite arrives.',
    '',
    '<b>Summary</b>',
    `• Invited: ${Number(inviteState?.invitedCount || 0) || 0}`,
    `• Activated: ${Number(inviteState?.activatedCount || 0) || 0}`,
    `• Activation rate: ${getInviteActivationRate(inviteState?.invitedCount, inviteState?.activatedCount)}`,
    '',
    '<b>History window</b>'
  ];

  if (totalCount > 0) {
    lines.push(`• Showing: ${startIndex + 1}–${endIndex} of ${totalCount}`);
    lines.push(`• Page: ${currentPage}/${totalPages}`);
    lines.push('', '<b>Contacts</b>');
    historyState.items.forEach((item, index) => lines.push(escapeHtml(renderInviteHistoryLine(item, index, startIndex))));
  } else {
    lines.push('• No invited contacts yet.');
    lines.push('• Use Share invite, Link + copy, or Invite card to bring your first invited contacts here.');
  }

  if (notice) {
    lines.push('', escapeHtml(notice));
  }

  return lines.join('\n');
}

export function renderInviteHistoryKeyboard({ inviteState = null, historyState = null } = {}) {
  const rows = [];
  const navRow = [];
  if (historyState?.hasPrev) {
    navRow.push({ text: '⬅️ Prev', callback_data: `invite:hist:${Math.max(1, Number(historyState?.page || 1) - 1)}` });
  }
  if (historyState?.hasNext) {
    navRow.push({ text: 'Next ➡️', callback_data: `invite:hist:${Math.max(1, Number(historyState?.page || 1) + 1)}` });
  }
  if (navRow.length) {
    rows.push(navRow);
  }
  rows.push([
    { text: '📨 Invite contacts', callback_data: 'invite:root' },
    { text: '📊 Performance', callback_data: 'invite:perf' }
  ]);
  if (!(Number(inviteState?.invitedCount || 0) > 0)) {
    rows.push([
      { text: '📨 Share invite', switch_inline_query: inviteState?.shareInlineQuery || 'invite' },
      { text: '🔗 Link + copy', callback_data: 'invite:show_link' }
    ]);
  }
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}

export function renderInviteLinkText({ inviteState = null } = {}) {
  return [
    '🔗 <b>Your invite link</b>',
    '',
    'Copy this link and drop it into any chat if you prefer a raw link over inline share.',
    '',
    `<code>${escapeHtml(inviteState?.inviteLink || '—')}</code>`
  ].join('\n');
}

export function renderInviteLinkKeyboard() {
  return buildInlineKeyboard([
    [{ text: '📨 Invite contacts', callback_data: 'invite:root' }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
}

export function renderInviteCardText({ inviteState = null } = {}) {
  return [
    '🤝 <b>Join me on Intro Deck</b>',
    '',
    'Discover people, request intros, or unlock direct contact in Telegram.',
    '',
    buildJoinIntroDeckAnchor(inviteState?.inviteCardLink || inviteState?.inlineInviteLink || inviteState?.inviteLink)
  ].join('\n');
}

export function renderInviteCardKeyboard({ inviteState = null } = {}) {
  const inviteUrl = inviteState?.inviteCardLink || inviteState?.inlineInviteLink || inviteState?.inviteLink;
  const rows = inviteUrl ? [[{ text: 'Open Intro Deck', url: inviteUrl }]] : [];
  return buildInlineKeyboard(rows);
}

export function renderInlineInviteShareText({ inviteState = null } = {}) {
  return [
    'I found a clean Telegram directory for discovering people, requesting intros, and unlocking direct contact.',
    '',
    buildJoinIntroDeckAnchor(inviteState?.inlineInviteLink || inviteState?.inviteLink)
  ].join('\n');
}

export function renderInlineInviteCaption({ inviteState = null } = {}) {
  return [
    'Trusted intros and direct contact in Telegram.',
    'Private directory. LinkedIn identity. Consent-based access.',
    '',
    buildJoinIntroDeckAnchor(inviteState?.inlineInviteLink || inviteState?.inviteLink)
  ].join('\n');
}

export function buildInlineInviteResult({ inviteState = null } = {}) {
  const replyMarkup = renderInviteCardKeyboard({ inviteState });

  if (inviteState?.invitePhotoFileId) {
    return {
      type: 'photo',
      id: 'invite-photo-cached',
      photo_file_id: inviteState.invitePhotoFileId,
      title: 'Share Intro Deck invite',
      description: 'Share a photo invite card for Intro Deck',
      caption: renderInlineInviteCaption({ inviteState }),
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    };
  }

  if (inviteState?.invitePhotoUrl) {
    return {
      type: 'photo',
      id: 'invite-photo-url',
      photo_url: inviteState.invitePhotoUrl,
      thumbnail_url: inviteState.invitePhotoUrl,
      photo_width: 1200,
      photo_height: 630,
      title: 'Share Intro Deck invite',
      description: 'Share a photo invite card for Intro Deck',
      caption: renderInlineInviteCaption({ inviteState }),
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    };
  }

  return {
    type: 'article',
    id: 'invite-article-fallback',
    title: 'Share Intro Deck invite',
    description: 'Share your personal Intro Deck invite into any chat',
    input_message_content: {
      message_text: renderInlineInviteShareText({ inviteState }),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    },
    reply_markup: replyMarkup
  };
}


export function renderAdminInviteSnapshotText({ state = null, notice = null } = {}) {
  const summary = state?.snapshot?.summary || {};
  const topInviters = Array.isArray(state?.snapshot?.topInviters) ? state.snapshot.topInviters : [];
  const recentInvites = Array.isArray(state?.snapshot?.recentInvites) ? state.snapshot.recentInvites : [];
  const totalInvites = Number(summary.totalInvites || 0) || 0;
  const activatedInvites = Number(summary.activatedInvites || 0) || 0;
  const lines = [
    '📨 Инвайты',
    '',
    'Сводка invite-слоя и качества активации до включения rewards и redeem.',
    '',
    '<b>Сводка</b>',
    `• Всего инвайтов: ${totalInvites}`,
    `• Активировано: ${activatedInvites}`,
    `• Конверсия: ${Number(summary.activationRate || 0) || 0}%`,
    `• За 7д: ${Number(summary.joined7d || 0) || 0} приглашено • ${Number(summary.activated7d || 0) || 0} активировано`,
    '',
    '<b>По источникам</b>',
    `• Inline share: ${Number(summary.inlineShareCount || 0) || 0}`,
    `• Link + copy: ${Number(summary.rawLinkCount || 0) || 0}`,
    `• Invite card: ${Number(summary.inviteCardCount || 0) || 0}`
  ];

  if (state?.activationHint) {
    lines.push('', '<b>Правило активации</b>');
    lines.push(`• Текущий сигнал: ${escapeHtml(state.activationHint)}.`);
  }

  lines.push('', '<b>Топ инвайтеры</b>');
  if (topInviters.length) {
    topInviters.forEach((item, index) => lines.push(escapeHtml(renderAdminInviteTopLine(item, index))));
  } else {
    lines.push('• Пока нет инвайтов для рейтинга.');
  }

  lines.push('', '<b>Последние инвайты</b>');
  if (recentInvites.length) {
    recentInvites.forEach((item, index) => lines.push(escapeHtml(renderAdminInviteRecentLine(item, index))));
  } else {
    lines.push('• Пока нет недавней invite-активности.');
  }

  if (notice) {
    lines.push('', escapeHtml(notice));
  }

  return lines.join('\n');
}

export function renderAdminInviteSnapshotKeyboard() {
  return buildInlineKeyboard([
    [{ text: '🔄 Обновить', callback_data: 'adm:invite' }],
    [{ text: '↩️ Назад в Операции', callback_data: 'adm:ops' }],
    [{ text: '🏠 Главная', callback_data: 'home:root' }]
  ]);
}

export function renderOperatorDiagnosticsText({
  persistenceEnabled = false,
  diagnostics = null,
  bucket = null,
  introRequestId = null,
  hotRetryDue = [],
  hotFailed = [],
  hotExhausted = [],
  notice = null,
  allowed = true
} = {}) {
  const lines = [
    '🛠 Operator diagnostics',
    '',
    'Read-only notification receipt view.'
  ];

  if (!allowed) {
    lines.push('This area is only available to the operator account.');
  } else if (!persistenceEnabled) {
    lines.push('Persistence: disabled in current environment');
  } else if (introRequestId) {
    const summary = diagnostics?.introSummary;
    lines.push(`Intro scope: #${introRequestId}`);
    if (!summary) {
      lines.push('No receipt rows found for this intro request yet.');
    } else {
      lines.push(`Counts: total ${summary.totalCount || 0} • sent ${summary.sentCount || 0} • retry due ${summary.retryDueCount || 0} • failed ${summary.failedCount || 0} • exhausted ${summary.exhaustedCount || 0} • skipped ${summary.skippedCount || 0}`);
      lines.push(`Last event: ${formatDateTimeShort(summary.lastEventAt)}`);
    }

    lines.push('');
    lines.push('Recent rows:');
    const rows = diagnostics?.recent || [];
    if (!rows.length) {
      lines.push('— none');
    } else {
      lines.push(...rows.slice(0, 6).map((item, index) => renderNotificationReceiptLine(item, index)));
    }
  } else {
    const counts = diagnostics?.counts || { total: 0, sent: 0, retry_due: 0, failed: 0, exhausted: 0, skipped: 0 };
    lines.push(`View: ${notificationBucketLabel(bucket)}`);
    lines.push(`Counts: total ${counts.total || 0} • sent ${counts.sent || 0} • retry due ${counts.retry_due || 0} • failed ${counts.failed || 0} • exhausted ${counts.exhausted || 0} • skipped ${counts.skipped || 0}`);
    lines.push('');

    if (bucket) {
      lines.push('Recent rows:');
      const rows = diagnostics?.recent || [];
      if (!rows.length) {
        lines.push('— none');
      } else {
        lines.push(...rows.slice(0, 8).map((item, index) => renderNotificationReceiptLine(item, index)));
      }
    } else {
      lines.push('Retry due now:');
      lines.push(...(hotRetryDue.length ? hotRetryDue.map((item, index) => renderNotificationReceiptLine(item, index)) : ['— none']));
      lines.push('');
      lines.push('Recent failures:');
      lines.push(...(hotFailed.length ? hotFailed.map((item, index) => renderNotificationReceiptLine(item, index)) : ['— none']));
      lines.push('');
      lines.push('Recent exhausted:');
      lines.push(...(hotExhausted.length ? hotExhausted.map((item, index) => renderNotificationReceiptLine(item, index)) : ['— none']));
    }
  }

  if (notice) {
    lines.push('');
    lines.push(notice);
  }

  return lines.join('\n');
}

export function renderOperatorDiagnosticsKeyboard({
  allowed = true,
  bucket = null,
  introRequestId = null,
  diagnostics = null,
  hotRetryDue = [],
  hotFailed = [],
  hotExhausted = []
} = {}) {
  if (!allowed) {
    return buildInlineKeyboard([[{ text: '🏠 Home', callback_data: 'home:root' }]]);
  }

  const rows = [];

  if (introRequestId) {
    rows.push([{ text: '🔄 Refresh intro', callback_data: `ops:i:${introRequestId}` }]);
    rows.push([{ text: '🧭 All diagnostics', callback_data: 'ops:diag' }]);
  } else {
    const refreshTarget = bucket === 'retry_due'
      ? 'ops:b:due'
      : bucket === 'failed'
        ? 'ops:b:fal'
        : bucket === 'exhausted'
          ? 'ops:b:exh'
          : 'ops:diag';
    rows.push([{ text: '🔄 Refresh', callback_data: refreshTarget }]);
    rows.push([
      { text: `${bucket === 'retry_due' ? '✅' : '⏳'} Retry due`, callback_data: 'ops:b:due' },
      { text: `${bucket === 'failed' ? '✅' : '⚠️'} Failed`, callback_data: 'ops:b:fal' }
    ]);
    rows.push([
      { text: `${bucket === 'exhausted' ? '✅' : '🧱'} Exhausted`, callback_data: 'ops:b:exh' },
      { text: `${bucket ? '🧭' : '✅'} All`, callback_data: 'ops:diag' }
    ]);
  }

  const introButtons = collectOperatorIntroButtons({ diagnostics, hotRetryDue, hotFailed, hotExhausted });
  if (introButtons.length) {
    rows.push(introButtons.map((value) => ({ text: `#${value}`, callback_data: `ops:i:${value}` })));
  }

  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);
  return buildInlineKeyboard(rows);
}
