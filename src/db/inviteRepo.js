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

const INVITE_REWARD_EVENT_TYPE_ACTIVATION = 'invite_activation_reward';
const INVITE_REWARDS_DEFAULTS = {
  mode: 'off',
  activationPoints: 10,
  activationConfirmHours: 24,
  activationRuleVersion: 'introdeck_listed_ready_v1',
  catalogVersion: 'v1'
};

const INVITE_REWARDS_CATALOG = Object.freeze([
  { code: 'pro_7d', pointsCost: 100, proDays: 7, label: '7 days Pro' },
  { code: 'pro_30d', pointsCost: 250, proDays: 30, label: '30 days Pro' }
]);

function normalizeInviteRewardsCatalogItem(item = null) {
  if (!item) {
    return null;
  }

  return {
    code: String(item.code || '').trim().toLowerCase(),
    pointsCost: Math.max(0, Number(item.pointsCost || item.points_cost || 0) || 0),
    proDays: Math.max(0, Number(item.proDays || item.pro_days || 0) || 0),
    label: String(item.label || '').trim() || null
  };
}

function normalizeInviteRewardRedemptionRow(row = null) {
  if (!row) {
    return null;
  }

  return {
    redemptionId: row.id,
    userId: row.user_id,
    catalogCode: row.catalog_code,
    pointsCost: Number(row.points_cost || 0) || 0,
    proDays: Number(row.pro_days || 0) || 0,
    status: row.status,
    rewardLedgerEntryId: row.reward_ledger_entry_id || null,
    rewardEventId: row.reward_event_id || null,
    subscriptionId: row.subscription_id || null,
    receiptId: row.receipt_id || null,
    requestedAt: row.requested_at || row.created_at || null,
    completedAt: row.completed_at || null,
    failedAt: row.failed_at || null,
    failureReason: row.failure_reason || null,
    meta: row.meta_json || {},
    createdAt: row.created_at || null
  };
}

function normalizeInviteRewardsMode(value = INVITE_REWARDS_DEFAULTS.mode) {
  const normalized = String(value || INVITE_REWARDS_DEFAULTS.mode).trim().toLowerCase();
  return ['off', 'earn_only', 'live', 'paused'].includes(normalized) ? normalized : INVITE_REWARDS_DEFAULTS.mode;
}

function normalizeInviteRewardsConfig(value = null) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    activationPoints: Math.max(0, Math.min(Number(raw.activationPoints ?? raw.activation_points ?? INVITE_REWARDS_DEFAULTS.activationPoints) || INVITE_REWARDS_DEFAULTS.activationPoints, 10000)),
    activationConfirmHours: Math.max(1, Math.min(Number(raw.activationConfirmHours ?? raw.activation_confirm_hours ?? INVITE_REWARDS_DEFAULTS.activationConfirmHours) || INVITE_REWARDS_DEFAULTS.activationConfirmHours, 24 * 30)),
    activationRuleVersion: String(raw.activationRuleVersion ?? raw.activation_rule_version ?? INVITE_REWARDS_DEFAULTS.activationRuleVersion).trim() || INVITE_REWARDS_DEFAULTS.activationRuleVersion,
    catalogVersion: String(raw.catalogVersion ?? raw.catalog_version ?? INVITE_REWARDS_DEFAULTS.catalogVersion).trim() || INVITE_REWARDS_DEFAULTS.catalogVersion
  };
}

function normalizeInviteRewardEventRow(row = null) {
  if (!row) {
    return null;
  }

  return {
    rewardEventId: row.id,
    referrerUserId: row.referrer_user_id,
    invitedUserId: row.invited_user_id,
    inviteLinkId: row.invite_link_id || null,
    inviteCode: row.invite_code || null,
    eventType: row.event_type,
    status: row.status,
    points: Number(row.points || 0) || 0,
    activationAt: row.activation_at,
    confirmAfter: row.confirm_after,
    confirmedAt: row.confirmed_at || null,
    rejectedAt: row.rejected_at || null,
    rejectReason: row.reject_reason || null,
    settledAt: row.settled_at || null,
    settlementRunId: row.settlement_run_id || null,
    stateVersion: Number(row.state_version || 1) || 1,
    meta: row.meta_json || {},
    createdAt: row.created_at
  };
}

function normalizeInviteRewardSettlementRunRow(row = null) {
  if (!row) {
    return null;
  }

  return {
    settlementRunId: row.run_id,
    status: row.status,
    modeSnapshot: normalizeInviteRewardsMode(row.mode_snapshot),
    processedCount: Number(row.processed_count || 0) || 0,
    confirmedCount: Number(row.confirmed_count || 0) || 0,
    rejectedCount: Number(row.rejected_count || 0) || 0,
    skippedCount: Number(row.skipped_count || 0) || 0,
    errorCount: Number(row.error_count || 0) || 0,
    startedAt: row.started_at || null,
    finishedAt: row.finished_at || null,
    meta: row.meta_json || {}
  };
}

function buildInviteRewardSettlementRunId() {
  const ts = Date.now().toString(36);
  const random = Math.floor(Math.random() * 1_000_000).toString(36).padStart(4, '0');
  return `inv_settle_${ts}_${random}`;
}

async function upsertInviteProgramSetting(client, { key, valueJson, updatedBy = null }) {
  const result = await client.query(
    `
      insert into invite_program_settings (key, value_json, updated_at, updated_by)
      values ($1, $2::jsonb, now(), $3)
      on conflict (key)
      do update set
        value_json = excluded.value_json,
        updated_at = now(),
        updated_by = excluded.updated_by
      returning key, value_json, updated_at, updated_by
    `,
    [key, JSON.stringify(valueJson || {}), updatedBy]
  );

  return result.rows[0] || null;
}

export async function ensureInviteRewardsDefaults(client) {
  const modeResult = await client.query(
    `
      insert into invite_program_settings (key, value_json, updated_at, updated_by)
      values ('invite_rewards_mode', $1::jsonb, now(), null)
      on conflict (key) do nothing
      returning key, value_json
    `,
    [JSON.stringify({ mode: INVITE_REWARDS_DEFAULTS.mode })]
  );

  const configResult = await client.query(
    `
      insert into invite_program_settings (key, value_json, updated_at, updated_by)
      values ('invite_rewards_config', $1::jsonb, now(), null)
      on conflict (key) do nothing
      returning key, value_json
    `,
    [JSON.stringify(normalizeInviteRewardsConfig())]
  );

  return {
    mode: normalizeInviteRewardsMode(modeResult.rows[0]?.value_json?.mode || INVITE_REWARDS_DEFAULTS.mode),
    config: normalizeInviteRewardsConfig(configResult.rows[0]?.value_json || INVITE_REWARDS_DEFAULTS)
  };
}

export function getInviteRewardsCatalog() {
  return INVITE_REWARDS_CATALOG.map((item) => normalizeInviteRewardsCatalogItem(item));
}

export function getRedeemCatalogItemByCode(catalogCode) {
  const normalized = String(catalogCode || '').trim().toLowerCase();
  return normalizeInviteRewardsCatalogItem(INVITE_REWARDS_CATALOG.find((item) => item.code === normalized) || null);
}

export async function getInviteRewardsMode(client) {
  await ensureInviteRewardsDefaults(client);
  const result = await client.query(
    `
      select value_json
      from invite_program_settings
      where key = 'invite_rewards_mode'
      limit 1
    `
  );

  return normalizeInviteRewardsMode(result.rows[0]?.value_json?.mode || INVITE_REWARDS_DEFAULTS.mode);
}

export async function appendInviteRewardsModeAudit(client, { changedByUserId, fromMode, toMode, reason = null, meta = null } = {}) {
  const result = await client.query(
    `
      insert into invite_program_mode_audit (
        changed_by_user_id,
        from_mode,
        to_mode,
        reason,
        meta_json,
        created_at
      )
      values ($1, $2, $3, $4, $5::jsonb, now())
      returning *
    `,
    [changedByUserId, normalizeInviteRewardsMode(fromMode), normalizeInviteRewardsMode(toMode), reason, JSON.stringify(meta || {})]
  );

  return result.rows[0] || null;
}

export async function getRecentInviteRewardsModeAudit(client, { limit = 5 } = {}) {
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.min(20, Number(limit)) : 5;
  const result = await client.query(
    `
      select
        audit.*,
        u.telegram_user_id,
        u.telegram_username,
        la.full_name as linkedin_name,
        mp.display_name
      from invite_program_mode_audit audit
      join users u on u.id = audit.changed_by_user_id
      left join linkedin_accounts la on la.user_id = u.id
      left join member_profiles mp on mp.user_id = u.id
      order by audit.created_at desc, audit.id desc
      limit $1
    `,
    [safeLimit]
  );

  return (result.rows || []).map((row) => ({
    auditId: row.id,
    changedByUserId: row.changed_by_user_id,
    changedByDisplayName: buildMemberLabel({
      display_name: row.display_name,
      linkedin_name: row.linkedin_name,
      telegram_username: row.telegram_username,
      telegram_user_id: row.telegram_user_id
    }),
    fromMode: normalizeInviteRewardsMode(row.from_mode),
    toMode: normalizeInviteRewardsMode(row.to_mode),
    reason: row.reason || null,
    meta: row.meta_json || {},
    createdAt: row.created_at
  }));
}

export async function setInviteRewardsMode(client, { mode, updatedBy = null, changedByUserId = null, reason = null, meta = null } = {}) {
  const previousMode = await getInviteRewardsMode(client);
  const normalizedMode = normalizeInviteRewardsMode(mode);
  const row = await upsertInviteProgramSetting(client, {
    key: 'invite_rewards_mode',
    valueJson: { mode: normalizedMode },
    updatedBy
  });

  const changed = previousMode !== normalizedMode;
  if (changed && changedByUserId) {
    await appendInviteRewardsModeAudit(client, {
      changedByUserId,
      fromMode: previousMode,
      toMode: normalizedMode,
      reason,
      meta
    });
  }

  return {
    changed,
    previousMode,
    mode: normalizeInviteRewardsMode(row?.value_json?.mode || normalizedMode),
    updatedAt: row?.updated_at || null,
    updatedBy: row?.updated_by || null
  };
}

export async function getInviteRewardsConfig(client) {
  await ensureInviteRewardsDefaults(client);
  const result = await client.query(
    `
      select value_json
      from invite_program_settings
      where key = 'invite_rewards_config'
      limit 1
    `
  );

  return normalizeInviteRewardsConfig(result.rows[0]?.value_json || INVITE_REWARDS_DEFAULTS);
}

export async function getInviteRewardActivationStateByInvitedUserId(client, { invitedUserId }) {
  const result = await client.query(
    `
      select
        u.id as invited_user_id,
        inv.id as invite_id,
        inv.referrer_user_id,
        inv.invite_code,
        inv.source,
        inv.joined_at,
        inv.activated_at,
        la.user_id is not null as has_linkedin,
        mp.id as profile_id,
        mp.profile_state,
        mp.visibility_status,
        case
          when la.user_id is not null and mp.profile_state = 'active' then true
          else false
        end as is_listed_ready,
        case
          when la.user_id is not null and mp.profile_state = 'active' and mp.visibility_status = 'listed' then true
          else false
        end as is_listed_live
      from users u
      left join member_invites inv on inv.invited_user_id = u.id
      left join linkedin_accounts la on la.user_id = u.id
      left join member_profiles mp on mp.user_id = u.id
      where u.id = $1
      limit 1
    `,
    [invitedUserId]
  );

  const row = result.rows[0] || null;
  if (!row) {
    return {
      invitedUserId,
      inviteId: null,
      referrerUserId: null,
      inviteCode: null,
      source: null,
      joinedAt: null,
      activatedAt: null,
      hasLinkedIn: false,
      profileId: null,
      profileState: null,
      visibilityStatus: null,
      isListedReady: false,
      isListedLive: false,
      rewardable: false,
      reason: 'invited_user_missing'
    };
  }

  const hasInvite = Boolean(row.invite_id);
  const hasLinkedIn = Boolean(row.has_linkedin);
  const isListedReady = Boolean(row.is_listed_ready);
  const isListedLive = Boolean(row.is_listed_live);
  const rewardable = hasInvite && hasLinkedIn && isListedReady;
  const reason = rewardable
    ? 'rewardable_activation'
    : (!hasInvite ? 'missing_invite_attribution' : (!hasLinkedIn ? 'linkedin_not_connected' : 'listed_ready_threshold_not_reached'));

  return {
    invitedUserId: row.invited_user_id,
    inviteId: row.invite_id || null,
    referrerUserId: row.referrer_user_id || null,
    inviteCode: row.invite_code || null,
    source: row.source || null,
    joinedAt: row.joined_at || null,
    activatedAt: row.activated_at || null,
    hasLinkedIn,
    profileId: row.profile_id || null,
    profileState: row.profile_state || null,
    visibilityStatus: row.visibility_status || null,
    isListedReady,
    isListedLive,
    rewardable,
    reason
  };
}

export async function findExistingInviteActivationRewardEvent(client, { invitedUserId }) {
  const result = await client.query(
    `
      select *
      from invite_reward_events
      where invited_user_id = $1
        and event_type = $2
      limit 1
    `,
    [invitedUserId, INVITE_REWARD_EVENT_TYPE_ACTIVATION]
  );

  return normalizeInviteRewardEventRow(result.rows[0] || null);
}

export async function createPendingInviteActivationReward(client, {
  referrerUserId,
  invitedUserId,
  inviteLinkId = null,
  inviteCode = null,
  source = null,
  activationState = null,
  activationAt = null,
  points = null,
  confirmHours = null,
  activationRuleVersion = null,
  catalogVersion = null
}) {
  const config = await getInviteRewardsConfig(client);
  const safePoints = Math.max(0, Number(points ?? config.activationPoints) || config.activationPoints);
  const safeConfirmHours = Math.max(1, Number(confirmHours ?? config.activationConfirmHours) || config.activationConfirmHours);
  const activatedAtDate = activationAt ? new Date(activationAt) : new Date();
  const activationAtIso = Number.isNaN(activatedAtDate.getTime()) ? new Date().toISOString() : activatedAtDate.toISOString();
  const confirmAfterIso = new Date(Date.parse(activationAtIso) + safeConfirmHours * 60 * 60 * 1000).toISOString();
  const meta = {
    source: source || activationState?.source || null,
    joinedAt: activationState?.joinedAt || null,
    profileState: activationState?.profileState || null,
    visibilityStatus: activationState?.visibilityStatus || null,
    activationRuleVersion: activationRuleVersion || config.activationRuleVersion,
    catalogVersion: catalogVersion || config.catalogVersion,
    rewardableReason: activationState?.reason || 'rewardable_activation'
  };

  const insertResult = await client.query(
    `
      insert into invite_reward_events (
        referrer_user_id,
        invited_user_id,
        invite_link_id,
        invite_code,
        event_type,
        status,
        points,
        activation_at,
        confirm_after,
        meta_json,
        created_at
      )
      values ($1, $2, $3, $4, $5, 'pending', $6, $7::timestamptz, $8::timestamptz, $9::jsonb, now())
      on conflict (invited_user_id, event_type)
      do nothing
      returning *
    `,
    [
      referrerUserId,
      invitedUserId,
      inviteLinkId,
      inviteCode,
      INVITE_REWARD_EVENT_TYPE_ACTIVATION,
      safePoints,
      activationAtIso,
      confirmAfterIso,
      JSON.stringify(meta)
    ]
  );

  const inserted = insertResult.rows[0] || null;
  if (!inserted) {
    const existing = await findExistingInviteActivationRewardEvent(client, { invitedUserId });
    return {
      created: false,
      duplicate: true,
      reason: 'activation_reward_already_exists',
      event: existing,
      mode: await getInviteRewardsMode(client),
      config
    };
  }

  await client.query(
    `
      insert into invite_reward_ledger (
        user_id,
        reward_event_id,
        entry_type,
        points_delta,
        balance_bucket,
        meta_json,
        created_at
      )
      values ($1, $2, 'pending_credit', $3, 'pending', $4::jsonb, now())
      on conflict do nothing
    `,
    [referrerUserId, inserted.id, safePoints, JSON.stringify(meta)]
  );

  if (inviteLinkId) {
    await client.query(
      `
        update member_invites
        set activated_at = coalesce(activated_at, $2::timestamptz),
            updated_at = now()
        where id = $1
      `,
      [inviteLinkId, activationAtIso]
    );
  }

  return {
    created: true,
    duplicate: false,
    reason: 'pending_activation_reward_created',
    event: normalizeInviteRewardEventRow(inserted),
    mode: await getInviteRewardsMode(client),
    config
  };
}

export async function getInviteRewardSummaryByUserId(client, { userId }) {
  await ensureInviteRewardsDefaults(client);
  const [summaryResult, mode, config] = await Promise.all([
    client.query(
      `
        select
          coalesce(sum(case when balance_bucket = 'pending' then points_delta else 0 end), 0)::int as pending_points,
          coalesce(sum(case when balance_bucket = 'available' then points_delta else 0 end), 0)::int as available_points,
          coalesce(sum(case when balance_bucket = 'redeemed' then abs(points_delta) else 0 end), 0)::int as redeemed_points,
          count(*) filter (where balance_bucket = 'pending' and points_delta > 0)::int as pending_entries,
          count(*) filter (where balance_bucket = 'available' and points_delta > 0)::int as available_entries,
          count(*) filter (where balance_bucket = 'redeemed')::int as redeemed_entries
        from invite_reward_ledger
        where user_id = $1
      `,
      [userId]
    ),
    getInviteRewardsMode(client),
    getInviteRewardsConfig(client)
  ]);

  const row = summaryResult.rows[0] || {};
  return {
    mode,
    config,
    availablePoints: Number(row.available_points || 0) || 0,
    pendingPoints: Number(row.pending_points || 0) || 0,
    redeemedPoints: Number(row.redeemed_points || 0) || 0,
    availableEntries: Number(row.available_entries || 0) || 0,
    pendingEntries: Number(row.pending_entries || 0) || 0,
    redeemedEntries: Number(row.redeemed_entries || 0) || 0
  };
}

export async function listInviteRewardEventsByUserId(client, { userId, limit = 5 } = {}) {
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.min(20, Number(limit)) : 5;
  const result = await client.query(
    `
      select
        ire.*,
        invited.telegram_user_id,
        invited.telegram_username,
        la.full_name as invited_linkedin_name,
        mp.display_name as invited_display_name,
        mp.headline_user as invited_headline_user
      from invite_reward_events ire
      join users invited on invited.id = ire.invited_user_id
      left join linkedin_accounts la on la.user_id = invited.id
      left join member_profiles mp on mp.user_id = invited.id
      where ire.referrer_user_id = $1
      order by ire.created_at desc, ire.id desc
      limit $2
    `,
    [userId, safeLimit]
  );

  return (result.rows || []).map((row) => ({
    ...normalizeInviteRewardEventRow(row),
    invitedDisplayName: buildMemberLabel({
      display_name: row.invited_display_name,
      linkedin_name: row.invited_linkedin_name,
      telegram_username: row.telegram_username,
      telegram_user_id: row.telegram_user_id
    }),
    invitedHeadlineUser: row.invited_headline_user || null
  }));
}

export async function listPendingInviteRewardConfirmationCandidates(client, { limit = 50, nowTs = null } = {}) {
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.min(200, Number(limit)) : 50;
  const effectiveNow = nowTs ? new Date(nowTs).toISOString() : new Date().toISOString();
  const result = await client.query(
    `
      select
        ire.*,
        inv.source,
        inv.joined_at
      from invite_reward_events ire
      left join member_invites inv on inv.id = ire.invite_link_id
      where ire.status = 'pending'
        and ire.confirm_after <= $1::timestamptz
      order by ire.confirm_after asc, ire.id asc
      limit $2
    `,
    [effectiveNow, safeLimit]
  );

  return (result.rows || []).map((row) => ({
    ...normalizeInviteRewardEventRow(row),
    source: row.source || null,
    joinedAt: row.joined_at || null
  }));
}

export async function getSpendableInviteRewardBalance(client, { userId }) {
  const result = await client.query(
    `
      select coalesce(sum(points_delta), 0)::int as available_points
      from invite_reward_ledger
      where user_id = $1
        and balance_bucket = 'available'
    `,
    [userId]
  );

  return Number(result.rows[0]?.available_points || 0) || 0;
}

export async function getInviteRewardEventById(client, { rewardEventId, forUpdate = false } = {}) {
  const result = await client.query(
    `
      select *
      from invite_reward_events
      where id = $1
      limit 1
      ${forUpdate ? 'for update' : ''}
    `,
    [rewardEventId]
  );

  return normalizeInviteRewardEventRow(result.rows[0] || null);
}

export async function markInviteRewardPendingReversed(client, { userId, rewardEventId, points, meta = null } = {}) {
  const result = await client.query(
    `
      insert into invite_reward_ledger (
        user_id,
        reward_event_id,
        entry_type,
        points_delta,
        balance_bucket,
        meta_json,
        created_at
      )
      values ($1, $2, 'pending_reversal', $3, 'pending', $4::jsonb, now())
      on conflict (reward_event_id, entry_type)
      do nothing
      returning *
    `,
    [userId, rewardEventId, -Math.abs(Number(points || 0) || 0), JSON.stringify(meta || {})]
  );

  return result.rows[0] || null;
}

async function createInviteRewardAvailableCredit(client, { userId, rewardEventId, points, meta = null } = {}) {
  const result = await client.query(
    `
      insert into invite_reward_ledger (
        user_id,
        reward_event_id,
        entry_type,
        points_delta,
        balance_bucket,
        meta_json,
        created_at
      )
      values ($1, $2, 'available_credit', $3, 'available', $4::jsonb, now())
      on conflict (reward_event_id, entry_type)
      do nothing
      returning *
    `,
    [userId, rewardEventId, Math.abs(Number(points || 0) || 0), JSON.stringify(meta || {})]
  );

  return result.rows[0] || null;
}

export async function createInviteRewardSettlementRun(client, { modeSnapshot, meta = null } = {}) {
  const runId = buildInviteRewardSettlementRunId();
  const result = await client.query(
    `
      insert into invite_reward_settlement_runs (
        run_id,
        mode_snapshot,
        status,
        processed_count,
        confirmed_count,
        rejected_count,
        skipped_count,
        error_count,
        started_at,
        meta_json
      )
      values ($1, $2, 'running', 0, 0, 0, 0, 0, now(), $3::jsonb)
      returning *
    `,
    [runId, normalizeInviteRewardsMode(modeSnapshot), JSON.stringify(meta || {})]
  );

  return normalizeInviteRewardSettlementRunRow(result.rows[0] || null);
}

export async function finalizeInviteRewardSettlementRun(client, {
  runId,
  status = 'completed',
  processedCount = 0,
  confirmedCount = 0,
  rejectedCount = 0,
  skippedCount = 0,
  errorCount = 0,
  meta = null
} = {}) {
  const result = await client.query(
    `
      update invite_reward_settlement_runs
      set
        status = $2,
        processed_count = $3,
        confirmed_count = $4,
        rejected_count = $5,
        skipped_count = $6,
        error_count = $7,
        finished_at = now(),
        meta_json = coalesce(meta_json, '{}'::jsonb) || $8::jsonb
      where run_id = $1
      returning *
    `,
    [runId, status, processedCount, confirmedCount, rejectedCount, skippedCount, errorCount, JSON.stringify(meta || {})]
  );

  return normalizeInviteRewardSettlementRunRow(result.rows[0] || null);
}

export async function getInviteRewardSettlementRunByRunId(client, { runId } = {}) {
  const result = await client.query(
    `
      select *
      from invite_reward_settlement_runs
      where run_id = $1
      limit 1
    `,
    [runId]
  );

  return normalizeInviteRewardSettlementRunRow(result.rows[0] || null);
}

export async function getLastInviteRewardSettlementRun(client) {
  const result = await client.query(
    `
      select *
      from invite_reward_settlement_runs
      order by started_at desc, id desc
      limit 1
    `
  );

  return normalizeInviteRewardSettlementRunRow(result.rows[0] || null);
}

export async function confirmInviteRewardEventToAvailable(client, { rewardEventId, settlementRunId = null, meta = null } = {}) {
  const current = await getInviteRewardEventById(client, { rewardEventId, forUpdate: true });
  if (!current) {
    return { changed: false, reason: 'reward_event_not_found', event: null };
  }
  if (current.status !== 'pending') {
    return { changed: false, duplicate: true, reason: `reward_event_already_${current.status}`, event: current };
  }

  const settlementMeta = {
    settlementStage: 'confirm',
    settlementRunId,
    ...(meta || {})
  };

  await markInviteRewardPendingReversed(client, {
    userId: current.referrerUserId,
    rewardEventId,
    points: current.points,
    meta: settlementMeta
  });
  await createInviteRewardAvailableCredit(client, {
    userId: current.referrerUserId,
    rewardEventId,
    points: current.points,
    meta: settlementMeta
  });

  const updated = await client.query(
    `
      update invite_reward_events
      set
        status = 'available',
        confirmed_at = coalesce(confirmed_at, now()),
        settled_at = coalesce(settled_at, now()),
        settlement_run_id = coalesce($2, settlement_run_id),
        state_version = coalesce(state_version, 1) + 1,
        meta_json = coalesce(meta_json, '{}'::jsonb) || $3::jsonb
      where id = $1
      returning *
    `,
    [rewardEventId, settlementRunId, JSON.stringify(settlementMeta)]
  );

  return {
    changed: true,
    reason: 'reward_event_confirmed_to_available',
    event: normalizeInviteRewardEventRow(updated.rows[0] || null)
  };
}

export async function rejectInviteRewardEvent(client, { rewardEventId, rejectReason = 'settlement_rejected', settlementRunId = null, meta = null } = {}) {
  const current = await getInviteRewardEventById(client, { rewardEventId, forUpdate: true });
  if (!current) {
    return { changed: false, reason: 'reward_event_not_found', event: null };
  }
  if (current.status !== 'pending') {
    return { changed: false, duplicate: true, reason: `reward_event_already_${current.status}`, event: current };
  }

  const settlementMeta = {
    settlementStage: 'reject',
    settlementRunId,
    rejectReason,
    ...(meta || {})
  };

  await markInviteRewardPendingReversed(client, {
    userId: current.referrerUserId,
    rewardEventId,
    points: current.points,
    meta: settlementMeta
  });

  const updated = await client.query(
    `
      update invite_reward_events
      set
        status = 'rejected',
        rejected_at = coalesce(rejected_at, now()),
        reject_reason = coalesce($2, reject_reason),
        settled_at = coalesce(settled_at, now()),
        settlement_run_id = coalesce($3, settlement_run_id),
        state_version = coalesce(state_version, 1) + 1,
        meta_json = coalesce(meta_json, '{}'::jsonb) || $4::jsonb
      where id = $1
      returning *
    `,
    [rewardEventId, rejectReason, settlementRunId, JSON.stringify(settlementMeta)]
  );

  return {
    changed: true,
    reason: 'reward_event_rejected',
    event: normalizeInviteRewardEventRow(updated.rows[0] || null)
  };
}

export async function listInviteRewardLedgerMismatches(client, { limit = 20 } = {}) {
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.min(100, Number(limit)) : 20;
  const result = await client.query(
    `
      with mismatches as (
        select 'pending_missing_pending_credit'::text as warning_type, ire.*
        from invite_reward_events ire
        where ire.status = 'pending'
          and not exists (
            select 1 from invite_reward_ledger irl
            where irl.reward_event_id = ire.id
              and irl.entry_type = 'pending_credit'
              and irl.balance_bucket = 'pending'
              and irl.points_delta > 0
          )
        union all
        select 'available_missing_pending_reversal'::text as warning_type, ire.*
        from invite_reward_events ire
        where ire.status = 'available'
          and not exists (
            select 1 from invite_reward_ledger irl
            where irl.reward_event_id = ire.id
              and irl.entry_type = 'pending_reversal'
              and irl.balance_bucket = 'pending'
              and irl.points_delta < 0
          )
        union all
        select 'available_missing_available_credit'::text as warning_type, ire.*
        from invite_reward_events ire
        where ire.status = 'available'
          and not exists (
            select 1 from invite_reward_ledger irl
            where irl.reward_event_id = ire.id
              and irl.entry_type = 'available_credit'
              and irl.balance_bucket = 'available'
              and irl.points_delta > 0
          )
        union all
        select 'rejected_missing_pending_reversal'::text as warning_type, ire.*
        from invite_reward_events ire
        where ire.status = 'rejected'
          and not exists (
            select 1 from invite_reward_ledger irl
            where irl.reward_event_id = ire.id
              and irl.entry_type = 'pending_reversal'
              and irl.balance_bucket = 'pending'
              and irl.points_delta < 0
          )
      )
      select
        m.warning_type,
        m.*, 
        ref.telegram_user_id as referrer_telegram_user_id,
        ref.telegram_username as referrer_telegram_username,
        la_ref.full_name as referrer_linkedin_name,
        mp_ref.display_name as referrer_display_name,
        invited.telegram_user_id as invited_telegram_user_id,
        invited.telegram_username as invited_telegram_username,
        la_inv.full_name as invited_linkedin_name,
        mp_inv.display_name as invited_display_name
      from mismatches m
      join users ref on ref.id = m.referrer_user_id
      join users invited on invited.id = m.invited_user_id
      left join linkedin_accounts la_ref on la_ref.user_id = ref.id
      left join member_profiles mp_ref on mp_ref.user_id = ref.id
      left join linkedin_accounts la_inv on la_inv.user_id = invited.id
      left join member_profiles mp_inv on mp_inv.user_id = invited.id
      order by m.created_at desc, m.id desc
      limit $1
    `,
    [safeLimit]
  );

  return (result.rows || []).map((row) => ({
    warningType: row.warning_type,
    ...normalizeInviteRewardEventRow(row),
    referrerDisplayName: buildMemberLabel({
      display_name: row.referrer_display_name,
      linkedin_name: row.referrer_linkedin_name,
      telegram_username: row.referrer_telegram_username,
      telegram_user_id: row.referrer_telegram_user_id
    }),
    invitedDisplayName: buildMemberLabel({
      display_name: row.invited_display_name,
      linkedin_name: row.invited_linkedin_name,
      telegram_username: row.invited_telegram_username,
      telegram_user_id: row.invited_telegram_user_id
    })
  }));
}

export async function getInviteRewardReconciliationSnapshot(client, { sampleLimit = 5 } = {}) {
  const [warningsResult, redemptionResult, sampleWarnings] = await Promise.all([
    client.query(
      `
        select
          count(*) filter (
            where ire.status = 'pending'
              and not exists (
                select 1 from invite_reward_ledger irl
                where irl.reward_event_id = ire.id
                  and irl.entry_type = 'pending_credit'
                  and irl.balance_bucket = 'pending'
                  and irl.points_delta > 0
              )
          )::int as pending_missing_pending_credit,
          count(*) filter (
            where ire.status = 'available'
              and not exists (
                select 1 from invite_reward_ledger irl
                where irl.reward_event_id = ire.id
                  and irl.entry_type = 'pending_reversal'
                  and irl.balance_bucket = 'pending'
                  and irl.points_delta < 0
              )
          )::int as available_missing_pending_reversal,
          count(*) filter (
            where ire.status = 'available'
              and not exists (
                select 1 from invite_reward_ledger irl
                where irl.reward_event_id = ire.id
                  and irl.entry_type = 'available_credit'
                  and irl.balance_bucket = 'available'
                  and irl.points_delta > 0
              )
          )::int as available_missing_available_credit,
          count(*) filter (
            where ire.status = 'rejected'
              and not exists (
                select 1 from invite_reward_ledger irl
                where irl.reward_event_id = ire.id
                  and irl.entry_type = 'pending_reversal'
                  and irl.balance_bucket = 'pending'
                  and irl.points_delta < 0
              )
          )::int as rejected_missing_pending_reversal
        from invite_reward_events ire
      `
    ),
    client.query(
      `
        select
          count(*) filter (where status = 'completed')::int as completed_redemptions,
          count(*) filter (where status = 'completed' and subscription_id is null)::int as completed_missing_subscription,
          count(*) filter (where status = 'completed' and reward_ledger_entry_id is null)::int as completed_missing_ledger
        from invite_reward_redemptions
      `
    ),
    listInviteRewardLedgerMismatches(client, { limit: sampleLimit })
  ]);

  const warnings = warningsResult.rows[0] || {};
  const redemptions = redemptionResult.rows[0] || {};
  const warningCount = Object.values(warnings).reduce((sum, value) => sum + (Number(value || 0) || 0), 0)
    + (Number(redemptions.completed_missing_subscription || 0) || 0)
    + (Number(redemptions.completed_missing_ledger || 0) || 0);

  return {
    warningCount,
    warnings: {
      pendingMissingPendingCredit: Number(warnings.pending_missing_pending_credit || 0) || 0,
      availableMissingPendingReversal: Number(warnings.available_missing_pending_reversal || 0) || 0,
      availableMissingAvailableCredit: Number(warnings.available_missing_available_credit || 0) || 0,
      rejectedMissingPendingReversal: Number(warnings.rejected_missing_pending_reversal || 0) || 0,
      completedRedemptionsMissingSubscription: Number(redemptions.completed_missing_subscription || 0) || 0,
      completedRedemptionsMissingLedger: Number(redemptions.completed_missing_ledger || 0) || 0
    },
    completedRedemptions: Number(redemptions.completed_redemptions || 0) || 0,
    sampleWarnings
  };
}

export async function createInviteRewardRedemptionRequest(client, { userId, catalogCode, pointsCost, proDays, meta = null } = {}) {
  const result = await client.query(
    `
      insert into invite_reward_redemptions (
        user_id,
        catalog_code,
        points_cost,
        pro_days,
        status,
        meta_json,
        requested_at,
        created_at
      )
      values ($1, $2, $3, $4, 'requested', $5::jsonb, now(), now())
      returning *
    `,
    [userId, String(catalogCode || '').trim().toLowerCase(), Number(pointsCost || 0) || 0, Number(proDays || 0) || 0, JSON.stringify(meta || {})]
  );

  return normalizeInviteRewardRedemptionRow(result.rows[0] || null);
}

export async function getInviteRewardRedemptionById(client, { redemptionId, userId = null, forUpdate = false } = {}) {
  const params = [redemptionId];
  const clauses = ['id = $1'];
  if (userId) {
    params.push(userId);
    clauses.push(`user_id = $${params.length}`);
  }
  const result = await client.query(
    `
      select *
      from invite_reward_redemptions
      where ${clauses.join(' and ')}
      limit 1
      ${forUpdate ? 'for update' : ''}
    `,
    params
  );

  return normalizeInviteRewardRedemptionRow(result.rows[0] || null);
}

export async function createRedeemDebitLedgerEntry(client, { userId, rewardEventId = null, pointsCost, meta = null } = {}) {
  const result = await client.query(
    `
      insert into invite_reward_ledger (
        user_id,
        reward_event_id,
        entry_type,
        points_delta,
        balance_bucket,
        meta_json,
        created_at
      )
      values ($1, $2, 'redeem_debit', $3, 'redeemed', $4::jsonb, now())
      returning *
    `,
    [userId, rewardEventId, -Math.abs(Number(pointsCost || 0) || 0), JSON.stringify(meta || {})]
  );

  return result.rows[0] || null;
}

export async function completeInviteRewardRedemption(client, { redemptionId, rewardLedgerEntryId = null, rewardEventId = null, subscriptionId = null, receiptId = null, meta = null } = {}) {
  const result = await client.query(
    `
      update invite_reward_redemptions
      set
        status = 'completed',
        reward_ledger_entry_id = coalesce($2, reward_ledger_entry_id),
        reward_event_id = coalesce($3, reward_event_id),
        subscription_id = coalesce($4, subscription_id),
        receipt_id = coalesce($5, receipt_id),
        completed_at = now(),
        failed_at = null,
        failure_reason = null,
        meta_json = coalesce(meta_json, '{}'::jsonb) || $6::jsonb
      where id = $1
      returning *
    `,
    [redemptionId, rewardLedgerEntryId, rewardEventId, subscriptionId, receiptId, JSON.stringify(meta || {})]
  );

  return normalizeInviteRewardRedemptionRow(result.rows[0] || null);
}

export async function failInviteRewardRedemption(client, { redemptionId, failureReason = null, meta = null } = {}) {
  const result = await client.query(
    `
      update invite_reward_redemptions
      set
        status = 'failed',
        failed_at = now(),
        failure_reason = $2,
        meta_json = coalesce(meta_json, '{}'::jsonb) || $3::jsonb
      where id = $1
      returning *
    `,
    [redemptionId, failureReason, JSON.stringify(meta || {})]
  );

  return normalizeInviteRewardRedemptionRow(result.rows[0] || null);
}

export async function getAdminInviteRewardsSnapshot(client, { topLimit = 5, recentLimit = 5 } = {}) {
  await ensureInviteRewardsDefaults(client);
  const safeTopLimit = Number.isFinite(Number(topLimit)) && Number(topLimit) > 0 ? Math.min(20, Number(topLimit)) : 5;
  const safeRecentLimit = Number.isFinite(Number(recentLimit)) && Number(recentLimit) > 0 ? Math.min(20, Number(recentLimit)) : 5;

  const [mode, config, totalsResult, topResult, recentResult, dueResult, lastSettlementRun, reconciliation] = await Promise.all([
    getInviteRewardsMode(client),
    getInviteRewardsConfig(client),
    client.query(
      `
        select
          coalesce(sum(case when balance_bucket = 'pending' then points_delta else 0 end), 0)::int as pending_points,
          coalesce(sum(case when balance_bucket = 'available' then points_delta else 0 end), 0)::int as available_points,
          coalesce(sum(case when balance_bucket = 'redeemed' then abs(points_delta) else 0 end), 0)::int as redeemed_points,
          count(*) filter (where balance_bucket = 'pending' and points_delta > 0)::int as pending_entries,
          count(*) filter (where balance_bucket = 'available' and points_delta > 0)::int as available_entries,
          count(*) filter (where balance_bucket = 'redeemed')::int as redeemed_entries,
          count(*) filter (where entry_type = 'pending_credit')::int as total_reward_events
        from invite_reward_ledger
      `
    ),
    client.query(
      `
        select
          ire.referrer_user_id,
          ref.telegram_user_id as referrer_telegram_user_id,
          ref.telegram_username as referrer_telegram_username,
          la_ref.full_name as referrer_linkedin_name,
          mp_ref.display_name as referrer_display_name,
          coalesce(sum(case when irl.balance_bucket in ('pending', 'available') then irl.points_delta else 0 end), 0)::int as total_points,
          coalesce(sum(case when irl.balance_bucket = 'pending' then irl.points_delta else 0 end), 0)::int as pending_points,
          coalesce(sum(case when irl.balance_bucket = 'available' then irl.points_delta else 0 end), 0)::int as available_points,
          count(*) filter (where irl.entry_type = 'pending_credit')::int as reward_events
        from invite_reward_ledger irl
        join invite_reward_events ire on ire.id = irl.reward_event_id
        join users ref on ref.id = ire.referrer_user_id
        left join linkedin_accounts la_ref on la_ref.user_id = ref.id
        left join member_profiles mp_ref on mp_ref.user_id = ref.id
        where irl.points_delta > 0
        group by ire.referrer_user_id, ref.telegram_user_id, ref.telegram_username, la_ref.full_name, mp_ref.display_name
        order by total_points desc, available_points desc, pending_points desc, ire.referrer_user_id asc
        limit $1
      `,
      [safeTopLimit]
    ),
    client.query(
      `
        select
          ire.*,
          ref.telegram_user_id as referrer_telegram_user_id,
          ref.telegram_username as referrer_telegram_username,
          la_ref.full_name as referrer_linkedin_name,
          mp_ref.display_name as referrer_display_name,
          invited.telegram_user_id as invited_telegram_user_id,
          invited.telegram_username as invited_telegram_username,
          la_inv.full_name as invited_linkedin_name,
          mp_inv.display_name as invited_display_name
        from invite_reward_events ire
        join users ref on ref.id = ire.referrer_user_id
        join users invited on invited.id = ire.invited_user_id
        left join linkedin_accounts la_ref on la_ref.user_id = ref.id
        left join member_profiles mp_ref on mp_ref.user_id = ref.id
        left join linkedin_accounts la_inv on la_inv.user_id = invited.id
        left join member_profiles mp_inv on mp_inv.user_id = invited.id
        order by ire.created_at desc, ire.id desc
        limit $1
      `,
      [safeRecentLimit]
    ),
    client.query(
      `
        select
          count(*) filter (where status = 'pending')::int as pending_candidates,
          count(*) filter (where status = 'pending' and confirm_after <= now())::int as pending_due,
          count(*) filter (where status = 'available' and confirmed_at >= date_trunc('day', now()))::int as confirmed_today,
          count(*) filter (where status = 'rejected' and rejected_at >= date_trunc('day', now()))::int as rejected_today
        from invite_reward_events
      `
    ),
    getLastInviteRewardSettlementRun(client),
    getInviteRewardReconciliationSnapshot(client, { sampleLimit: 5 })
  ]);

  const totals = totalsResult.rows[0] || {};
  const dueRow = dueResult.rows[0] || {};

  return {
    mode,
    config,
    totals: {
      pendingPoints: Number(totals.pending_points || 0) || 0,
      availablePoints: Number(totals.available_points || 0) || 0,
      redeemedPoints: Number(totals.redeemed_points || 0) || 0,
      pendingEntries: Number(totals.pending_entries || 0) || 0,
      availableEntries: Number(totals.available_entries || 0) || 0,
      redeemedEntries: Number(totals.redeemed_entries || 0) || 0,
      totalRewardEvents: Number(totals.total_reward_events || 0) || 0,
      pendingCandidates: Number(dueRow.pending_candidates || 0) || 0,
      pendingDue: Number(dueRow.pending_due || 0) || 0,
      confirmedToday: Number(dueRow.confirmed_today || 0) || 0,
      rejectedToday: Number(dueRow.rejected_today || 0) || 0
    },
    topRewardInviters: (topResult.rows || []).map((row) => ({
      referrerUserId: row.referrer_user_id,
      displayName: buildMemberLabel({
        display_name: row.referrer_display_name,
        linkedin_name: row.referrer_linkedin_name,
        telegram_username: row.referrer_telegram_username,
        telegram_user_id: row.referrer_telegram_user_id
      }),
      totalPoints: Number(row.total_points || 0) || 0,
      pendingPoints: Number(row.pending_points || 0) || 0,
      availablePoints: Number(row.available_points || 0) || 0,
      rewardEvents: Number(row.reward_events || 0) || 0
    })),
    recentRewardEvents: (recentResult.rows || []).map((row) => ({
      ...normalizeInviteRewardEventRow(row),
      referrerDisplayName: buildMemberLabel({
        display_name: row.referrer_display_name,
        linkedin_name: row.referrer_linkedin_name,
        telegram_username: row.referrer_telegram_username,
        telegram_user_id: row.referrer_telegram_user_id
      }),
      invitedDisplayName: buildMemberLabel({
        display_name: row.invited_display_name,
        linkedin_name: row.invited_linkedin_name,
        telegram_username: row.invited_telegram_username,
        telegram_user_id: row.invited_telegram_user_id
      })
    })),
    lastSettlementRun,
    reconciliation,
    modeAudit: await getRecentInviteRewardsModeAudit(client, { limit: 5 })
  };
}
