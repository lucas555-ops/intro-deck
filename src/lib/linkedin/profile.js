function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function normalizeLocale(value) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (value && typeof value === 'object') {
    const language = firstNonEmpty(value.language, value.lang, value.locale, value.code);
    const country = firstNonEmpty(value.country, value.region);
    if (language && country) {
      return `${language}_${country}`;
    }
    return language || country || null;
  }

  return null;
}

function hasNonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function importedIdentityFields(identity = {}) {
  const fields = [];

  if (hasNonEmptyText(identity.linkedinSub)) fields.push('linkedin_sub');
  if (hasNonEmptyText(identity.name)) fields.push('full_name');
  if (hasNonEmptyText(identity.givenName)) fields.push('given_name');
  if (hasNonEmptyText(identity.familyName)) fields.push('family_name');
  if (hasNonEmptyText(identity.pictureUrl)) fields.push('picture_url');
  if (hasNonEmptyText(identity.locale)) fields.push('locale');
  if (hasNonEmptyText(identity.email)) fields.push('email');

  return fields;
}

export function pickLinkedInIdentityClaims({ idTokenClaims = {}, userInfo = {} }) {
  const name = firstNonEmpty(userInfo.name, idTokenClaims.name);
  const givenName = firstNonEmpty(userInfo.given_name, idTokenClaims.given_name);
  const familyName = firstNonEmpty(userInfo.family_name, idTokenClaims.family_name);

  return {
    linkedinSub: firstNonEmpty(userInfo.sub, idTokenClaims.sub),
    name,
    givenName,
    familyName,
    pictureUrl: firstNonEmpty(userInfo.picture, idTokenClaims.picture),
    locale: normalizeLocale(userInfo.locale ?? idTokenClaims.locale),
    email: firstNonEmpty(userInfo.email, idTokenClaims.email),
    emailVerified: Boolean(userInfo.email_verified ?? idTokenClaims.email_verified ?? false)
  };
}

export function buildConnectedSummary(identity) {
  const parts = [];
  if (identity?.name) parts.push(`name=${identity.name}`);
  if (identity?.pictureUrl) parts.push('photo=imported');
  if (identity?.locale) parts.push(`locale=${identity.locale}`);
  if (identity?.email) parts.push(`email=${identity.email}`);
  return parts.length ? parts.join(', ') : 'Basic LinkedIn identity imported';
}

export function buildIdentityImportSummary(identity) {
  const fieldLabels = importedIdentityFields(identity).map((fieldKey) => {
    switch (fieldKey) {
      case 'full_name':
        return 'name';
      case 'given_name':
        return 'given name';
      case 'family_name':
        return 'family name';
      case 'picture_url':
        return 'photo';
      case 'linkedin_sub':
        return 'identity binding';
      default:
        return fieldKey.replaceAll('_', ' ');
    }
  });

  return fieldLabels.length
    ? `Basic LinkedIn import: ${fieldLabels.join(', ')}`
    : 'Basic LinkedIn import is ready';
}

export function buildManualProfileFieldsReminder() {
  return 'Headline, company, city, industry, about, skills, and public LinkedIn URL stay editable in Telegram.';
}

export function buildPersistenceSummary(persistResult) {
  if (!persistResult?.persisted) {
    return 'Persistence unavailable in current environment';
  }

  const parts = ['LinkedIn identity saved'];
  if (Array.isArray(persistResult.identityImportedFields) && persistResult.identityImportedFields.length > 0) {
    parts.push(`imported=${persistResult.identityImportedFields.length}`);
  }
  if (persistResult.profileSeed?.displayNameSeeded) {
    parts.push('display_name_seeded');
  }
  if (persistResult.profileDraft?.profile_state) {
    parts.push(`profile=${persistResult.profileDraft.profile_state}`);
  }
  if (persistResult.profileDraft?.visibility_status) {
    parts.push(`visibility=${persistResult.profileDraft.visibility_status}`);
  }

  return parts.join(', ');
}
