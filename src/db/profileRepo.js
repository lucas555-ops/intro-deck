import {
  computeProfileCompletion,
  getProfileFieldMeta,
  getSkillMeta,
  normalizeSkills,
  REQUIRED_PROFILE_FIELD_KEYS
} from '../lib/profile/contract.js';

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function buildProfileDraftSeed(identity = {}) {
  const displayName = firstNonEmpty(identity.name, [identity.givenName, identity.familyName].filter(Boolean).join(' ')) || null;

  return {
    displayName,
    visibilityStatus: 'hidden',
    contactMode: 'intro_request',
    profileState: 'draft'
  };
}

export async function loadProfileSkillsByProfileId(client, profileId) {
  if (!profileId) {
    return [];
  }

  const result = await client.query(
    `
      select skill_slug, skill_label
      from member_profile_skills
      where profile_id = $1
      order by skill_label asc
    `,
    [profileId]
  );

  return normalizeSkills(result.rows || []);
}

export async function decorateProfileSnapshot(client, snapshot) {
  if (!snapshot) {
    return null;
  }

  const skills = await loadProfileSkillsByProfileId(client, snapshot.profile_id);
  const completion = computeProfileCompletion({
    ...snapshot,
    skills
  });

  return {
    ...snapshot,
    skills,
    completion
  };
}

async function normalizeProfileState(client, userId) {
  const checks = REQUIRED_PROFILE_FIELD_KEYS.map((fieldKey) => {
    const meta = getProfileFieldMeta(fieldKey);
    return `nullif(btrim(${meta.column}), '') is not null`;
  }).join(' and ');

  await client.query(
    `
      update member_profiles mp
      set
        profile_state = case when (${checks}) and exists (
          select 1
          from member_profile_skills mps
          where mps.profile_id = mp.id
        ) then 'active' else 'draft' end,
        updated_at = now()
      where mp.user_id = $1
    `,
    [userId]
  );
}

export async function ensureProfileDraft(client, { userId, identity }) {
  const seed = buildProfileDraftSeed(identity);

  await client.query(
    `
      insert into member_profiles (
        user_id,
        display_name,
        visibility_status,
        contact_mode,
        profile_state
      )
      values ($1, $2, $3, $4, $5)
      on conflict (user_id)
      do update set
        display_name = case
          when nullif(btrim(member_profiles.display_name), '') is null then excluded.display_name
          else member_profiles.display_name
        end,
        updated_at = now()
    `,
    [userId, seed.displayName, seed.visibilityStatus, seed.contactMode, seed.profileState]
  );

  await normalizeProfileState(client, userId);
  return getProfileSnapshotByUserId(client, userId);
}

export async function getProfileSnapshotByUserId(client, userId) {
  const result = await client.query(
    `
      select
        u.id as user_id,
        u.telegram_user_id,
        u.telegram_username,
        u.first_seen_at,
        u.last_seen_at,
        la.linkedin_sub,
        la.full_name as linkedin_name,
        la.given_name as linkedin_given_name,
        la.family_name as linkedin_family_name,
        la.email as linkedin_email,
        la.picture_url as linkedin_picture_url,
        la.locale as linkedin_locale,
        la.last_refresh_at as linkedin_last_refresh_at,
        mp.id as profile_id,
        mp.display_name,
        mp.headline_user,
        mp.company_user,
        mp.city_user,
        mp.industry_user,
        mp.about_user,
        mp.linkedin_public_url,
        mp.telegram_username_hidden,
        mp.visibility_status,
        mp.contact_mode,
        mp.profile_state,
        mp.created_at,
        mp.updated_at
      from users u
      left join linkedin_accounts la on la.user_id = u.id
      left join member_profiles mp on mp.user_id = u.id
      where u.id = $1
      limit 1
    `,
    [userId]
  );

  return decorateProfileSnapshot(client, result.rows[0] || null);
}

export async function getProfileSnapshotByTelegramUserId(client, telegramUserId) {
  const result = await client.query(
    `
      select
        u.id as user_id,
        u.telegram_user_id,
        u.telegram_username,
        u.first_seen_at,
        u.last_seen_at,
        la.linkedin_sub,
        la.full_name as linkedin_name,
        la.given_name as linkedin_given_name,
        la.family_name as linkedin_family_name,
        la.email as linkedin_email,
        la.picture_url as linkedin_picture_url,
        la.locale as linkedin_locale,
        la.last_refresh_at as linkedin_last_refresh_at,
        mp.id as profile_id,
        mp.display_name,
        mp.headline_user,
        mp.company_user,
        mp.city_user,
        mp.industry_user,
        mp.about_user,
        mp.linkedin_public_url,
        mp.telegram_username_hidden,
        mp.visibility_status,
        mp.contact_mode,
        mp.profile_state,
        mp.created_at,
        mp.updated_at
      from users u
      left join linkedin_accounts la on la.user_id = u.id
      left join member_profiles mp on mp.user_id = u.id
      where u.telegram_user_id = $1
      limit 1
    `,
    [telegramUserId]
  );

  return decorateProfileSnapshot(client, result.rows[0] || null);
}


export async function unhideProfileListingByUserId(client, userId) {
  await client.query(
    `
      update member_profiles
      set
        visibility_status = 'listed',
        updated_at = now()
      where user_id = $1
        and visibility_status = 'hidden'
        and profile_state = 'active'
    `,
    [userId]
  );

  return getProfileSnapshotByUserId(client, userId);
}

export async function hideProfileListingByUserId(client, userId) {
  await client.query(
    `
      update member_profiles
      set
        visibility_status = 'hidden',
        updated_at = now()
      where user_id = $1
        and visibility_status = 'listed'
    `,
    [userId]
  );

  return getProfileSnapshotByUserId(client, userId);
}

export async function updateProfileField(client, { userId, fieldKey, value }) {
  const meta = getProfileFieldMeta(fieldKey);
  if (!meta) {
    throw new Error(`Unsupported profile field key: ${fieldKey}`);
  }

  await client.query(
    `
      update member_profiles
      set
        ${meta.column} = $2,
        updated_at = now()
      where user_id = $1
    `,
    [userId, value]
  );

  await normalizeProfileState(client, userId);
  return getProfileSnapshotByUserId(client, userId);
}

export async function toggleProfileSkill(client, { userId, skillSlug }) {
  const skillMeta = getSkillMeta(skillSlug);
  if (!skillMeta) {
    throw new Error(`Unsupported skill slug: ${skillSlug}`);
  }

  const profileResult = await client.query(
    `
      select id as profile_id
      from member_profiles
      where user_id = $1
      limit 1
    `,
    [userId]
  );

  const profileId = profileResult.rows[0]?.profile_id;
  if (!profileId) {
    throw new Error('Profile not found for skill toggle');
  }

  const existing = await client.query(
    `
      select 1
      from member_profile_skills
      where profile_id = $1 and skill_slug = $2
      limit 1
    `,
    [profileId, skillMeta.slug]
  );

  if (existing.rows[0]) {
    await client.query(
      `
        delete from member_profile_skills
        where profile_id = $1 and skill_slug = $2
      `,
      [profileId, skillMeta.slug]
    );
  } else {
    await client.query(
      `
        insert into member_profile_skills (profile_id, skill_slug, skill_label)
        values ($1, $2, $3)
        on conflict (profile_id, skill_slug)
        do update set skill_label = excluded.skill_label
      `,
      [profileId, skillMeta.slug, skillMeta.label]
    );
  }

  await normalizeProfileState(client, userId);
  return {
    toggledOn: !existing.rows[0],
    profile: await getProfileSnapshotByUserId(client, userId)
  };
}

export async function clearProfileSkills(client, { userId }) {
  const profileResult = await client.query(
    `
      select id as profile_id
      from member_profiles
      where user_id = $1
      limit 1
    `,
    [userId]
  );

  const profileId = profileResult.rows[0]?.profile_id;
  if (!profileId) {
    throw new Error('Profile not found for clear skills');
  }

  await client.query(
    `
      delete from member_profile_skills
      where profile_id = $1
    `,
    [profileId]
  );

  await normalizeProfileState(client, userId);
  return getProfileSnapshotByUserId(client, userId);
}


export async function setProfileContactMode(client, { userId, contactMode }) {
  if (!['intro_request', 'paid_unlock_requires_approval'].includes(contactMode)) {
    throw new Error(`Unsupported contact mode: ${contactMode}`);
  }

  const result = await client.query(
    `
      update member_profiles
      set
        contact_mode = $2,
        updated_at = now()
      where user_id = $1
      returning id
    `,
    [userId, contactMode]
  );

  if (!result.rows[0]) {
    throw new Error('Profile not found for contact mode update');
  }

  return getProfileSnapshotByUserId(client, userId);
}

export async function setProfileVisibility(client, { userId, visibilityStatus }) {
  if (!['hidden', 'listed'].includes(visibilityStatus)) {
    throw new Error(`Unsupported visibility status: ${visibilityStatus}`);
  }

  const result = await client.query(
    `
      update member_profiles
      set
        visibility_status = $2,
        updated_at = now()
      where user_id = $1
      returning id
    `,
    [userId, visibilityStatus]
  );

  if (!result.rows[0]) {
    throw new Error('Profile not found for visibility update');
  }

  return getProfileSnapshotByUserId(client, userId);
}

