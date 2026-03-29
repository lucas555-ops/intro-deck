import {
  DIRECTORY_INDUSTRY_BUCKETS,
  directoryProfileMatchesFilters,
  normalizeDirectoryFilterSkills,
  normalizeDirectoryIndustryFilter,
  trimToNull
} from '../lib/profile/contract.js';
import { decorateProfileSnapshot } from './profileRepo.js';

function buildIndustrySqlCondition(selectedIndustrySlug, params) {
  const normalizedIndustrySlug = normalizeDirectoryIndustryFilter(selectedIndustrySlug);
  if (!normalizedIndustrySlug) {
    return null;
  }

  const bucket = DIRECTORY_INDUSTRY_BUCKETS.find((item) => item.slug === normalizedIndustrySlug);
  if (!bucket?.keywords?.length) {
    return null;
  }

  const clauses = bucket.keywords.map((keyword) => {
    params.push(`%${keyword.toLowerCase()}%`);
    return `lower(coalesce(mp.industry_user, '')) like $${params.length}`;
  });

  if (!clauses.length) {
    return null;
  }

  return `(${clauses.join(' or ')})`;
}

function buildSkillSqlCondition(selectedSkillSlugs, params) {
  const normalizedSkillSlugs = normalizeDirectoryFilterSkills(selectedSkillSlugs || []);
  if (!normalizedSkillSlugs.length) {
    return null;
  }

  params.push(normalizedSkillSlugs);
  return `exists (
    select 1
    from member_profile_skills mps
    where mps.profile_id = mp.id
      and mps.skill_slug = any($${params.length}::text[])
  )`;
}

function buildTextSearchSqlCondition(textQuery, params) {
  const normalized = trimToNull(textQuery)?.toLowerCase();
  if (!normalized) {
    return null;
  }

  params.push(`%${normalized}%`);
  const placeholder = `$${params.length}`;
  return `(
    lower(coalesce(mp.display_name, '')) like ${placeholder}
    or lower(coalesce(la.full_name, '')) like ${placeholder}
    or lower(coalesce(mp.headline_user, '')) like ${placeholder}
    or lower(coalesce(mp.company_user, '')) like ${placeholder}
    or lower(coalesce(mp.industry_user, '')) like ${placeholder}
    or lower(coalesce(mp.about_user, '')) like ${placeholder}
  )`;
}

function buildCitySqlCondition(cityQuery, params) {
  const normalized = trimToNull(cityQuery)?.toLowerCase();
  if (!normalized) {
    return null;
  }

  params.push(`%${normalized}%`);
  return `lower(coalesce(mp.city_user, '')) like $${params.length}`;
}

function buildListedProfilesWhereClause({
  selectedIndustrySlug = null,
  selectedSkillSlugs = [],
  textQuery = null,
  cityQuery = null
} = {}) {
  const params = [];
  const conditions = [
    `mp.visibility_status = 'listed'`,
    `mp.profile_state = 'active'`
  ];

  const industryCondition = buildIndustrySqlCondition(selectedIndustrySlug, params);
  if (industryCondition) {
    conditions.push(industryCondition);
  }

  const skillCondition = buildSkillSqlCondition(selectedSkillSlugs, params);
  if (skillCondition) {
    conditions.push(skillCondition);
  }

  const textCondition = buildTextSearchSqlCondition(textQuery, params);
  if (textCondition) {
    conditions.push(textCondition);
  }

  const cityCondition = buildCitySqlCondition(cityQuery, params);
  if (cityCondition) {
    conditions.push(cityCondition);
  }

  return {
    whereClause: conditions.join('\n        and '),
    params
  };
}

export async function listListedProfilesPage(client, {
  page = 0,
  pageSize = 5,
  viewerTelegramUserId = null,
  selectedIndustrySlug = null,
  selectedSkillSlugs = [],
  textQuery = null,
  cityQuery = null
} = {}) {
  const normalizedPage = Number.isFinite(page) && page >= 0 ? page : 0;
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 20) : 5;
  const offset = normalizedPage * normalizedPageSize;
  const normalizedIndustrySlug = normalizeDirectoryIndustryFilter(selectedIndustrySlug);
  const normalizedSkillSlugs = normalizeDirectoryFilterSkills(selectedSkillSlugs);
  const normalizedTextQuery = trimToNull(textQuery);
  const normalizedCityQuery = trimToNull(cityQuery);

  const whereBuilder = buildListedProfilesWhereClause({
    selectedIndustrySlug: normalizedIndustrySlug,
    selectedSkillSlugs: normalizedSkillSlugs,
    textQuery: normalizedTextQuery,
    cityQuery: normalizedCityQuery
  });

  const countResult = await client.query(
    `
      select count(*)::int as total_count
      from member_profiles mp
      join users u on u.id = mp.user_id
      left join linkedin_accounts la on la.user_id = u.id
      where ${whereBuilder.whereClause}
    `,
    whereBuilder.params
  );

  const totalCount = countResult.rows[0]?.total_count || 0;
  const listParams = [...whereBuilder.params, normalizedPageSize + 1, offset];

  const listResult = await client.query(
    `
      select
        u.id as user_id,
        u.telegram_user_id,
        u.telegram_username,
        la.linkedin_sub,
        la.full_name as linkedin_name,
        la.email as linkedin_email,
        la.picture_url as linkedin_picture_url,
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
      from member_profiles mp
      join users u on u.id = mp.user_id
      left join linkedin_accounts la on la.user_id = u.id
      where ${whereBuilder.whereClause}
      order by mp.updated_at desc, mp.id desc
      limit $${whereBuilder.params.length + 1} offset $${whereBuilder.params.length + 2}
    `,
    listParams
  );

  const visibleRows = (listResult.rows || []).slice(0, normalizedPageSize);
  const profiles = [];
  for (const row of visibleRows) {
    const decorated = await decorateProfileSnapshot(client, row);
    if (!directoryProfileMatchesFilters(decorated, {
      selectedIndustrySlug: normalizedIndustrySlug,
      selectedSkillSlugs: normalizedSkillSlugs,
      textQuery: normalizedTextQuery,
      cityQuery: normalizedCityQuery
    })) {
      continue;
    }

    profiles.push({
      ...decorated,
      is_viewer: viewerTelegramUserId != null && String(decorated.telegram_user_id) === String(viewerTelegramUserId)
    });
  }

  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    profiles,
    totalCount,
    hasPrev: normalizedPage > 0,
    hasNext: offset + normalizedPageSize < totalCount,
    appliedFilters: {
      selectedIndustrySlug: normalizedIndustrySlug,
      selectedSkillSlugs: normalizedSkillSlugs,
      textQuery: normalizedTextQuery,
      cityQuery: normalizedCityQuery
    }
  };
}

export async function getListedProfileCardById(client, { profileId, viewerTelegramUserId = null }) {
  const result = await client.query(
    `
      select
        u.id as user_id,
        u.telegram_user_id,
        u.telegram_username,
        la.linkedin_sub,
        la.full_name as linkedin_name,
        la.email as linkedin_email,
        la.picture_url as linkedin_picture_url,
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
      from member_profiles mp
      join users u on u.id = mp.user_id
      left join linkedin_accounts la on la.user_id = u.id
      where mp.id = $1
        and mp.visibility_status = 'listed'
        and mp.profile_state = 'active'
      limit 1
    `,
    [profileId]
  );

  const snapshot = await decorateProfileSnapshot(client, result.rows[0] || null);
  if (!snapshot) {
    return null;
  }

  return {
    ...snapshot,
    is_viewer: viewerTelegramUserId != null && String(snapshot.telegram_user_id) === String(viewerTelegramUserId)
  };
}
