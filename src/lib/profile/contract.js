export const PROFILE_FIELD_KEYS = ['dn', 'hl', 'co', 'ci', 'in', 'ab', 'li', 'tg'];

export const PROFILE_FIELDS = {
  dn: {
    key: 'dn',
    column: 'display_name',
    label: 'Display name',
    prompt: 'Send the display name for your directory card.',
    placeholder: 'Rustam Lukmanov',
    maxLength: 80,
    required: true,
    multiline: false
  },
  hl: {
    key: 'hl',
    column: 'headline_user',
    label: 'Headline',
    prompt: 'Send a short professional headline.',
    placeholder: 'Founder | Growth operator | B2B partnerships',
    maxLength: 120,
    required: true,
    multiline: false
  },
  co: {
    key: 'co',
    column: 'company_user',
    label: 'Company',
    prompt: 'Send your current company or project name.',
    placeholder: 'Collabka PR',
    maxLength: 120,
    required: false,
    multiline: false
  },
  ci: {
    key: 'ci',
    column: 'city_user',
    label: 'City',
    prompt: 'Send your city or primary location.',
    placeholder: 'Miami',
    maxLength: 80,
    required: false,
    multiline: false
  },
  in: {
    key: 'in',
    column: 'industry_user',
    label: 'Industry',
    prompt: 'Send your industry or main category.',
    placeholder: 'Creator economy / B2B SaaS / Crypto',
    maxLength: 100,
    required: true,
    multiline: false
  },
  ab: {
    key: 'ab',
    column: 'about_user',
    label: 'About',
    prompt: 'Send a short about section for your directory card.',
    placeholder: 'I help brands build creator pipelines inside Telegram.',
    maxLength: 500,
    required: true,
    multiline: true
  },
  li: {
    key: 'li',
    column: 'linkedin_public_url',
    label: 'Public LinkedIn URL',
    prompt: 'Send your public LinkedIn profile URL. Example: https://www.linkedin.com/in/your-name',
    placeholder: 'https://www.linkedin.com/in/your-name',
    maxLength: 220,
    required: false,
    multiline: false
  },
  tg: {
    key: 'tg',
    column: 'telegram_username_hidden',
    label: 'Hidden Telegram username',
    prompt: 'Send your Telegram username without @ or t.me/. This stays hidden and can only be revealed after an approved direct contact request.',
    placeholder: 'rustam',
    maxLength: 32,
    required: false,
    multiline: false
  }
};

export const DIRECTORY_SKILLS = [
  { slug: 'founder', label: 'Founder' },
  { slug: 'growth', label: 'Growth' },
  { slug: 'sales', label: 'Sales' },
  { slug: 'ops', label: 'Operations' },
  { slug: 'product', label: 'Product' },
  { slug: 'design', label: 'Design' },
  { slug: 'dev', label: 'Development' },
  { slug: 'marketing', label: 'Marketing' },
  { slug: 'creator', label: 'Creator' },
  { slug: 'recruit', label: 'Recruiting' },
  { slug: 'saas', label: 'B2B SaaS' },
  { slug: 'crypto', label: 'Crypto' }
];

export const DIRECTORY_INDUSTRY_BUCKETS = [
  { slug: 'crypto', label: 'Crypto', keywords: ['crypto', 'web3', 'blockchain', 'defi', 'token', 'nft'] },
  { slug: 'saas', label: 'B2B SaaS', keywords: ['saas', 'software', 'b2b', 'crm', 'ai'] },
  { slug: 'creator', label: 'Creator economy', keywords: ['creator', 'ugc', 'influencer', 'community', 'social'] },
  { slug: 'agency', label: 'Agency / services', keywords: ['agency', 'service', 'services', 'consult', 'studio'] },
  { slug: 'ecom', label: 'E-commerce', keywords: ['ecommerce', 'e-commerce', 'shop', 'retail', 'd2c'] },
  { slug: 'talent', label: 'Recruiting / HR', keywords: ['recruit', 'talent', 'hiring', 'staffing', 'hr'] },
  { slug: 'media', label: 'Media', keywords: ['media', 'podcast', 'newsletter', 'press', 'content'] }
];

export const DIRECTORY_FILTER_INPUTS = {
  q: {
    kind: 'q',
    label: 'Search text',
    prompt: 'Send a short text query for the directory. It matches display name, headline, company, industry, and about.',
    placeholder: 'growth operator',
    maxLength: 80,
    storesAs: 'textQuery'
  },
  c: {
    kind: 'c',
    label: 'City',
    prompt: 'Send a city or location fragment to narrow the public directory.',
    placeholder: 'Miami',
    maxLength: 60,
    storesAs: 'cityQuery'
  }
};


export const CONTACT_MODE_OPTIONS = ['intro_request', 'paid_unlock_requires_approval'];

export function getContactModeLabel(contactMode) {
  if (contactMode === 'paid_unlock_requires_approval') {
    return 'Direct contact by paid request';
  }
  if (contactMode === 'intro_request') {
    return 'Intro only';
  }
  if (contactMode === 'telegram_only') {
    return 'Telegram only';
  }
  if (contactMode === 'external_link') {
    return 'External link';
  }
  return 'Unknown';
}

export function canProfileEnablePaidDirectContact(profileSnapshot = null) {
  return Boolean(trimToNull(profileSnapshot?.telegram_username_hidden));
}

const DIRECTORY_SKILL_MAP = new Map(DIRECTORY_SKILLS.map((skill) => [skill.slug, skill]));
const DIRECTORY_INDUSTRY_MAP = new Map(DIRECTORY_INDUSTRY_BUCKETS.map((bucket) => [bucket.slug, bucket]));
const DIRECTORY_FILTER_INPUT_MAP = new Map(Object.values(DIRECTORY_FILTER_INPUTS).map((input) => [input.kind, input]));

export const REQUIRED_PROFILE_FIELD_KEYS = PROFILE_FIELD_KEYS.filter((fieldKey) => PROFILE_FIELDS[fieldKey].required);
export const REQUIRED_SKILL_COUNT = 1;

export function getProfileFieldMeta(fieldKey) {
  return PROFILE_FIELDS[fieldKey] || null;
}

export function getSkillMeta(skillSlug) {
  return DIRECTORY_SKILL_MAP.get(skillSlug) || null;
}

export function getIndustryBucketMeta(industrySlug) {
  return DIRECTORY_INDUSTRY_MAP.get(industrySlug) || null;
}

export function getDirectoryFilterInputMeta(kind) {
  return DIRECTORY_FILTER_INPUT_MAP.get(kind) || null;
}

export function trimToNull(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized : null;
}

export function normalizeProfileFieldValue(fieldKey, value) {
  const meta = getProfileFieldMeta(fieldKey);
  if (!meta) {
    throw new Error(`Unsupported profile field key: ${fieldKey}`);
  }

  if (typeof value !== 'string') {
    throw new Error(`${meta.label} must be a text value`);
  }

  const normalized = meta.multiline
    ? value.trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    : value.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    throw new Error(`${meta.label} cannot be empty`);
  }

  if (normalized.length > meta.maxLength) {
    throw new Error(`${meta.label} is too long. Limit: ${meta.maxLength} characters`);
  }

  if (fieldKey === 'li') {
    return normalizeLinkedInPublicUrl(normalized);
  }

  if (fieldKey === 'tg') {
    return normalizeTelegramUsername(normalized);
  }

  return normalized;
}


export function normalizeTelegramUsername(value) {
  const normalized = trimToNull(value);
  if (!normalized) {
    throw new Error('Hidden Telegram username cannot be empty');
  }

  let username = normalized.replace(/^https?:\/\/t\.me\//i, '').replace(/^@+/, '').trim();
  username = username.replace(/\/$/, '');

  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) {
    throw new Error('Hidden Telegram username must be 5-32 characters and use only letters, numbers, or underscores');
  }

  return username;
}

export function normalizeLinkedInPublicUrl(value) {
  const normalized = trimToNull(value);
  if (!normalized) {
    throw new Error('Public LinkedIn URL cannot be empty');
  }

  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('Public LinkedIn URL must be a valid URL');
  }

  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error('Public LinkedIn URL must start with http:// or https://');
  }

  const host = url.hostname.toLowerCase();
  if (!(host === 'linkedin.com' || host === 'www.linkedin.com' || host.endsWith('.linkedin.com'))) {
    throw new Error('Public LinkedIn URL must point to linkedin.com');
  }

  const path = url.pathname.replace(/\/+$|^$/g, '');
  if (!(path.startsWith('/in/') || path.startsWith('/pub/'))) {
    throw new Error('Public LinkedIn URL must be a member profile URL like /in/...');
  }

  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

export function normalizeDirectorySearchQuery(value) {
  const normalized = trimToNull(value);
  if (!normalized) {
    throw new Error('Search text cannot be empty');
  }
  if (normalized.length > DIRECTORY_FILTER_INPUTS.q.maxLength) {
    throw new Error(`Search text is too long. Limit: ${DIRECTORY_FILTER_INPUTS.q.maxLength} characters`);
  }
  return normalized;
}

export function normalizeDirectoryCityQuery(value) {
  const normalized = trimToNull(value);
  if (!normalized) {
    throw new Error('City filter cannot be empty');
  }
  if (normalized.length > DIRECTORY_FILTER_INPUTS.c.maxLength) {
    throw new Error(`City filter is too long. Limit: ${DIRECTORY_FILTER_INPUTS.c.maxLength} characters`);
  }
  return normalized;
}

export function normalizeDirectoryFilterValue(kind, value) {
  if (kind === 'q') {
    return normalizeDirectorySearchQuery(value);
  }
  if (kind === 'c') {
    return normalizeDirectoryCityQuery(value);
  }
  throw new Error(`Unsupported directory filter input kind: ${kind}`);
}

export function isFilled(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeSkills(skills = []) {
  if (!Array.isArray(skills)) {
    return [];
  }

  return skills
    .map((skill) => {
      const skillSlug = typeof skill?.skill_slug === 'string' ? skill.skill_slug : skill?.slug;
      const meta = getSkillMeta(skillSlug);
      if (!meta) {
        return null;
      }

      return {
        skill_slug: meta.slug,
        skill_label: meta.label
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.skill_label.localeCompare(right.skill_label));
}

export function normalizeDirectoryFilterSkills(skillSlugs = []) {
  if (!Array.isArray(skillSlugs)) {
    return [];
  }

  return Array.from(new Set(
    skillSlugs
      .map((skillSlug) => getSkillMeta(skillSlug)?.slug)
      .filter(Boolean)
  )).sort();
}

export function normalizeDirectoryIndustryFilter(industrySlug) {
  if (industrySlug == null || industrySlug === '') {
    return null;
  }

  return getIndustryBucketMeta(industrySlug)?.slug || null;
}

export function classifyIndustryValue(industryValue) {
  const normalized = trimToNull(industryValue)?.toLowerCase();
  if (!normalized) {
    return null;
  }

  for (const bucket of DIRECTORY_INDUSTRY_BUCKETS) {
    if (bucket.keywords.some((keyword) => normalized.includes(keyword))) {
      return bucket;
    }
  }

  return null;
}

function includesInsensitive(value, query) {
  const normalizedValue = trimToNull(value)?.toLowerCase();
  const normalizedQuery = trimToNull(query)?.toLowerCase();
  if (!normalizedValue || !normalizedQuery) {
    return false;
  }
  return normalizedValue.includes(normalizedQuery);
}

export function directoryProfileMatchesFilters(profileSnapshot = {}, filters = {}) {
  const selectedIndustrySlug = normalizeDirectoryIndustryFilter(filters.selectedIndustrySlug);
  const selectedSkillSlugs = normalizeDirectoryFilterSkills(filters.selectedSkillSlugs || []);
  const textQuery = trimToNull(filters.textQuery);
  const cityQuery = trimToNull(filters.cityQuery);

  if (selectedIndustrySlug) {
    const bucket = classifyIndustryValue(profileSnapshot.industry_user);
    if (!bucket || bucket.slug !== selectedIndustrySlug) {
      return false;
    }
  }

  if (selectedSkillSlugs.length) {
    const profileSkillSlugs = new Set(normalizeSkills(profileSnapshot.skills || []).map((skill) => skill.skill_slug));
    if (!selectedSkillSlugs.some((skillSlug) => profileSkillSlugs.has(skillSlug))) {
      return false;
    }
  }

  if (cityQuery && !includesInsensitive(profileSnapshot.city_user, cityQuery)) {
    return false;
  }

  if (textQuery) {
    const haystack = [
      profileSnapshot.display_name,
      profileSnapshot.linkedin_name,
      profileSnapshot.headline_user,
      profileSnapshot.company_user,
      profileSnapshot.industry_user,
      profileSnapshot.about_user
    ];

    if (!haystack.some((value) => includesInsensitive(value, textQuery))) {
      return false;
    }
  }

  return true;
}

export function summarizeDirectoryFilters(filters = {}) {
  const selectedIndustrySlug = normalizeDirectoryIndustryFilter(filters.selectedIndustrySlug);
  const selectedSkillSlugs = normalizeDirectoryFilterSkills(filters.selectedSkillSlugs || []);
  const textQuery = trimToNull(filters.textQuery);
  const cityQuery = trimToNull(filters.cityQuery);

  const industryLabel = selectedIndustrySlug ? getIndustryBucketMeta(selectedIndustrySlug)?.label || '—' : 'All industries';
  const skillLabels = selectedSkillSlugs.length
    ? selectedSkillSlugs.map((skillSlug) => getSkillMeta(skillSlug)?.label || skillSlug).join(', ')
    : 'All skills';

  return {
    selectedIndustrySlug,
    selectedSkillSlugs,
    textQuery,
    cityQuery,
    industryLabel,
    skillLabels,
    textQueryLabel: textQuery || 'Any text',
    cityQueryLabel: cityQuery || 'Any city',
    isDefault: !selectedIndustrySlug && selectedSkillSlugs.length === 0 && !textQuery && !cityQuery
  };
}

export function computeProfileCompletion(profileSnapshot = {}) {
  const fields = PROFILE_FIELD_KEYS.map((fieldKey) => {
    const meta = PROFILE_FIELDS[fieldKey];
    const value = profileSnapshot[meta.column] || null;
    return {
      ...meta,
      value,
      filled: isFilled(value)
    };
  });

  const requiredFields = fields.filter((field) => field.required);
  const requiredFilledCount = requiredFields.filter((field) => field.filled).length;
  const filledCount = fields.filter((field) => field.filled).length;
  const skills = normalizeSkills(profileSnapshot.skills || []);
  const skillsCount = skills.length;
  const hasRequiredSkills = skillsCount >= REQUIRED_SKILL_COUNT;
  const isReady = requiredFilledCount === requiredFields.length && Boolean(profileSnapshot.linkedin_sub) && hasRequiredSkills;

  return {
    fields,
    requiredCount: requiredFields.length,
    requiredFilledCount,
    filledCount,
    totalCount: fields.length,
    skills,
    skillsCount,
    requiredSkillCount: REQUIRED_SKILL_COUNT,
    hasRequiredSkills,
    isReady
  };
}
