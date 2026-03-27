function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
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
    locale: firstNonEmpty(userInfo.locale, idTokenClaims.locale),
    email: firstNonEmpty(userInfo.email, idTokenClaims.email),
    emailVerified: Boolean(userInfo.email_verified ?? idTokenClaims.email_verified ?? false)
  };
}

export function buildConnectedSummary(identity) {
  const parts = [];
  if (identity.name) parts.push(`name=${identity.name}`);
  if (identity.email) parts.push(`email=${identity.email}`);
  if (identity.locale) parts.push(`locale=${identity.locale}`);
  return parts.join(', ');
}

export function buildPersistenceSummary(persistResult) {
  if (!persistResult?.persisted) {
    return 'Persistence unavailable in current environment';
  }

  const parts = ['LinkedIn identity saved'];
  if (persistResult.profileDraft?.profile_state) {
    parts.push(`profile=${persistResult.profileDraft.profile_state}`);
  }
  if (persistResult.profileDraft?.visibility_status) {
    parts.push(`visibility=${persistResult.profileDraft.visibility_status}`);
  }

  return parts.join(', ');
}
