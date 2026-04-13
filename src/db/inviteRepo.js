const INVITE_SOURCE_BY_PREFIX = {
  ii: 'inline_share',
  il: 'raw_link',
  ic: 'invite_card'
};

const INVITE_PREFIX_BY_SOURCE = {
  inline_share: 'ii',
  raw_link: 'il',
  invite_card: 'ic'
};

const INVITE_RECENT_LIMIT = 3;
const INVITE_HISTORY_PAGE_SIZE = 10;
const ADMIN_INVITE_RECENT_LIMIT = 5;
const ADMIN_INVITE_TOP_LIMIT = 5;

function fallbackMemberName(row) {
  const telegramUserId = row?.telegram_user_id;
  return Number.isFinite(Number(telegramUserId)) ? `Member ${telegramUserId}` : 'Member';
}

function buildMemberLabel(row) {
  return row?.display_name || row?.linkedin_name || row?.telegram_username || fallbackMemberName(row);
}

function normalizeInviteCode(rawCode) {
  const value = String(rawCode || '').trim().toUpperCase();
  return /^[A-Z0-9]+$/.test(value) ? value : null;
}

export function buildInviteCodeFromTelegramUserId(telegramUserId) {
  const numeric = Number.parseInt(String(telegramUserId), 10);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return null;
  }

  return numeric.toString(36).toUpperCase();
}

export function parseInviteCodeToTelegramUserId(inviteCode) {
  const normalized = normalizeInviteCode(inviteCode);
  if (!normalized) {
    return null;
  }

  const numeric = Number.parseInt(normalized, 36);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function buildInviteStartParam({ inviteCode, source = 'raw_link' }) {
  const prefix = INVITE_PREFIX_BY_SOURCE[source] || INVITE_PREFIX_BY_SOURCE.raw_link;
  const normalized = normalizeInviteCode(inviteCode);
  if (!normalized) {
    return null;
  }

  return `${prefix}_${normalized}`;
}

export function parseInviteStartParam(startParam) {
  const raw = String(startParam || '').trim();
  const match = raw.match(/^(ii|il|ic)_([A-Za-z0-9]+)$/);
  if (!match) {
    return null;
  }

  const inviteCode = normalizeInviteCode(match[2]);
  if (!inviteCode) {
    return null;
  }

  const referrerTelegramUserId = parseInviteCodeToTelegramUserId(inviteCode);
  if (!referrerTelegramUserId) {
    return null;
  }

  return {
    raw,
    inviteCode,
    prefix: match[1].toLowerCase(),
    source: INVITE_SOURCE_BY_PREFIX[match[1].toLowerCase()] || 'raw_link',
    referrerTelegramUserId
  };
}

export function buildInviteLink({ botUsername, inviteCode, source = 'raw_link' }) {
  const username = String(botUsername || '').trim().replace(/^@+/, '');
  const startParam = buildInviteStartParam({ inviteCode, source });
  if (!username || !startParam) {
    return null;
  }

  return `https://t.me/${username}?start=${startParam}`;
}

export async function getUserByTelegramUserId(client, telegramUserId) {
  const result = await client.query(
    `
      select id, telegram_user_id, telegram_username, first_seen_at, last_seen_at
      from users
      where telegram_user_id = $1
      limit 1
    `,
    [telegramUserId]
  );

  return result.rows[0] || null;
}

export async function getInviteAttributionByInvitedUserId(client, invitedUserId) {
  const result = await client.query(
    `
      select
        inv.id as invite_id,
        inv.referrer_user_id,
        inv.invited_user_id,
        inv.invite_code,
        inv.source,
        inv.start_param,
        inv.joined_at,
        inv.activated_at,
        ref.telegram_user_id as referrer_telegram_user_id,
        ref.telegram_username as referrer_telegram_username,
        la.full_name as referrer_linkedin_name,
        mp.display_name as referrer_display_name,
        mp.headline_user as referrer_headline_user
      from member_invites inv
      join users ref on ref.id = inv.referrer_user_id
      left join linkedin_accounts la on la.user_id = ref.id
      left join member_profiles mp on mp.user_id = ref.id
      where inv.invited_user_id = $1
      limit 1
    `,
    [invitedUserId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    inviteId: row.invite_id,
    referrerUserId: row.referrer_user_id,
    invitedUserId: row.invited_user_id,
    inviteCode: row.invite_code,
    source: row.source,
    startParam: row.start_param,
    joinedAt: row.joined_at,
    activatedAt: row.activated_at,
    invitedBy: {
      telegramUserId: row.referrer_telegram_user_id,
      telegramUsername: row.referrer_telegram_username || null,
      displayName: buildMemberLabel({
        display_name: row.referrer_display_name,
        linkedin_name: row.referrer_linkedin_name,
        telegram_username: row.referrer_telegram_username,
        telegram_user_id: row.referrer_telegram_user_id
      }),
      headlineUser: row.referrer_headline_user || null
    }
  };
}

export async function createInviteAttribution(client, {
  referrerUserId,
  invitedUserId,
  inviteCode,
  source,
  startParam
}) {
  const result = await client.query(
    `
      insert into member_invites (
        referrer_user_id,
        invited_user_id,
        invite_code,
        source,
        start_param,
        joined_at,
        updated_at
      )
      values ($1, $2, $3, $4, $5, now(), now())
      returning id, joined_at, activated_at
    `,
    [referrerUserId, invitedUserId, inviteCode, source, startParam]
  );

  return {
    inviteId: result.rows[0]?.id || null,
    joinedAt: result.rows[0]?.joined_at || null,
    activatedAt: result.rows[0]?.activated_at || null
  };
}


export async function loadInviteSnapshotByUserId(client, { userId, telegramUserId, botUsername, recentLimit = INVITE_RECENT_LIMIT }) {
  const inviteCode = buildInviteCodeFromTelegramUserId(telegramUserId);
  const rawLink = buildInviteLink({ botUsername, inviteCode, source: 'raw_link' });
  const inlineLink = buildInviteLink({ botUsername, inviteCode, source: 'inline_share' });
  const cardLink = buildInviteLink({ botUsername, inviteCode, source: 'invite_card' });
  const normalizedRecentLimit = Number.isFinite(Number(recentLimit)) && Number(recentLimit) > 0
    ? Math.min(10, Number(recentLimit))
    : INVITE_RECENT_LIMIT;

  const countsResult = await client.query(
    `
      select
        count(*)::int as invited_count,
        count(*) filter (
          where la.user_id is not null or mp.id is not null
        )::int as activated_count,
        count(*) filter (where inv.source = 'inline_share')::int as inline_share_count,
        count(*) filter (where inv.source = 'raw_link')::int as raw_link_count,
        count(*) filter (where inv.source = 'invite_card')::int as invite_card_count,
        count(*) filter (where inv.joined_at >= now() - interval '7 days')::int as joined_7d,
        count(*) filter (
          where (la.user_id is not null or mp.id is not null)
            and inv.joined_at >= now() - interval '7 days'
        )::int as activated_7d
      from member_invites inv
      join users invited on invited.id = inv.invited_user_id
      left join linkedin_accounts la on la.user_id = invited.id
      left join member_profiles mp on mp.user_id = invited.id
      where inv.referrer_user_id = $1
    `,
    [userId]
  );

  const recentResult = await client.query(
    `
      select
        inv.id as invite_id,
        inv.source,
        inv.joined_at,
        inv.activated_at,
        invited.telegram_user_id,
        invited.telegram_username,
        la.full_name as linkedin_name,
        mp.display_name,
        mp.headline_user,
        case when la.user_id is not null or mp.id is not null then true else false end as is_activated
      from member_invites inv
      join users invited on invited.id = inv.invited_user_id
      left join linkedin_accounts la on la.user_id = invited.id
      left join member_profiles mp on mp.user_id = invited.id
      where inv.referrer_user_id = $1
      order by inv.joined_at desc
      limit $2
    `,
    [userId, normalizedRecentLimit + 1]
  );

  const invitedBy = await getInviteAttributionByInvitedUserId(client, userId);
  const rows = recentResult.rows || [];
  const limitedRows = rows.slice(0, normalizedRecentLimit);

  return {
    inviteCode,
    inviteLink: rawLink,
    inlineInviteLink: inlineLink,
    inviteCardLink: cardLink,
    shareInlineQuery: 'invite',
    invitedCount: countsResult.rows[0]?.invited_count || 0,
    activatedCount: countsResult.rows[0]?.activated_count || 0,
    inlineShareCount: countsResult.rows[0]?.inline_share_count || 0,
    rawLinkCount: countsResult.rows[0]?.raw_link_count || 0,
    inviteCardCount: countsResult.rows[0]?.invite_card_count || 0,
    joined7d: countsResult.rows[0]?.joined_7d || 0,
    activated7d: countsResult.rows[0]?.activated_7d || 0,
    invitedBy: invitedBy?.invitedBy || null,
    invited: limitedRows.map((row) => ({
      inviteId: row.invite_id,
      source: row.source,
      joinedAt: row.joined_at,
      activatedAt: row.activated_at,
      displayName: buildMemberLabel(row),
      headlineUser: row.headline_user || null,
      status: row.is_activated ? 'activated' : 'joined'
    })),
    hasMoreInvites: rows.length > normalizedRecentLimit
  };
}

export async function loadInviteHistoryByUserId(client, { userId, page = 1, pageSize = INVITE_HISTORY_PAGE_SIZE }) {
  const normalizedPage = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const normalizedPageSize = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0
    ? Math.min(50, Number(pageSize))
    : INVITE_HISTORY_PAGE_SIZE;
  const offset = (normalizedPage - 1) * normalizedPageSize;

  const totalResult = await client.query(
    `
      select count(*)::int as total_count
      from member_invites inv
      where inv.referrer_user_id = $1
    `,
    [userId]
  );

  const totalCount = Number(totalResult.rows[0]?.total_count || 0) || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / normalizedPageSize));
  const safePage = Math.min(normalizedPage, totalPages);
  const safeOffset = (safePage - 1) * normalizedPageSize;

  const result = await client.query(
    `
      select
        inv.id as invite_id,
        inv.source,
        inv.joined_at,
        inv.activated_at,
        invited.telegram_user_id,
        invited.telegram_username,
        la.full_name as linkedin_name,
        mp.display_name,
        mp.headline_user,
        case when la.user_id is not null or mp.id is not null then true else false end as is_activated
      from member_invites inv
      join users invited on invited.id = inv.invited_user_id
      left join linkedin_accounts la on la.user_id = invited.id
      left join member_profiles mp on mp.user_id = invited.id
      where inv.referrer_user_id = $1
      order by inv.joined_at desc
      limit $2 offset $3
    `,
    [userId, normalizedPageSize, safeOffset]
  );

  const items = (result.rows || []).map((row) => ({
    inviteId: row.invite_id,
    source: row.source,
    joinedAt: row.joined_at,
    activatedAt: row.activated_at,
    displayName: buildMemberLabel(row),
    headlineUser: row.headline_user || null,
    status: row.is_activated ? 'activated' : 'joined'
  }));
  const startIndex = totalCount > 0 ? safeOffset : 0;
  const endIndex = totalCount > 0 ? safeOffset + items.length : 0;

  return {
    totalCount,
    page: safePage,
    pageSize: normalizedPageSize,
    totalPages,
    hasPrev: safePage > 1,
    hasNext: safePage < totalPages,
    startIndex,
    endIndex,
    items
  };
}

export async function loadAdminInviteSnapshot(client, { recentLimit = ADMIN_INVITE_RECENT_LIMIT, topLimit = ADMIN_INVITE_TOP_LIMIT } = {}) {
  const normalizedRecentLimit = Number.isFinite(Number(recentLimit)) && Number(recentLimit) > 0
    ? Math.min(20, Number(recentLimit))
    : ADMIN_INVITE_RECENT_LIMIT;
  const normalizedTopLimit = Number.isFinite(Number(topLimit)) && Number(topLimit) > 0
    ? Math.min(20, Number(topLimit))
    : ADMIN_INVITE_TOP_LIMIT;

  const summaryResult = await client.query(
    `
      select
        count(*)::int as total_invites,
        count(*) filter (where la.user_id is not null or mp.id is not null)::int as activated_invites,
        count(*) filter (where inv.source = 'inline_share')::int as inline_share_count,
        count(*) filter (where inv.source = 'raw_link')::int as raw_link_count,
        count(*) filter (where inv.source = 'invite_card')::int as invite_card_count,
        count(*) filter (where inv.joined_at >= now() - interval '7 days')::int as joined_7d,
        count(*) filter (where (la.user_id is not null or mp.id is not null) and inv.joined_at >= now() - interval '7 days')::int as activated_7d
      from member_invites inv
      join users invited on invited.id = inv.invited_user_id
      left join linkedin_accounts la on la.user_id = invited.id
      left join member_profiles mp on mp.user_id = invited.id
    `
  );

  const topResult = await client.query(
    `
      select
        inv.referrer_user_id,
        ref.telegram_user_id as referrer_telegram_user_id,
        ref.telegram_username as referrer_telegram_username,
        la_ref.full_name as referrer_linkedin_name,
        mp_ref.display_name as referrer_display_name,
        count(*)::int as invited_count,
        count(*) filter (where la.user_id is not null or mp.id is not null)::int as activated_count
      from member_invites inv
      join users ref on ref.id = inv.referrer_user_id
      join users invited on invited.id = inv.invited_user_id
      left join linkedin_accounts la on la.user_id = invited.id
      left join member_profiles mp on mp.user_id = invited.id
      left join linkedin_accounts la_ref on la_ref.user_id = ref.id
      left join member_profiles mp_ref on mp_ref.user_id = ref.id
      group by inv.referrer_user_id, ref.telegram_user_id, ref.telegram_username, la_ref.full_name, mp_ref.display_name
      order by invited_count desc, activated_count desc, inv.referrer_user_id asc
      limit $1
    `,
    [normalizedTopLimit]
  );

  const recentResult = await client.query(
    `
      select
        inv.id as invite_id,
        inv.source,
        inv.joined_at,
        inv.activated_at,
        ref.telegram_user_id as referrer_telegram_user_id,
        ref.telegram_username as referrer_telegram_username,
        la_ref.full_name as referrer_linkedin_name,
        mp_ref.display_name as referrer_display_name,
        invited.telegram_user_id,
        invited.telegram_username,
        la.full_name as linkedin_name,
        mp.display_name,
        mp.headline_user,
        case when la.user_id is not null or mp.id is not null then true else false end as is_activated
      from member_invites inv
      join users ref on ref.id = inv.referrer_user_id
      join users invited on invited.id = inv.invited_user_id
      left join linkedin_accounts la on la.user_id = invited.id
      left join member_profiles mp on mp.user_id = invited.id
      left join linkedin_accounts la_ref on la_ref.user_id = ref.id
      left join member_profiles mp_ref on mp_ref.user_id = ref.id
      order by inv.joined_at desc
      limit $1
    `,
    [normalizedRecentLimit]
  );

  const summaryRow = summaryResult.rows[0] || {};
  const totalInvites = Number(summaryRow.total_invites || 0) || 0;
  const activatedInvites = Number(summaryRow.activated_invites || 0) || 0;
  const activationRate = totalInvites > 0 ? Math.round((activatedInvites / totalInvites) * 1000) / 10 : 0;

  return {
    summary: {
      totalInvites,
      activatedInvites,
      activationRate,
      inlineShareCount: Number(summaryRow.inline_share_count || 0) || 0,
      rawLinkCount: Number(summaryRow.raw_link_count || 0) || 0,
      inviteCardCount: Number(summaryRow.invite_card_count || 0) || 0,
      joined7d: Number(summaryRow.joined_7d || 0) || 0,
      activated7d: Number(summaryRow.activated_7d || 0) || 0
    },
    topInviters: (topResult.rows || []).map((row) => {
      const invitedCount = Number(row.invited_count || 0) || 0;
      const activatedCount = Number(row.activated_count || 0) || 0;
      return {
        referrerUserId: row.referrer_user_id,
        displayName: buildMemberLabel({
          display_name: row.referrer_display_name,
          linkedin_name: row.referrer_linkedin_name,
          telegram_username: row.referrer_telegram_username,
          telegram_user_id: row.referrer_telegram_user_id
        }),
        invitedCount,
        activatedCount,
        activationRate: invitedCount > 0 ? Math.round((activatedCount / invitedCount) * 1000) / 10 : 0
      };
    }),
    recentInvites: (recentResult.rows || []).map((row) => ({
      inviteId: row.invite_id,
      source: row.source,
      joinedAt: row.joined_at,
      activatedAt: row.activated_at,
      referrerDisplayName: buildMemberLabel({
        display_name: row.referrer_display_name,
        linkedin_name: row.referrer_linkedin_name,
        telegram_username: row.referrer_telegram_username,
        telegram_user_id: row.referrer_telegram_user_id
      }),
      displayName: buildMemberLabel(row),
      headlineUser: row.headline_user || null,
      status: row.is_activated ? 'activated' : 'joined'
    }))
  };
}
