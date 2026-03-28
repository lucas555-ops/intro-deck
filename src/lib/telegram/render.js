import {
  DIRECTORY_INDUSTRY_BUCKETS,
  DIRECTORY_SKILLS,
  PROFILE_FIELDS,
  summarizeDirectoryFilters
} from '../profile/contract.js';

function buildInlineKeyboard(rows) {
  return {
    inline_keyboard: rows
  };
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
  if (profileSnapshot?.is_viewer) {
    return `Public LinkedIn URL: ${toDisplayValue(profileSnapshot?.linkedin_public_url)}`;
  }

  if (profileSnapshot?.contact_mode === 'intro_request') {
    if (hasLinkedInUrl(profileSnapshot?.linkedin_public_url)) {
      return 'Public LinkedIn URL: shared after accepted intro';
    }

    return 'Public LinkedIn URL: not provided';
  }

  return `Public LinkedIn URL: ${toDisplayValue(profileSnapshot?.linkedin_public_url)}`;
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

  if (!profileSnapshot?.linkedin_sub) {
    rows.push([{ text: '🔐 Connect LinkedIn', url: buildLinkedInStartUrl({ appBaseUrl, telegramUserId }) }]);
  } else if (persistenceEnabled) {
    const profileLabel = profileSnapshot?.completion?.isReady ? '🧩 Edit profile' : '🧩 Complete profile';
    rows.push([{ text: profileLabel, callback_data: 'p:menu' }]);
  }

  if (persistenceEnabled) {
    rows.push([{ text: '🌐 Browse directory', callback_data: 'dir:list:0' }]);
  }

  if (persistenceEnabled && profileSnapshot?.linkedin_sub) {
    rows.push([{ text: '📥 Intro inbox', callback_data: 'intro:inbox' }]);
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
    'Use Intro Deck to connect your LinkedIn identity, complete a concise profile inside Telegram, browse trusted professionals, and send warm intros.',
    '',
    'Start here:',
    '• connect LinkedIn',
    '• complete your profile',
    '• browse the directory',
    '• check your intro inbox'
  ].join('\n');
}

export function renderHelpKeyboard() {
  return buildInlineKeyboard([
    [{ text: '🧩 Profile', callback_data: 'p:menu' }],
    [{ text: '🌐 Browse directory', callback_data: 'dir:list:0' }],
    [{ text: '📥 Intro inbox', callback_data: 'intro:inbox' }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
  ]);
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
    lines.push(`Connected as: ${profileSnapshot.linkedin_name || profileSnapshot.display_name || 'LinkedIn user'}`);
    lines.push(`Card name: ${toDisplayValue(profileSnapshot.display_name)}`);
    lines.push(`Profile status: ${profileSnapshot.profile_state || 'draft'}`);
    lines.push(`Visibility: ${profileSnapshot.visibility_status || 'hidden'}`);
    lines.push(readinessLine(profileSnapshot));
    lines.push(completionLine(profileSnapshot));
    lines.push('');
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
    [{ text: '🔗 LinkedIn URL', callback_data: 'p:ed:li' }],
    [{ text: '🧠 Skills', callback_data: 'p:sk' }],
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
    lines.push(`${toDisplayValue(profileSnapshot.display_name, profileSnapshot.linkedin_name || 'Unnamed profile')}`);
    lines.push(toDisplayValue(profileSnapshot.headline_user));
    lines.push('');
    lines.push(`Company: ${toDisplayValue(profileSnapshot.company_user)}`);
    lines.push(`City: ${toDisplayValue(profileSnapshot.city_user)}`);
    lines.push(`Industry: ${toDisplayValue(profileSnapshot.industry_user)}`);
    lines.push(`Skills: ${formatSkillSummary(profileSnapshot)}`);
    lines.push(`Public LinkedIn URL: ${toDisplayValue(profileSnapshot.linkedin_public_url)}`);
    lines.push(`Visibility: ${toDisplayValue(profileSnapshot.visibility_status)}`);
    lines.push(`Contact mode: ${toDisplayValue(profileSnapshot.contact_mode)}`);
    lines.push(`State: ${toDisplayValue(profileSnapshot.profile_state)}`);
    lines.push('');
    lines.push(`About: ${truncate(profileSnapshot.about_user, 320)}`);
    lines.push('');
    lines.push(readinessLine(profileSnapshot));
  }

  if (notice) {
    lines.push('');
    lines.push(notice);
  }

  return lines.join('\n');
}

export function renderProfilePreviewKeyboard() {
  return buildInlineKeyboard([
    [{ text: '↩️ Back to profile', callback_data: 'p:menu' }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
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
    `Current value: ${toDisplayValue(currentValue)}`,
    `Limit: ${meta.maxLength} characters`,
    '',
    'Reply with plain text in the chat. Your next text message will update this field.',
    'Use the buttons below to go back or return home.'
  ];

  return lines.join('\n');
}

export function renderProfileInputKeyboard() {
  return buildInlineKeyboard([
    [{ text: '↩️ Back to profile', callback_data: 'p:menu' }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
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
    [{ text: '↩️ Back to profile', callback_data: 'p:menu' }],
    [{ text: '👁 Preview card', callback_data: 'p:prev' }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
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
    [{ text: '↩️ Back to profile', callback_data: 'p:menu' }],
    [{ text: '👁 Preview card', callback_data: 'p:prev' }],
    [{ text: '🏠 Home', callback_data: 'home:root' }]
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
    lines.push(`Contact mode: ${toDisplayValue(profileSnapshot.contact_mode)}`);
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

  rows.push([{ text: '↩️ Back to directory', callback_data: `dir:list:${page}` }]);
  rows.push([{ text: '🎯 Filters', callback_data: 'dir:flt' }]);
  rows.push([{ text: '🏠 Home', callback_data: 'home:root' }]);

  return buildInlineKeyboard(rows);
}

export function renderIntroInboxText({ persistenceEnabled = false, inboxState = null, notice = null } = {}) {
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

    if (!(receivedItems.length || sentItems.length)) {
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

export function renderIntroInboxKeyboard({ inboxState = null } = {}) {
  const rows = [];
  const receivedItems = Array.isArray(inboxState?.received) ? inboxState.received : [];
  const sentItems = Array.isArray(inboxState?.sent) ? inboxState.sent : [];

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

  const hasItems = rows.length > 0;
  rows.push([{ text: '🔄 Refresh', callback_data: 'intro:inbox' }]);
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
