import { getProfileSnapshotByUserId, hideProfileListingByUserId, unhideProfileListingByUserId } from './profileRepo.js';
import { upsertTelegramUser } from './usersRepo.js';

export const ADMIN_USER_SEGMENTS = {
  all: { key: 'all', label: 'All' },
  conn: { key: 'conn', label: 'Connected' },
  noprof: { key: 'noprof', label: 'Connected, no profile' },
  inc: { key: 'inc', label: 'Incomplete' },
  noskills: { key: 'noskills', label: 'Ready, no skills' },
  ready: { key: 'ready', label: 'Ready not listed' },
  listd: { key: 'listd', label: 'Listed' },
  listact: { key: 'listact', label: 'Listed active' },
  listinact: { key: 'listinact', label: 'Listed inactive' },
  nointro: { key: 'nointro', label: 'No intros yet' },
  pend: { key: 'pend', label: 'Pending intros' },
  relink: { key: 'relink', label: 'Recent relinks' }
};

export function normalizeAdminUserSegment(segmentKey) {
  const normalized = typeof segmentKey === 'string' ? segmentKey.trim().toLowerCase() : 'all';
  return ADMIN_USER_SEGMENTS[normalized] ? normalized : 'all';
}

function buildSegmentWhereClause(segmentKey) {
  switch (normalizeAdminUserSegment(segmentKey)) {
    case 'conn':
      return 'has_linkedin';
    case 'noprof':
      return 'has_linkedin and profile_id is null';
    case 'inc':
      return "profile_state is distinct from 'active'";
    case 'noskills':
      return "profile_state = 'active' and coalesce(skills_count, 0) = 0";
    case 'ready':
      return "profile_state = 'active' and coalesce(visibility_status, 'hidden') = 'hidden'";
    case 'listd':
      return "profile_state = 'active' and visibility_status = 'listed'";
    case 'listact':
      return "profile_state = 'active' and visibility_status = 'listed' and last_seen_at >= now() - interval '14 days'";
    case 'listinact':
      return "profile_state = 'active' and visibility_status = 'listed' and (last_seen_at is null or last_seen_at < now() - interval '14 days')";
    case 'nointro':
      return 'has_linkedin and intro_sent_count = 0 and intro_received_count = 0';
    case 'pend':
      return 'pending_intro_count > 0';
    case 'relink':
      return "user_id in (select distinct coalesce(target_user_id, secondary_target_user_id, actor_user_id) from admin_audit_events where event_type = 'linkedin_relink_transferred')";
    case 'all':
    default:
      return 'true';
  }
}

function buildUsersBaseCte() {
  return `
    with user_base as (
      select
        u.id as user_id,
        u.telegram_user_id,
        u.telegram_username,
        u.first_seen_at,
        u.last_seen_at,
        la.id is not null as has_linkedin,
        la.full_name as linkedin_name,
        la.email as linkedin_email,
        mp.id as profile_id,
        mp.display_name,
        mp.headline_user,
        mp.company_user,
        mp.linkedin_public_url,
        mp.visibility_status,
        mp.profile_state,
        coalesce(sk.skills_count, 0)::int as skills_count,
        coalesce(intro.sent_count, 0)::int as intro_sent_count,
        coalesce(intro.received_count, 0)::int as intro_received_count,
        coalesce(intro.pending_count, 0)::int as pending_intro_count,
        note.note_text,
        note.updated_at as note_updated_at
      from users u
      left join linkedin_accounts la on la.user_id = u.id
      left join member_profiles mp on mp.user_id = u.id
      left join lateral (
        select count(*)::int as skills_count
        from member_profile_skills mps
        where mps.profile_id = mp.id
      ) sk on true
      left join lateral (
        select
          count(*) filter (where ir.requester_user_id = u.id)::int as sent_count,
          count(*) filter (where ir.target_user_id = u.id)::int as received_count,
          count(*) filter (where ir.status = 'pending' and (ir.requester_user_id = u.id or ir.target_user_id = u.id))::int as pending_count
        from intro_requests ir
        where ir.requester_user_id = u.id or ir.target_user_id = u.id
      ) intro on true
      left join admin_user_notes note on note.user_id = u.id
    )
  `;
}

export async function listAdminUsersPage(client, { segmentKey = 'all', page = 0, pageSize = 8 } = {}) {
  const segment = normalizeAdminUserSegment(segmentKey);
  const normalizedPage = Number.isFinite(page) && page >= 0 ? page : 0;
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 20) : 8;
  const whereClause = buildSegmentWhereClause(segment);

  const countsResult = await client.query(
    `${buildUsersBaseCte()}
     select
       count(*)::int as total_users,
       count(*) filter (where has_linkedin)::int as connected_count,
       count(*) filter (where not has_linkedin)::int as not_connected_count,
       count(*) filter (where profile_state is distinct from 'active')::int as incomplete_count,
       count(*) filter (where profile_state = 'active' and coalesce(visibility_status, 'hidden') = 'hidden')::int as ready_not_listed_count,
       count(*) filter (where profile_state = 'active' and visibility_status = 'listed')::int as listed_count,
       count(*) filter (where profile_state = 'active' and visibility_status = 'listed' and last_seen_at >= now() - interval '14 days')::int as listed_active_count,
       count(*) filter (where profile_state = 'active' and visibility_status = 'listed' and (last_seen_at is null or last_seen_at < now() - interval '14 days'))::int as listed_inactive_count,
       count(*) filter (where has_linkedin and profile_id is null)::int as connected_no_profile_count,
       count(*) filter (where profile_state = 'active' and coalesce(skills_count, 0) = 0)::int as ready_no_skills_count,
       count(*) filter (where has_linkedin and coalesce(intro_sent_count, 0) = 0 and coalesce(intro_received_count, 0) = 0)::int as no_intro_yet_count,
       count(*) filter (where pending_intro_count > 0)::int as pending_intro_count,
       count(*) filter (where user_id in (select distinct coalesce(target_user_id, secondary_target_user_id, actor_user_id) from admin_audit_events where event_type = 'linkedin_relink_transferred'))::int as relink_count
     from user_base`
  );

  const totalCounts = countsResult.rows[0] || {};

  const pageCountResult = await client.query(
    `${buildUsersBaseCte()}
     select count(*)::int as total_count
     from user_base
     where ${whereClause}`
  );

  const totalCount = pageCountResult.rows[0]?.total_count || 0;
  const offset = normalizedPage * normalizedPageSize;

  const listResult = await client.query(
    `${buildUsersBaseCte()}
     select *
     from user_base
     where ${whereClause}
     order by last_seen_at desc, user_id desc
     limit $1 offset $2`,
    [normalizedPageSize + 1, offset]
  );

  const rows = (listResult.rows || []).slice(0, normalizedPageSize);
  return {
    segmentKey: segment,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalCount,
    hasPrev: normalizedPage > 0,
    hasNext: offset + normalizedPageSize < totalCount,
    counts: {
      totalUsers: totalCounts.total_users || 0,
      connected: totalCounts.connected_count || 0,
      notConnected: totalCounts.not_connected_count || 0,
      incomplete: totalCounts.incomplete_count || 0,
      readyNotListed: totalCounts.ready_not_listed_count || 0,
      listed: totalCounts.listed_count || 0,
      listedActive: totalCounts.listed_active_count || 0,
      listedInactive: totalCounts.listed_inactive_count || 0,
      connectedNoProfile: totalCounts.connected_no_profile_count || 0,
      readyNoSkills: totalCounts.ready_no_skills_count || 0,
      noIntroYet: totalCounts.no_intro_yet_count || 0,
      pendingIntros: totalCounts.pending_intro_count || 0,
      relinks: totalCounts.relink_count || 0
    },
    users: rows.map((row) => ({
      userId: row.user_id,
      telegramUserId: row.telegram_user_id,
      telegramUsername: row.telegram_username,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
      hasLinkedIn: Boolean(row.has_linkedin),
      linkedinName: row.linkedin_name,
      linkedinEmail: row.linkedin_email,
      profileId: row.profile_id,
      displayName: row.display_name,
      headlineUser: row.headline_user,
      linkedinPublicUrl: row.linkedin_public_url,
      visibilityStatus: row.visibility_status,
      profileState: row.profile_state,
      skillsCount: row.skills_count || 0,
      introSentCount: row.intro_sent_count || 0,
      introReceivedCount: row.intro_received_count || 0,
      pendingIntroCount: row.pending_intro_count || 0,
      hasNote: typeof row.note_text === 'string' && row.note_text.trim().length > 0
    }))
  };
}

async function loadUserCardMetrics(client, targetUserId) {
  const result = await client.query(
    `
      select
        u.first_seen_at,
        u.last_seen_at,
        note.note_text,
        note.updated_at as note_updated_at,
        updater.telegram_user_id as note_updated_by_telegram_user_id,
        updater.telegram_username as note_updated_by_telegram_username,
        coalesce(intro.sent_count, 0)::int as intro_sent_count,
        coalesce(intro.received_count, 0)::int as intro_received_count,
        coalesce(intro.pending_count, 0)::int as pending_intro_count
      from users u
      left join admin_user_notes note on note.user_id = u.id
      left join users updater on updater.id = note.updated_by_user_id
      left join lateral (
        select
          count(*) filter (where ir.requester_user_id = u.id)::int as sent_count,
          count(*) filter (where ir.target_user_id = u.id)::int as received_count,
          count(*) filter (where ir.status = 'pending' and (ir.requester_user_id = u.id or ir.target_user_id = u.id))::int as pending_count
        from intro_requests ir
        where ir.requester_user_id = u.id or ir.target_user_id = u.id
      ) intro on true
      where u.id = $1
      limit 1
    `,
    [targetUserId]
  );

  return result.rows[0] || null;
}

export async function getAdminUserCardById(client, { targetUserId }) {
  const profileSnapshot = await getProfileSnapshotByUserId(client, targetUserId);
  if (!profileSnapshot) {
    return null;
  }

  const metrics = await loadUserCardMetrics(client, targetUserId);
  return {
    ...profileSnapshot,
    first_seen_at: metrics?.first_seen_at || null,
    last_seen_at: metrics?.last_seen_at || null,
    intro_sent_count: metrics?.intro_sent_count || 0,
    intro_received_count: metrics?.intro_received_count || 0,
    pending_intro_count: metrics?.pending_intro_count || 0,
    operator_note_text: metrics?.note_text || null,
    operator_note_updated_at: metrics?.note_updated_at || null,
    operator_note_updated_by_telegram_user_id: metrics?.note_updated_by_telegram_user_id || null,
    operator_note_updated_by_telegram_username: metrics?.note_updated_by_telegram_username || null
  };
}

export async function setAdminUserListingVisibility(client, { targetUserId, nextVisibility, actorUserId = null }) {
  const before = await getProfileSnapshotByUserId(client, targetUserId);
  if (!before?.profile_id) {
    return {
      changed: false,
      blocked: true,
      reason: 'profile_missing',
      profile: before
    };
  }

  let profile;
  if (nextVisibility === 'hidden') {
    profile = await hideProfileListingByUserId(client, targetUserId);
  } else if (nextVisibility === 'listed') {
    if (before.profile_state !== 'active') {
      return {
        changed: false,
        blocked: true,
        reason: 'profile_not_ready_for_listing',
        profile: before
      };
    }
    profile = await unhideProfileListingByUserId(client, targetUserId);
  } else {
    throw new Error(`Unsupported visibility target: ${nextVisibility}`);
  }

  const changed = before?.visibility_status !== profile?.visibility_status;
  if (changed) {
    await createAdminAuditEvent(client, {
      eventType: nextVisibility === 'hidden' ? 'admin_listing_hidden' : 'admin_listing_unhidden',
      actorUserId,
      targetUserId,
      summary: nextVisibility === 'hidden' ? 'Listing hidden from the directory.' : 'Listing made visible in the directory.',
      detail: {
        previousVisibilityStatus: before?.visibility_status || null,
        nextVisibilityStatus: profile?.visibility_status || null,
        profileState: profile?.profile_state || before?.profile_state || null
      }
    });
  }

  return {
    changed,
    blocked: false,
    reason: changed ? 'visibility_updated' : 'visibility_unchanged',
    profile
  };
}

export async function beginAdminUserNoteSession(client, {
  operatorTelegramUserId,
  targetUserId,
  segmentKey = 'all',
  page = 0
}) {
  const normalizedSegmentKey = normalizeAdminUserSegment(segmentKey);
  const normalizedPage = Number.isFinite(page) && page >= 0 ? page : 0;

  const target = await client.query(
    `select id from users where id = $1 limit 1`,
    [targetUserId]
  );
  if (!target.rows[0]) {
    throw new Error('Admin target user not found');
  }

  await client.query(
    `
      insert into admin_user_note_sessions (
        operator_telegram_user_id,
        target_user_id,
        segment_key,
        page,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, now(), now())
      on conflict (operator_telegram_user_id)
      do update set
        target_user_id = excluded.target_user_id,
        segment_key = excluded.segment_key,
        page = excluded.page,
        updated_at = now()
    `,
    [operatorTelegramUserId, targetUserId, normalizedSegmentKey, normalizedPage]
  );

  return {
    operatorTelegramUserId,
    targetUserId,
    segmentKey: normalizedSegmentKey,
    page: normalizedPage
  };
}

export async function getAdminUserNoteSessionByTelegramUserId(client, operatorTelegramUserId) {
  const result = await client.query(
    `
      select operator_telegram_user_id, target_user_id, segment_key, page, created_at, updated_at
      from admin_user_note_sessions
      where operator_telegram_user_id = $1
      limit 1
    `,
    [operatorTelegramUserId]
  );

  const row = result.rows[0] || null;
  if (!row) {
    return null;
  }

  return {
    operatorTelegramUserId: row.operator_telegram_user_id,
    targetUserId: row.target_user_id,
    segmentKey: normalizeAdminUserSegment(row.segment_key),
    page: row.page || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function cancelAdminUserNoteSession(client, operatorTelegramUserId) {
  await client.query(
    `delete from admin_user_note_sessions where operator_telegram_user_id = $1`,
    [operatorTelegramUserId]
  );
}

export async function saveAdminUserNoteFromSession(client, {
  operatorTelegramUserId,
  operatorTelegramUsername = null,
  noteText
}) {
  const session = await getAdminUserNoteSessionByTelegramUserId(client, operatorTelegramUserId);
  if (!session) {
    return {
      consumed: false,
      reason: 'admin_user_note_session_missing'
    };
  }

  const normalizedText = typeof noteText === 'string' ? noteText.trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n') : '';
  if (!normalizedText) {
    throw new Error('Operator note cannot be empty');
  }
  if (normalizedText.length > 800) {
    throw new Error('Operator note is too long. Limit: 800 characters');
  }

  const operatorUser = await upsertTelegramUser(client, {
    telegramUserId: operatorTelegramUserId,
    telegramUsername: operatorTelegramUsername || null
  });

  await client.query(
    `
      insert into admin_user_notes (user_id, note_text, updated_at, updated_by_user_id)
      values ($1, $2, now(), $3)
      on conflict (user_id)
      do update set
        note_text = excluded.note_text,
        updated_at = now(),
        updated_by_user_id = excluded.updated_by_user_id
    `,
    [session.targetUserId, normalizedText, operatorUser.id]
  );

  await createAdminAuditEvent(client, {
    eventType: 'admin_user_note_updated',
    actorUserId: operatorUser.id,
    targetUserId: session.targetUserId,
    summary: 'Operator note updated.',
    detail: { noteText: normalizedText }
  });

  await cancelAdminUserNoteSession(client, operatorTelegramUserId);

  return {
    consumed: true,
    session,
    noteText: normalizedText,
    card: await getAdminUserCardById(client, { targetUserId: session.targetUserId })
  };
}

export const ADMIN_NOTICE_AUDIENCES = {
  ALL: { key: 'ALL', label: 'All users' },
  CONNECTED: { key: 'CONNECTED', label: 'Connected' },
  NOT_CONNECTED: { key: 'NOT_CONNECTED', label: 'Not connected' },
  CONNECTED_NO_PROFILE: { key: 'CONNECTED_NO_PROFILE', label: 'Connected, no profile' },
  PROFILE_INCOMPLETE: { key: 'PROFILE_INCOMPLETE', label: 'Profile incomplete' },
  COMPLETE_NO_SKILLS: { key: 'COMPLETE_NO_SKILLS', label: 'Ready, no skills' },
  READY_NOT_LISTED: { key: 'READY_NOT_LISTED', label: 'Ready not listed' },
  LISTED_ACTIVE: { key: 'LISTED_ACTIVE', label: 'Listed active' },
  LISTED_INACTIVE: { key: 'LISTED_INACTIVE', label: 'Listed inactive' },
  LISTED: { key: 'LISTED', label: 'Listed' }
};

export const ADMIN_INTRO_SEGMENTS = {
  all: { key: 'all', label: 'All' },
  pend: { key: 'pend', label: 'Pending' },
  p24: { key: 'p24', label: 'Pending >24h' },
  p72: { key: 'p72', label: 'Pending >72h' },
  acc: { key: 'acc', label: 'Accepted' },
  arec: { key: 'arec', label: 'Accepted recent' },
  dec: { key: 'dec', label: 'Declined' },
  drec: { key: 'drec', label: 'Declined recent' },
  stale: { key: 'stale', label: 'Stale' },
  fail: { key: 'fail', label: 'Failed notify' },
  dprob: { key: 'dprob', label: 'Delivery problem' }
};

export function normalizeAdminIntroSegment(segmentKey) {
  const normalized = typeof segmentKey === 'string' ? segmentKey.trim().toLowerCase() : 'all';
  return ADMIN_INTRO_SEGMENTS[normalized] ? normalized : 'all';
}

export const ADMIN_DELIVERY_SEGMENTS = {
  all: { key: 'all', label: 'All' },
  fail: { key: 'fail', label: 'Recent failures' },
  due: { key: 'due', label: 'Retry due' },
  exh: { key: 'exh', label: 'Exhausted' },
  ok: { key: 'ok', label: 'Delivered recent' }
};

export function normalizeAdminDeliverySegment(segmentKey) {
  const normalized = typeof segmentKey === 'string' ? segmentKey.trim().toLowerCase() : 'all';
  return ADMIN_DELIVERY_SEGMENTS[normalized] ? normalized : 'all';
}

export const ADMIN_QUALITY_SEGMENTS = {
  listinc: { key: 'listinc', label: 'Listed incomplete' },
  ready: { key: 'ready', label: 'Ready not listed' },
  miss: { key: 'miss', label: 'Missing fields' },
  dupe: { key: 'dupe', label: 'Duplicates' },
  relink: { key: 'relink', label: 'Relinks' }
};

export function normalizeAdminQualitySegment(segmentKey) {
  const normalized = typeof segmentKey === 'string' ? segmentKey.trim().toLowerCase() : 'listinc';
  return ADMIN_QUALITY_SEGMENTS[normalized] ? normalized : 'listinc';
}

export const ADMIN_AUDIT_SEGMENTS = {
  all: { key: 'all', label: 'All' },
  not: { key: 'not', label: 'Notices' },
  bc: { key: 'bc', label: 'Broadcasts' },
  user: { key: 'user', label: 'User actions' },
  relink: { key: 'relink', label: 'Relinks' }
};

export function normalizeAdminAuditSegment(segmentKey) {
  const normalized = typeof segmentKey === 'string' ? segmentKey.trim().toLowerCase() : 'all';
  return ADMIN_AUDIT_SEGMENTS[normalized] ? normalized : 'all';
}

const ADMIN_NOTIFICATION_BUCKET_SQL = `
  case
    when nr.delivery_status = 'sent' then 'sent'
    when nr.delivery_status = 'skipped' then 'skipped'
    when nr.delivery_status = 'failed'
      and (nr.attempt_count >= nr.max_attempts or nr.next_attempt_at is null)
      then 'exhausted'
    when nr.delivery_status in ('pending', 'failed')
      and nr.sent_message_id is null
      and nr.attempt_count < nr.max_attempts
      and nr.next_attempt_at is not null
      and nr.next_attempt_at <= now()
      then 'retry_due'
    when nr.delivery_status = 'failed' then 'failed'
    when nr.delivery_status = 'pending' then 'failed'
    else 'failed'
  end
`;

function buildIntroSegmentWhereClause(segmentKey) {
  switch (normalizeAdminIntroSegment(segmentKey)) {
    case 'pend':
      return "status = 'pending'";
    case 'p24':
      return "status = 'pending' and created_at <= now() - interval '24 hours'";
    case 'p72':
      return "status = 'pending' and created_at <= now() - interval '72 hours'";
    case 'acc':
      return "status = 'accepted'";
    case 'arec':
      return "status = 'accepted' and updated_at >= now() - interval '7 days'";
    case 'dec':
      return "status = 'declined'";
    case 'drec':
      return "status = 'declined' and updated_at >= now() - interval '7 days'";
    case 'stale':
      return "status = 'pending' and created_at <= now() - interval '72 hours'";
    case 'fail':
    case 'dprob':
      return 'delivery_problem_count > 0';
    case 'all':
    default:
      return 'true';
  }
}

function buildIntroBaseCte() {
  return `
    with intro_base as (
      select
        ir.id as intro_request_id,
        ir.requester_user_id,
        ir.target_user_id,
        ir.target_profile_id,
        ir.status,
        ir.created_at,
        ir.updated_at,
        requester_u.telegram_user_id as requester_telegram_user_id,
        requester_u.telegram_username as requester_telegram_username,
        target_u.telegram_user_id as target_telegram_user_id,
        target_u.telegram_username as target_telegram_username,
        coalesce(nullif(requester_mp.display_name, ''), requester_la.full_name, ir.requester_display_name, 'Unknown member') as requester_display_name,
        coalesce(requester_mp.headline_user, ir.requester_headline_user) as requester_headline_user,
        coalesce(requester_mp.linkedin_public_url, ir.requester_linkedin_public_url) as requester_linkedin_public_url,
        requester_mp.id as requester_profile_id,
        coalesce(nullif(target_mp.display_name, ''), target_la.full_name, ir.target_display_name, 'Unknown member') as target_display_name,
        coalesce(target_mp.headline_user, ir.target_headline_user) as target_headline_user,
        coalesce(target_mp.linkedin_public_url, ir.target_linkedin_public_url) as target_linkedin_public_url,
        target_mp.id as target_profile_id_current,
        coalesce(delivery.problem_count, 0)::int as delivery_problem_count
      from intro_requests ir
      join users requester_u on requester_u.id = ir.requester_user_id
      join users target_u on target_u.id = ir.target_user_id
      left join member_profiles requester_mp on requester_mp.user_id = ir.requester_user_id
      left join linkedin_accounts requester_la on requester_la.user_id = ir.requester_user_id
      left join member_profiles target_mp on target_mp.user_id = ir.target_user_id
      left join linkedin_accounts target_la on target_la.user_id = ir.target_user_id
      left join lateral (
        select count(*) filter (where diag.operator_bucket in ('failed', 'retry_due', 'exhausted'))::int as problem_count
        from (
          select ${ADMIN_NOTIFICATION_BUCKET_SQL} as operator_bucket
          from notification_receipts nr
          where nr.intro_request_id = ir.id
        ) diag
      ) delivery on true
    )
  `;
}

export const ADMIN_BROADCAST_AUDIENCES = {
  ALL_CONNECTED: { key: 'ALL_CONNECTED', label: 'All connected' },
  ALL_LISTED: { key: 'ALL_LISTED', label: 'All listed' },
  LISTED_ACTIVE: { key: 'LISTED_ACTIVE', label: 'Listed active' },
  LISTED_INACTIVE: { key: 'LISTED_INACTIVE', label: 'Listed inactive' },
  NOT_CONNECTED: { key: 'NOT_CONNECTED', label: 'Not connected' },
  CONNECTED_NO_PROFILE: { key: 'CONNECTED_NO_PROFILE', label: 'Connected, no profile' },
  PROFILE_INCOMPLETE: { key: 'PROFILE_INCOMPLETE', label: 'Profile incomplete' },
  COMPLETE_NO_SKILLS: { key: 'COMPLETE_NO_SKILLS', label: 'Ready, no skills' },
  READY_NOT_LISTED: { key: 'READY_NOT_LISTED', label: 'Ready not listed' },
  LISTED_NO_INTROS_YET: { key: 'LISTED_NO_INTROS_YET', label: 'Listed, no intros yet' },
  PENDING_INTROS: { key: 'PENDING_INTROS', label: 'Pending intros' },
  RECENT_PENDING_INTROS: { key: 'RECENT_PENDING_INTROS', label: 'Recent pending intros' },
  ACCEPTED_RECENT: { key: 'ACCEPTED_RECENT', label: 'Accepted recent' },
  DECLINED_RECENT: { key: 'DECLINED_RECENT', label: 'Declined recent' },
  RECENT_RELINKS: { key: 'RECENT_RELINKS', label: 'Recent relinks' }
};

export function normalizeAdminNoticeAudience(value) {
  const key = typeof value === 'string' ? value.trim().toUpperCase() : 'ALL';
  return ADMIN_NOTICE_AUDIENCES[key] ? key : 'ALL';
}

export function normalizeAdminBroadcastAudience(value) {
  const key = typeof value === 'string' ? value.trim().toUpperCase() : 'ALL_CONNECTED';
  return ADMIN_BROADCAST_AUDIENCES[key] ? key : 'ALL_CONNECTED';
}

export const ADMIN_SEARCH_SCOPES = {
  users: { key: 'users', label: 'Search users' },
  intros: { key: 'intros', label: 'Search intros' },
  delivery: { key: 'delivery', label: 'Search delivery' },
  outbox: { key: 'outbox', label: 'Search outbox' },
  audit: { key: 'audit', label: 'Search audit' }
};

export function normalizeAdminSearchScope(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : 'users';
  return ADMIN_SEARCH_SCOPES[key] ? key : 'users';
}

export const ADMIN_DIRECT_MESSAGE_TEMPLATES = {
  connect: { key: 'connect', label: 'Connect LinkedIn', body: 'Quick nudge: connect your LinkedIn in Intro Deck so your identity is verified inside Telegram and your profile can go live.' },
  complete: { key: 'complete', label: 'Complete profile', body: 'Quick nudge: finish your Intro Deck profile so other members can understand what you do and send higher-quality intros.' },
  skills: { key: 'skills', label: 'Add skills', body: 'Quick nudge: add a few relevant skills in Intro Deck so your profile is easier to understand and easier to match.' },
  list: { key: 'list', label: 'List your profile', body: "Your Intro Deck profile looks ready. Put it live in the directory so people can discover you and send intros." },
  inbox: { key: 'inbox', label: 'Check intro inbox', body: 'You have activity waiting in your Intro Deck inbox. Open the bot and review your latest intro updates.' },
  blank: { key: 'blank', label: 'Blank message', body: '' }
};

export function normalizeAdminDirectMessageTemplate(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : 'blank';
  return ADMIN_DIRECT_MESSAGE_TEMPLATES[key] ? key : 'blank';
}

export const ADMIN_NOTICE_TEMPLATES = {
  connect_profile: { key: 'connect_profile', label: 'Connect + start profile', audienceKey: 'CONNECTED_NO_PROFILE', body: "You're connected in Intro Deck. Add your basic profile details so people can understand what you do and where you fit." },
  complete_profile: { key: 'complete_profile', label: 'Complete profile', audienceKey: 'PROFILE_INCOMPLETE', body: "Your Intro Deck profile is almost there. Finish the missing fields so your card is easier to trust and easier to match." },
  add_skills: { key: 'add_skills', label: 'Add skills', audienceKey: 'COMPLETE_NO_SKILLS', body: "Add a few relevant skills in Intro Deck so your profile is easier to scan and easier to match." },
  list_profile: { key: 'list_profile', label: 'List your profile', audienceKey: 'READY_NOT_LISTED', body: "Your Intro Deck profile looks ready. Put it live in the directory so people can discover you and send intros." },
  reengage_listed: { key: 'reengage_listed', label: 'Re-engage listed members', audienceKey: 'LISTED_INACTIVE', body: "Your Intro Deck profile is live, but it has been quiet lately. Open the bot, refresh your card, and check whether new intros are waiting." }
};

export const ADMIN_BROADCAST_TEMPLATES = {
  launch_directory: { key: 'launch_directory', label: 'Launch directory', audienceKey: 'ALL_CONNECTED', body: "Intro Deck directory is live. Complete your profile, add skills, and list yourself so the right people can find you." },
  complete_profile: { key: 'complete_profile', label: 'Complete profile', audienceKey: 'PROFILE_INCOMPLETE', body: "Quick nudge from Intro Deck: finish your profile so other members can understand your focus and send better intros." },
  add_skills: { key: 'add_skills', label: 'Add skills', audienceKey: 'COMPLETE_NO_SKILLS', body: "Profiles with a few clear skills are easier to understand and easier to match. Add your skills in Intro Deck today." },
  list_profile: { key: 'list_profile', label: 'List ready profiles', audienceKey: 'READY_NOT_LISTED', body: "Your profile looks ready. List it in the Intro Deck directory so other members can discover you and send intros." },
  revive_listed: { key: 'revive_listed', label: 'Revive listed inactive', audienceKey: 'LISTED_INACTIVE', body: "Your Intro Deck profile is live, but it has been quiet lately. Open the bot, refresh your card, and check for new activity." },
  accepted_followup: { key: 'accepted_followup', label: 'Accepted intros follow-up', audienceKey: 'ACCEPTED_RECENT', body: "Accepted intros moved recently in Intro Deck. Open the bot, follow through quickly, and keep your profile current." },
  recent_relinks: { key: 'recent_relinks', label: 'Recent relinks', audienceKey: 'RECENT_RELINKS', body: "Your Intro Deck identity was recently reconnected. Open the bot to confirm your profile and keep your directory presence accurate." }
};

export function normalizeAdminNoticeTemplate(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : 'complete_profile';
  return ADMIN_NOTICE_TEMPLATES[key] ? key : 'complete_profile';
}

export function normalizeAdminBroadcastTemplate(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : 'complete_profile';
  return ADMIN_BROADCAST_TEMPLATES[key] ? key : 'complete_profile';
}


function buildNoticeAudienceWhereClause(audienceKey) {
  switch (normalizeAdminNoticeAudience(audienceKey)) {
    case 'CONNECTED':
      return 'has_linkedin';
    case 'NOT_CONNECTED':
      return 'not has_linkedin';
    case 'CONNECTED_NO_PROFILE':
      return 'has_linkedin and profile_id is null';
    case 'PROFILE_INCOMPLETE':
      return "has_linkedin and profile_state is distinct from 'active'";
    case 'COMPLETE_NO_SKILLS':
      return "profile_state = 'active' and coalesce(skills_count, 0) = 0";
    case 'READY_NOT_LISTED':
      return "profile_state = 'active' and coalesce(visibility_status, 'hidden') = 'hidden'";
    case 'LISTED_ACTIVE':
      return "profile_state = 'active' and visibility_status = 'listed' and last_seen_at >= now() - interval '14 days'";
    case 'LISTED_INACTIVE':
      return "profile_state = 'active' and visibility_status = 'listed' and (last_seen_at is null or last_seen_at < now() - interval '14 days')";
    case 'LISTED':
      return "profile_state = 'active' and visibility_status = 'listed'";
    case 'ALL':
    default:
      return 'true';
  }
}

function buildBroadcastAudienceWhereClause(audienceKey) {
  switch (normalizeAdminBroadcastAudience(audienceKey)) {
    case 'ALL_LISTED':
      return "profile_state = 'active' and visibility_status = 'listed'";
    case 'LISTED_ACTIVE':
      return "profile_state = 'active' and visibility_status = 'listed' and last_seen_at >= now() - interval '14 days'";
    case 'LISTED_INACTIVE':
      return "profile_state = 'active' and visibility_status = 'listed' and (last_seen_at is null or last_seen_at < now() - interval '14 days')";
    case 'NOT_CONNECTED':
      return 'not has_linkedin';
    case 'CONNECTED_NO_PROFILE':
      return 'has_linkedin and profile_id is null';
    case 'PROFILE_INCOMPLETE':
      return "has_linkedin and profile_state is distinct from 'active'";
    case 'COMPLETE_NO_SKILLS':
      return "profile_state = 'active' and coalesce(skills_count, 0) = 0";
    case 'READY_NOT_LISTED':
      return "profile_state = 'active' and coalesce(visibility_status, 'hidden') = 'hidden'";
    case 'LISTED_NO_INTROS_YET':
      return "profile_state = 'active' and visibility_status = 'listed' and coalesce(intro_sent_count, 0) = 0 and coalesce(intro_received_count, 0) = 0";
    case 'PENDING_INTROS':
      return 'pending_intro_count > 0';
    case 'RECENT_PENDING_INTROS':
      return "pending_intro_count > 0 and last_seen_at >= now() - interval '14 days'";
    case 'ACCEPTED_RECENT':
      return "user_id in (select distinct requester_user_id from intro_requests where status = 'accepted' and updated_at >= now() - interval '7 days' union select distinct target_user_id from intro_requests where status = 'accepted' and updated_at >= now() - interval '7 days')";
    case 'DECLINED_RECENT':
      return "user_id in (select distinct requester_user_id from intro_requests where status = 'declined' and updated_at >= now() - interval '7 days' union select distinct target_user_id from intro_requests where status = 'declined' and updated_at >= now() - interval '7 days')";
    case 'RECENT_RELINKS':
      return "user_id in (select distinct coalesce(target_user_id, secondary_target_user_id, actor_user_id) from admin_audit_events where event_type = 'linkedin_relink_transferred' and created_at >= now() - interval '7 days')";
    case 'ALL_CONNECTED':
    default:
      return 'has_linkedin';
  }
}

function buildAudienceBaseCte() {
  return `${buildUsersBaseCte()}`;
}

export async function getAdminNoticeState(client) {
  const result = await client.query(
    `
      select singleton_id, body, audience_key, is_active, updated_at, updated_by_user_id
      from admin_notice_state
      where singleton_id = 1
      limit 1
    `
  );

  const row = result.rows[0] || null;
  return {
    singletonId: 1,
    body: row?.body || '',
    audienceKey: normalizeAdminNoticeAudience(row?.audience_key || 'ALL'),
    isActive: Boolean(row?.is_active),
    updatedAt: row?.updated_at || null,
    updatedByUserId: row?.updated_by_user_id || null
  };
}

export async function upsertAdminNoticeBody(client, { operatorUserId, body }) {
  const normalizedBody = typeof body === 'string' ? body.trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n') : '';
  if (!normalizedBody) {
    throw new Error('Notice text cannot be empty');
  }
  if (normalizedBody.length > 1200) {
    throw new Error('Notice text is too long. Limit: 1200 characters');
  }

  await client.query(
    `
      insert into admin_notice_state (singleton_id, body, audience_key, is_active, updated_at, updated_by_user_id)
      values (1, $1, 'ALL', false, now(), $2)
      on conflict (singleton_id)
      do update set body = excluded.body, updated_at = now(), updated_by_user_id = excluded.updated_by_user_id
    `,
    [normalizedBody, operatorUserId]
  );

  return getAdminNoticeState(client);
}

export async function updateAdminNoticeAudience(client, { operatorUserId, audienceKey }) {
  const normalizedAudienceKey = normalizeAdminNoticeAudience(audienceKey);
  await client.query(
    `
      insert into admin_notice_state (singleton_id, body, audience_key, is_active, updated_at, updated_by_user_id)
      values (1, '', $1, false, now(), $2)
      on conflict (singleton_id)
      do update set audience_key = excluded.audience_key, updated_at = now(), updated_by_user_id = excluded.updated_by_user_id
    `,
    [normalizedAudienceKey, operatorUserId]
  );

  return getAdminNoticeState(client);
}

export async function applyAdminNoticeTemplate(client, { operatorUserId, templateKey }) {
  const template = ADMIN_NOTICE_TEMPLATES[normalizeAdminNoticeTemplate(templateKey)] || ADMIN_NOTICE_TEMPLATES.complete_profile;
  const normalizedBody = template.body.trim();
  await client.query(
    `
      insert into admin_notice_state (singleton_id, body, audience_key, is_active, updated_at, updated_by_user_id)
      values (1, $1, $2, false, now(), $3)
      on conflict (singleton_id)
      do update set body = excluded.body, audience_key = excluded.audience_key, updated_at = now(), updated_by_user_id = excluded.updated_by_user_id
    `,
    [normalizedBody, template.audienceKey, operatorUserId]
  );
  return getAdminNoticeState(client);
}

export async function activateAdminNotice(client, { operatorUserId }) {
  const state = await getAdminNoticeState(client);
  if (!state.body) {
    throw new Error('Notice text cannot be empty');
  }

  await client.query(
    `update admin_notice_state set is_active = true, updated_at = now(), updated_by_user_id = $1 where singleton_id = 1`,
    [operatorUserId]
  );

  const result = await client.query(
    `
      insert into admin_comm_outbox (
        event_type,
        body,
        audience_key,
        status,
        estimated_recipient_count,
        delivered_count,
        failed_count,
        created_at,
        updated_at,
        sent_at,
        created_by_user_id
      )
      values ('notice', $1, $2, 'sent', null, null, null, now(), now(), now(), $3)
      returning id
    `,
    [state.body, state.audienceKey, operatorUserId]
  );

  await createAdminAuditEvent(client, {
    eventType: 'admin_notice_activated',
    actorUserId: operatorUserId,
    summary: 'Notice activated.',
    detail: { audienceKey: state.audienceKey, body: state.body, outboxId: result.rows[0]?.id || null }
  });

  return {
    state: await getAdminNoticeState(client),
    outboxId: result.rows[0]?.id || null
  };
}

export async function disableAdminNotice(client, { operatorUserId }) {
  const state = await getAdminNoticeState(client);
  await client.query(
    `update admin_notice_state set is_active = false, updated_at = now(), updated_by_user_id = $1 where singleton_id = 1`,
    [operatorUserId]
  );

  const result = await client.query(
    `
      insert into admin_comm_outbox (
        event_type,
        body,
        audience_key,
        status,
        estimated_recipient_count,
        delivered_count,
        failed_count,
        created_at,
        updated_at,
        sent_at,
        created_by_user_id
      )
      values ('notice', $1, $2, 'disabled', null, null, null, now(), now(), now(), $3)
      returning id
    `,
    [state.body, state.audienceKey, operatorUserId]
  );

  await createAdminAuditEvent(client, {
    eventType: 'admin_notice_disabled',
    actorUserId: operatorUserId,
    summary: 'Notice disabled.',
    detail: { audienceKey: state.audienceKey, body: state.body, outboxId: result.rows[0]?.id || null }
  });

  return {
    state: await getAdminNoticeState(client),
    outboxId: result.rows[0]?.id || null
  };
}

export async function getAdminBroadcastDraft(client) {
  const result = await client.query(
    `
      select singleton_id, body, audience_key, updated_at, updated_by_user_id
      from admin_broadcast_drafts
      where singleton_id = 1
      limit 1
    `
  );

  const row = result.rows[0] || null;
  return {
    singletonId: 1,
    body: row?.body || '',
    audienceKey: normalizeAdminBroadcastAudience(row?.audience_key || 'ALL_CONNECTED'),
    updatedAt: row?.updated_at || null,
    updatedByUserId: row?.updated_by_user_id || null
  };
}

export async function upsertAdminBroadcastDraftBody(client, { operatorUserId, body }) {
  const normalizedBody = typeof body === 'string' ? body.trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n') : '';
  if (!normalizedBody) {
    throw new Error('Broadcast text cannot be empty');
  }
  if (normalizedBody.length > 2000) {
    throw new Error('Broadcast text is too long. Limit: 2000 characters');
  }

  await client.query(
    `
      insert into admin_broadcast_drafts (singleton_id, body, audience_key, updated_at, updated_by_user_id)
      values (1, $1, 'ALL_CONNECTED', now(), $2)
      on conflict (singleton_id)
      do update set body = excluded.body, updated_at = now(), updated_by_user_id = excluded.updated_by_user_id
    `,
    [normalizedBody, operatorUserId]
  );

  return getAdminBroadcastDraft(client);
}

export async function updateAdminBroadcastDraftAudience(client, { operatorUserId, audienceKey }) {
  const normalizedAudienceKey = normalizeAdminBroadcastAudience(audienceKey);
  await client.query(
    `
      insert into admin_broadcast_drafts (singleton_id, body, audience_key, updated_at, updated_by_user_id)
      values (1, '', $1, now(), $2)
      on conflict (singleton_id)
      do update set audience_key = excluded.audience_key, updated_at = now(), updated_by_user_id = excluded.updated_by_user_id
    `,
    [normalizedAudienceKey, operatorUserId]
  );

  return getAdminBroadcastDraft(client);
}

export async function applyAdminBroadcastTemplate(client, { operatorUserId, templateKey }) {
  const template = ADMIN_BROADCAST_TEMPLATES[normalizeAdminBroadcastTemplate(templateKey)] || ADMIN_BROADCAST_TEMPLATES.complete_profile;
  const normalizedBody = template.body.trim();
  await client.query(
    `
      insert into admin_broadcast_drafts (singleton_id, body, audience_key, updated_at, updated_by_user_id)
      values (1, $1, $2, now(), $3)
      on conflict (singleton_id)
      do update set body = excluded.body, audience_key = excluded.audience_key, updated_at = now(), updated_by_user_id = excluded.updated_by_user_id
    `,
    [normalizedBody, template.audienceKey, operatorUserId]
  );

  return getAdminBroadcastDraft(client);
}

export async function clearAdminBroadcastDraft(client) {
  await client.query(`delete from admin_broadcast_drafts where singleton_id = 1`);
}

export async function estimateAdminNoticeAudienceCount(client, { audienceKey }) {
  const whereClause = buildNoticeAudienceWhereClause(audienceKey);
  const result = await client.query(
    `${buildAudienceBaseCte()}
     select count(*)::int as total_count
     from user_base
     where telegram_user_id is not null and ${whereClause}`
  );
  return result.rows[0]?.total_count || 0;
}

export async function estimateAdminBroadcastAudienceCount(client, { audienceKey }) {
  const whereClause = buildBroadcastAudienceWhereClause(audienceKey);
  const result = await client.query(
    `${buildAudienceBaseCte()}
     select count(*)::int as total_count
     from user_base
     where telegram_user_id is not null and ${whereClause}`
  );
  return result.rows[0]?.total_count || 0;
}

export async function listAdminBroadcastRecipients(client, { audienceKey }) {
  const whereClause = buildBroadcastAudienceWhereClause(audienceKey);
  const result = await client.query(
    `${buildAudienceBaseCte()}
     select user_id, telegram_user_id, telegram_username, coalesce(display_name, linkedin_name) as display_name
     from user_base
     where telegram_user_id is not null and ${whereClause}
     order by last_seen_at desc nulls last, user_id desc`
  );

  return (result.rows || []).map((row) => ({
    userId: row.user_id,
    telegramUserId: row.telegram_user_id,
    telegramUsername: row.telegram_username,
    displayName: row.display_name || null
  }));
}

export async function createAdminCommOutboxRecord(client, {
  eventType,
  body,
  audienceKey = null,
  targetUserId = null,
  status = 'draft',
  estimatedRecipientCount = null,
  deliveredCount = null,
  failedCount = null,
  createdByUserId = null,
  batchSize = null,
  cursor = 0,
  startedAt = null,
  finishedAt = null,
  lastError = null
}) {
  const result = await client.query(
    `
      insert into admin_comm_outbox (
        event_type,
        body,
        audience_key,
        target_user_id,
        status,
        estimated_recipient_count,
        delivered_count,
        failed_count,
        batch_size,
        cursor,
        started_at,
        finished_at,
        last_error,
        created_at,
        updated_at,
        sent_at,
        created_by_user_id
      )
      values (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, coalesce($10, 0), $11, $12, $13,
        now(), now(),
        case when $5 in ('sent', 'failed', 'sent_with_failures', 'disabled') then now() else null end,
        $14
      )
      returning id
    `,
    [eventType, body, audienceKey, targetUserId, status, estimatedRecipientCount, deliveredCount, failedCount, batchSize, cursor, startedAt, finishedAt, lastError, createdByUserId]
  );

  return result.rows[0]?.id || null;
}

export async function updateAdminCommOutboxRecord(client, {
  outboxId,
  status,
  estimatedRecipientCount = null,
  deliveredCount = null,
  failedCount = null,
  batchSize = null,
  cursor = null,
  startedAt = null,
  finishedAt = null,
  lastError = null
}) {
  const result = await client.query(
    `
      update admin_comm_outbox
      set
        status = $2,
        estimated_recipient_count = coalesce($3, estimated_recipient_count),
        delivered_count = coalesce($4, delivered_count),
        failed_count = coalesce($5, failed_count),
        batch_size = coalesce($6, batch_size),
        cursor = coalesce($7, cursor),
        started_at = coalesce($8, started_at),
        finished_at = case when $9 is not null then $9 when $2 in ('sent', 'failed', 'sent_with_failures', 'disabled') then coalesce(finished_at, now()) else finished_at end,
        last_error = case when $10 is not null then $10 else last_error end,
        updated_at = now(),
        sent_at = case when $2 in ('sent', 'failed', 'sent_with_failures', 'disabled') then coalesce(sent_at, now()) else sent_at end
      where id = $1
      returning id
    `,
    [outboxId, status, estimatedRecipientCount, deliveredCount, failedCount, batchSize, cursor, startedAt, finishedAt, lastError]
  );
  return result.rows[0]?.id || null;
}

export async function createAdminBroadcastDeliveryItems(client, { outboxId, recipients = [] }) {
  if (!Array.isArray(recipients) || !recipients.length) {
    return 0;
  }

  const values = [];
  const params = [];
  recipients.forEach((recipient, index) => {
    const offset = index * 3;
    values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, 'pending', 0, null, null, null, now(), now())`);
    params.push(outboxId, recipient.userId, recipient.telegramUserId);
  });

  const result = await client.query(
    `
      insert into admin_broadcast_delivery_items (
        outbox_id,
        target_user_id,
        target_telegram_user_id,
        status,
        attempts,
        last_error,
        retry_due_at,
        sent_at,
        created_at,
        updated_at
      )
      values ${values.join(', ')}
      on conflict (outbox_id, target_user_id)
      do nothing
    `,
    params
  );

  return result.rowCount || 0;
}

export async function listAdminBroadcastDeliveryBatch(client, { outboxId, limit = 25 } = {}) {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 25;
  const result = await client.query(
    `
      select id, outbox_id, target_user_id, target_telegram_user_id, status, attempts, last_error, retry_due_at, sent_at
      from admin_broadcast_delivery_items
      where outbox_id = $1 and status in ('pending', 'retry_due')
      order by id asc
      limit $2
    `,
    [outboxId, safeLimit]
  );
  return result.rows || [];
}

export async function markAdminBroadcastDeliveryItemSending(client, { itemId }) {
  await client.query(
    `update admin_broadcast_delivery_items set status = 'sending', updated_at = now() where id = $1`,
    [itemId]
  );
}

export async function completeAdminBroadcastDeliveryItem(client, { itemId, status, errorMessage = null }) {
  const normalizedStatus = ['sent', 'failed', 'retry_due', 'exhausted'].includes(status) ? status : 'failed';
  await client.query(
    `
      update admin_broadcast_delivery_items
      set
        status = $2,
        attempts = attempts + 1,
        last_error = $3,
        retry_due_at = case when $2 = 'retry_due' then now() + interval '5 minutes' else null end,
        sent_at = case when $2 = 'sent' then now() else sent_at end,
        updated_at = now()
      where id = $1
    `,
    [itemId, normalizedStatus, errorMessage]
  );
}

export async function summarizeAdminBroadcastDelivery(client, { outboxId }) {
  const result = await client.query(
    `
      select
        count(*)::int as total_count,
        count(*) filter (where status = 'sent')::int as sent_count,
        count(*) filter (where status in ('failed', 'retry_due', 'exhausted'))::int as failed_count,
        count(*) filter (where status in ('pending', 'sending', 'retry_due'))::int as pending_count,
        count(*) filter (where status = 'retry_due')::int as retry_due_count,
        count(*) filter (where status = 'exhausted')::int as exhausted_count,
        max(last_error) filter (where coalesce(last_error, '') <> '') as last_error
      from admin_broadcast_delivery_items
      where outbox_id = $1
    `,
    [outboxId]
  );
  return result.rows[0] || null;
}

export async function listAdminBroadcastFailurePage(client, { outboxId, page = 0, pageSize = 10 } = {}) {
  const normalizedPage = Number.isFinite(page) && page >= 0 ? page : 0;
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 25) : 10;
  const offset = normalizedPage * normalizedPageSize;

  const countResult = await client.query(
    `
      select count(*)::int as total_count
      from admin_broadcast_delivery_items
      where outbox_id = $1 and status in ('failed', 'retry_due', 'exhausted')
    `,
    [outboxId]
  );

  const result = await client.query(
    `
      select
        item.id,
        item.outbox_id,
        item.target_user_id,
        item.target_telegram_user_id,
        item.status,
        item.attempts,
        item.last_error,
        item.retry_due_at,
        item.sent_at,
        target.telegram_username as target_telegram_username,
        target_profile.display_name as target_display_name
      from admin_broadcast_delivery_items item
      left join users target on target.id = item.target_user_id
      left join member_profiles target_profile on target_profile.user_id = target.id
      where item.outbox_id = $1 and item.status in ('failed', 'retry_due', 'exhausted')
      order by item.id asc
      limit $2 offset $3
    `,
    [outboxId, normalizedPageSize + 1, offset]
  );

  const rows = (result.rows || []).slice(0, normalizedPageSize);
  const totalCount = countResult.rows[0]?.total_count || 0;
  return {
    outboxId,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalCount,
    hasPrev: normalizedPage > 0,
    hasNext: offset + normalizedPageSize < totalCount,
    items: rows
  };
}

function buildOutboxRecordSelect() {
  return `
      select o.id, o.event_type, o.body, o.audience_key, o.target_user_id, o.status,
             o.estimated_recipient_count, o.delivered_count, o.failed_count,
             o.batch_size, o.cursor, o.started_at, o.finished_at, o.last_error,
             o.created_at, o.updated_at, o.sent_at,
             u.telegram_user_id as created_by_telegram_user_id,
             u.telegram_username as created_by_telegram_username,
             target.telegram_user_id as target_telegram_user_id,
             target.telegram_username as target_telegram_username,
             target_profile.display_name as target_display_name,
             coalesce(stats.pending_count, 0)::int as pending_count,
             coalesce(stats.retry_due_count, 0)::int as retry_due_count,
             coalesce(stats.exhausted_count, 0)::int as exhausted_count
      from admin_comm_outbox o
      left join users u on u.id = o.created_by_user_id
      left join users target on target.id = o.target_user_id
      left join member_profiles target_profile on target_profile.user_id = target.id
      left join lateral (
        select
          count(*) filter (where item.status in ('pending', 'sending', 'retry_due'))::int as pending_count,
          count(*) filter (where item.status = 'retry_due')::int as retry_due_count,
          count(*) filter (where item.status = 'exhausted')::int as exhausted_count
        from admin_broadcast_delivery_items item
        where item.outbox_id = o.id
      ) stats on true
  `;
}

export async function listAdminCommOutbox(client, { limit = 12, eventType = null } = {}) {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 30) : 12;
  const filters = [];
  const params = [];
  if (eventType) {
    params.push(eventType);
    filters.push(`o.event_type = $${params.length}`);
  }
  const whereClause = filters.length ? `where ${filters.join(' and ')}` : '';
  const result = await client.query(
    `${buildOutboxRecordSelect()}
      ${whereClause}
      order by o.created_at desc, o.id desc
      limit $${params.length + 1}`,
    [...params, safeLimit]
  );
  return result.rows || [];
}

export async function getAdminCommOutboxRecordById(client, { outboxId }) {
  const result = await client.query(
    `${buildOutboxRecordSelect()}
      where o.id = $1
      limit 1`,
    [outboxId]
  );
  return result.rows[0] || null;
}

export async function beginAdminCommsInputSession(client, { operatorTelegramUserId, inputKind, targetUserId = null, segmentKey = 'all', page = 0 }) {
  if (!['notice_body', 'broadcast_body', 'direct_body', 'search_users', 'search_intros', 'search_delivery', 'search_outbox', 'search_audit'].includes(inputKind)) {
    throw new Error('Unsupported admin communications input kind');
  }

  const normalizedSegmentKey = normalizeAdminUserSegment(segmentKey);
  const normalizedPage = Number.isFinite(page) && page >= 0 ? page : 0;

  await client.query(
    `
      insert into admin_comms_input_sessions (operator_telegram_user_id, input_kind, target_user_id, segment_key, page, created_at, updated_at)
      values ($1, $2, $3, $4, $5, now(), now())
      on conflict (operator_telegram_user_id)
      do update set
        input_kind = excluded.input_kind,
        target_user_id = excluded.target_user_id,
        segment_key = excluded.segment_key,
        page = excluded.page,
        updated_at = now()
    `,
    [operatorTelegramUserId, inputKind, targetUserId, normalizedSegmentKey, normalizedPage]
  );

  return { operatorTelegramUserId, inputKind, targetUserId, segmentKey: normalizedSegmentKey, page: normalizedPage };
}


export async function upsertAdminSearchState(client, { operatorTelegramUserId, scopeKey, queryText, page = 0 }) {
  const normalizedScopeKey = normalizeAdminSearchScope(scopeKey);
  const normalizedQueryText = typeof queryText === 'string' ? queryText.trim() : '';
  const normalizedPage = Number.isFinite(page) && page >= 0 ? page : 0;

  await client.query(
    `
      insert into admin_search_states (operator_telegram_user_id, scope_key, query_text, page, created_at, updated_at)
      values ($1, $2, $3, $4, now(), now())
      on conflict (operator_telegram_user_id, scope_key)
      do update set
        query_text = excluded.query_text,
        page = excluded.page,
        updated_at = now()
    `,
    [operatorTelegramUserId, normalizedScopeKey, normalizedQueryText, normalizedPage]
  );

  return { operatorTelegramUserId, scopeKey: normalizedScopeKey, queryText: normalizedQueryText, page: normalizedPage };
}

export async function getAdminSearchState(client, { operatorTelegramUserId, scopeKey }) {
  const normalizedScopeKey = normalizeAdminSearchScope(scopeKey);
  const result = await client.query(
    `select operator_telegram_user_id, scope_key, query_text, page, created_at, updated_at from admin_search_states where operator_telegram_user_id = $1 and scope_key = $2 limit 1`,
    [operatorTelegramUserId, normalizedScopeKey]
  );
  const row = result.rows[0] || null;
  if (!row) {
    return null;
  }
  return {
    operatorTelegramUserId: row.operator_telegram_user_id,
    scopeKey: row.scope_key,
    queryText: row.query_text || '',
    page: row.page || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getAdminCommsInputSession(client, operatorTelegramUserId) {
  const result = await client.query(
    `select operator_telegram_user_id, input_kind, target_user_id, segment_key, page, created_at, updated_at from admin_comms_input_sessions where operator_telegram_user_id = $1 limit 1`,
    [operatorTelegramUserId]
  );
  const row = result.rows[0] || null;
  if (!row) {
    return null;
  }
  return {
    operatorTelegramUserId: row.operator_telegram_user_id,
    inputKind: row.input_kind,
    targetUserId: row.target_user_id || null,
    segmentKey: normalizeAdminUserSegment(row.segment_key),
    page: row.page || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function cancelAdminCommsInputSession(client, operatorTelegramUserId) {
  await client.query(`delete from admin_comms_input_sessions where operator_telegram_user_id = $1`, [operatorTelegramUserId]);
}

export async function saveAdminCommsTextFromSession(client, {
  operatorTelegramUserId,
  operatorTelegramUsername = null,
  text
}) {
  const session = await getAdminCommsInputSession(client, operatorTelegramUserId);
  if (!session) {
    return { consumed: false, reason: 'admin_comms_input_session_missing' };
  }

  const operatorUser = await upsertTelegramUser(client, {
    telegramUserId: operatorTelegramUserId,
    telegramUsername: operatorTelegramUsername || null
  });

  let result;
  let reason;
  if (session.inputKind === 'notice_body') {
    result = await upsertAdminNoticeBody(client, { operatorUserId: operatorUser.id, body: text });
    reason = 'admin_notice_body_saved';
  } else if (session.inputKind === 'broadcast_body') {
    result = await upsertAdminBroadcastDraftBody(client, { operatorUserId: operatorUser.id, body: text });
    reason = 'admin_broadcast_body_saved';
  } else if (session.inputKind === 'direct_body') {
    result = await upsertAdminDirectMessageDraft(client, {
      operatorTelegramUserId,
      operatorUserId: operatorUser.id,
      targetUserId: session.targetUserId,
      body: text,
      templateKey: null,
      segmentKey: session.segmentKey,
      page: session.page
    });
    reason = 'admin_direct_body_saved';
  } else {
    const scopeKey = session.inputKind.replace(/^search_/, '');
    result = await upsertAdminSearchState(client, {
      operatorTelegramUserId,
      scopeKey,
      queryText: text,
      page: 0
    });
    reason = `admin_search_${scopeKey}_saved`;
  }

  await cancelAdminCommsInputSession(client, operatorTelegramUserId);
  return {
    consumed: true,
    reason,
    session,
    state: result
  };
}


export async function getAdminDirectMessageDraft(client, { operatorTelegramUserId, targetUserId = null, segmentKey = 'all', page = 0 } = {}) {
  const normalizedSegmentKey = normalizeAdminUserSegment(segmentKey);
  const normalizedPage = Number.isFinite(page) && page >= 0 ? page : 0;
  const result = await client.query(
    `
      select d.operator_telegram_user_id, d.target_user_id, d.body, d.template_key, d.segment_key, d.page,
             d.created_at, d.updated_at,
             target.telegram_user_id as target_telegram_user_id,
             target.telegram_username as target_telegram_username,
             target_profile.display_name as target_display_name,
             la.full_name as target_linkedin_name
      from admin_direct_message_drafts d
      join users target on target.id = d.target_user_id
      left join member_profiles target_profile on target_profile.user_id = target.id
      left join linkedin_accounts la on la.user_id = target.id
      where d.operator_telegram_user_id = $1
      limit 1
    `,
    [operatorTelegramUserId]
  );
  const row = result.rows[0] || null;
  if (!row || (targetUserId && Number(row.target_user_id) !== Number(targetUserId))) {
    return {
      operatorTelegramUserId,
      targetUserId,
      body: '',
      templateKey: 'blank',
      segmentKey: normalizedSegmentKey,
      page: normalizedPage,
      targetTelegramUserId: null,
      targetTelegramUsername: null,
      targetDisplayName: null,
      targetLinkedinName: null,
      updatedAt: null
    };
  }
  return {
    operatorTelegramUserId: row.operator_telegram_user_id,
    targetUserId: row.target_user_id,
    body: row.body || '',
    templateKey: normalizeAdminDirectMessageTemplate(row.template_key),
    segmentKey: normalizeAdminUserSegment(row.segment_key),
    page: row.page || 0,
    targetTelegramUserId: row.target_telegram_user_id || null,
    targetTelegramUsername: row.target_telegram_username || null,
    targetDisplayName: row.target_display_name || null,
    targetLinkedinName: row.target_linkedin_name || null,
    updatedAt: row.updated_at || null
  };
}

export async function upsertAdminDirectMessageDraft(client, {
  operatorTelegramUserId,
  operatorUserId = null,
  targetUserId,
  body = '',
  templateKey = null,
  segmentKey = 'all',
  page = 0
}) {
  const normalizedBody = typeof body === 'string' ? body.trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n') : '';
  if (normalizedBody.length > 2000) {
    throw new Error('Direct message is too long. Limit: 2000 characters');
  }
  const normalizedSegmentKey = normalizeAdminUserSegment(segmentKey);
  const normalizedPage = Number.isFinite(page) && page >= 0 ? page : 0;
  const normalizedTemplateKey = templateKey == null ? null : normalizeAdminDirectMessageTemplate(templateKey);

  await client.query(
    `
      insert into admin_direct_message_drafts (
        operator_telegram_user_id,
        target_user_id,
        body,
        template_key,
        segment_key,
        page,
        created_at,
        updated_at,
        updated_by_user_id
      )
      values ($1, $2, $3, $4, $5, $6, now(), now(), $7)
      on conflict (operator_telegram_user_id)
      do update set
        target_user_id = excluded.target_user_id,
        body = excluded.body,
        template_key = excluded.template_key,
        segment_key = excluded.segment_key,
        page = excluded.page,
        updated_at = now(),
        updated_by_user_id = excluded.updated_by_user_id
    `,
    [operatorTelegramUserId, targetUserId, normalizedBody, normalizedTemplateKey, normalizedSegmentKey, normalizedPage, operatorUserId]
  );

  return getAdminDirectMessageDraft(client, { operatorTelegramUserId, targetUserId, segmentKey: normalizedSegmentKey, page: normalizedPage });
}

export async function clearAdminDirectMessageDraft(client, { operatorTelegramUserId }) {
  await client.query(`delete from admin_direct_message_drafts where operator_telegram_user_id = $1`, [operatorTelegramUserId]);
}


function buildDeliverySegmentWhereClause(segmentKey) {
  switch (normalizeAdminDeliverySegment(segmentKey)) {
    case 'fail':
      return "operator_bucket = 'failed'";
    case 'due':
      return "operator_bucket = 'retry_due'";
    case 'exh':
      return "operator_bucket = 'exhausted'";
    case 'ok':
      return "operator_bucket = 'sent'";
    case 'all':
    default:
      return 'true';
  }
}

function buildDeliveryBaseCte() {
  return `
    with delivery_base as (
      select
        nr.id as notification_receipt_id,
        nr.event_key,
        nr.event_type,
        nr.intro_request_id,
        nr.recipient_user_id,
        nr.recipient_telegram_user_id,
        nr.delivery_status,
        ${ADMIN_NOTIFICATION_BUCKET_SQL} as operator_bucket,
        nr.attempt_count,
        nr.max_attempts,
        nr.next_attempt_at,
        nr.last_attempt_at,
        nr.delivered_at,
        nr.sent_message_id,
        nr.created_at,
        nr.last_error_code,
        nr.error_message,
        requester_u.id as requester_user_id,
        requester_u.telegram_user_id as requester_telegram_user_id,
        requester_u.telegram_username as requester_telegram_username,
        target_u.id as target_user_id,
        target_u.telegram_user_id as target_telegram_user_id,
        target_u.telegram_username as target_telegram_username,
        coalesce(nullif(requester_mp.display_name, ''), requester_la.full_name, ir.requester_display_name, 'Unknown member') as requester_display_name,
        coalesce(nullif(target_mp.display_name, ''), target_la.full_name, ir.target_display_name, 'Unknown member') as target_display_name,
        coalesce(nullif(recipient_mp.display_name, ''), recipient_la.full_name, recipient_u.telegram_username, concat('User ', recipient_u.telegram_user_id::text)) as recipient_display_name
      from notification_receipts nr
      left join intro_requests ir on ir.id = nr.intro_request_id
      left join users recipient_u on recipient_u.id = nr.recipient_user_id
      left join member_profiles recipient_mp on recipient_mp.user_id = nr.recipient_user_id
      left join linkedin_accounts recipient_la on recipient_la.user_id = nr.recipient_user_id
      left join users requester_u on requester_u.id = ir.requester_user_id
      left join member_profiles requester_mp on requester_mp.user_id = ir.requester_user_id
      left join linkedin_accounts requester_la on requester_la.user_id = ir.requester_user_id
      left join users target_u on target_u.id = ir.target_user_id
      left join member_profiles target_mp on target_mp.user_id = ir.target_user_id
      left join linkedin_accounts target_la on target_la.user_id = ir.target_user_id
    )
  `;
}


function buildQualityBaseCte() {
  return `
    with quality_base as (
      select
        u.id as user_id,
        u.telegram_user_id,
        u.telegram_username,
        u.last_seen_at,
        la.id is not null as has_linkedin,
        la.full_name as linkedin_name,
        mp.id as profile_id,
        mp.display_name,
        mp.headline_user,
        mp.company_user,
        mp.city_user,
        mp.industry_user,
        mp.linkedin_public_url,
        mp.visibility_status,
        mp.profile_state,
        coalesce(sk.skills_count, 0)::int as skills_count,
        coalesce(intro.sent_count, 0)::int as intro_sent_count,
        coalesce(intro.received_count, 0)::int as intro_received_count,
        coalesce(intro.pending_count, 0)::int as pending_intro_count,
        case
          when mp.id is not null and (
            coalesce(nullif(mp.headline_user, ''), '') = '' or
            coalesce(nullif(mp.company_user, ''), '') = '' or
            coalesce(nullif(mp.city_user, ''), '') = '' or
            coalesce(nullif(mp.industry_user, ''), '') = '' or
            coalesce(sk.skills_count, 0) = 0
          ) then true
          else false
        end as missing_critical,
        case
          when mp.profile_state = 'active'
            and mp.visibility_status = 'listed'
            and (
              coalesce(nullif(mp.headline_user, ''), '') = '' or
              coalesce(nullif(mp.company_user, ''), '') = '' or
              coalesce(sk.skills_count, 0) = 0
            ) then true
          else false
        end as listed_incomplete,
        case
          when mp.profile_state = 'active' and coalesce(mp.visibility_status, 'hidden') = 'hidden' then true
          else false
        end as ready_not_listed,
        case
          when count(*) over (
            partition by lower(coalesce(nullif(mp.linkedin_public_url, ''), concat('profile:', u.id::text)))
          ) > 1 and coalesce(nullif(mp.linkedin_public_url, ''), '') <> '' then true
          when count(*) over (
            partition by lower(coalesce(nullif(mp.display_name, ''), la.full_name, concat('user-', u.id::text))), lower(coalesce(nullif(mp.company_user, ''), ''))
          ) > 1 and coalesce(nullif(mp.display_name, ''), la.full_name, '') <> '' and coalesce(nullif(mp.company_user, ''), '') <> '' then true
          else false
        end as duplicate_like,
        note.note_text,
        note.updated_at as note_updated_at
      from users u
      left join linkedin_accounts la on la.user_id = u.id
      left join member_profiles mp on mp.user_id = u.id
      left join lateral (
        select count(*)::int as skills_count
        from member_profile_skills mps
        where mps.profile_id = mp.id
      ) sk on true
      left join lateral (
        select
          count(*) filter (where ir.requester_user_id = u.id)::int as sent_count,
          count(*) filter (where ir.target_user_id = u.id)::int as received_count,
          count(*) filter (where ir.status = 'pending' and (ir.requester_user_id = u.id or ir.target_user_id = u.id))::int as pending_count
        from intro_requests ir
        where ir.requester_user_id = u.id or ir.target_user_id = u.id
      ) intro on true
      left join admin_user_notes note on note.user_id = u.id
    )
  `;
}

function buildQualitySegmentWhereClause(segmentKey) {
  switch (normalizeAdminQualitySegment(segmentKey)) {
    case 'ready':
      return 'ready_not_listed';
    case 'miss':
      return 'missing_critical';
    case 'dupe':
      return 'duplicate_like';
    case 'relink':
      return "user_id in (select distinct coalesce(target_user_id, actor_user_id) from admin_audit_events where event_type = 'linkedin_relink_transferred')";
    case 'listinc':
    default:
      return 'listed_incomplete';
  }
}


export async function getAdminDashboardSummary(client) {
  const [usersResult, qualityResult, introsResult, deliveryResult, noticeState, broadcastDraft, latestBroadcastRows, recentDirectResult, recentOutboxFailuresResult, recentAuditResult, trendUsersResult, trendProfilesResult, trendIntrosResult, trendDeliveryResult, trendCommsResult, trendAuditResult] = await Promise.all([
    client.query(
      `${buildUsersBaseCte()}
       select
         count(*)::int as total_users,
         count(*) filter (where profile_state = 'active' and visibility_status = 'listed')::int as listed_users,
         count(*) filter (where profile_state = 'active' and coalesce(visibility_status, 'hidden') = 'hidden')::int as ready_not_listed,
         count(*) filter (where has_linkedin)::int as connected_users
       from user_base`
    ),
    client.query(
      `${buildQualityBaseCte()}
       select
         count(*) filter (where listed_incomplete)::int as listed_incomplete,
         count(*) filter (where missing_critical)::int as missing_critical,
         count(*) filter (where profile_state = 'active' and coalesce(skills_count, 0) = 0)::int as ready_no_skills_count,
         count(*) filter (where profile_state = 'active' and visibility_status = 'listed' and last_seen_at >= now() - interval '14 days')::int as listed_active_count,
         count(*) filter (where profile_state = 'active' and visibility_status = 'listed' and (last_seen_at is null or last_seen_at < now() - interval '14 days'))::int as listed_inactive_count,
         count(*) filter (where has_linkedin and coalesce(intro_sent_count, 0) = 0 and coalesce(intro_received_count, 0) = 0)::int as no_intro_yet_count
       from quality_base`
    ),
    client.query(
      `${buildIntroBaseCte()}
       select
         count(*) filter (where status = 'pending')::int as pending_intros,
         count(*) filter (where status = 'accepted')::int as accepted_intros,
         count(*) filter (where status = 'declined')::int as declined_intros,
         count(*) filter (where status = 'pending' and created_at <= now() - interval '72 hours')::int as stale_intros
       from intro_base`
    ),
    client.query(
      `${buildDeliveryBaseCte()}
       select
         count(*) filter (where operator_bucket in ('failed', 'retry_due', 'exhausted'))::int as delivery_issues,
         count(*) filter (where operator_bucket = 'retry_due')::int as retry_due,
         count(*) filter (where operator_bucket = 'exhausted')::int as exhausted,
         count(*) filter (where operator_bucket = 'failed')::int as failed_deliveries
       from delivery_base`
    ),
    getAdminNoticeState(client),
    getAdminBroadcastDraft(client),
    listAdminCommOutbox(client, { limit: 1, eventType: 'broadcast' }),
    client.query(
      `select count(*)::int as recent_direct_messages
       from admin_comm_outbox
       where event_type = 'direct' and created_at >= now() - interval '7 days'`
    ),
    client.query(
      `select count(*)::int as recent_outbox_failures
       from admin_comm_outbox
       where created_at >= now() - interval '7 days'
         and (
           coalesce(failed_count, 0) > 0
           or status in ('failed', 'sent_with_failures', 'partial')
           or coalesce(last_error, '') <> ''
         )`
    ),
    client.query(
      `select count(*)::int as recent_audit_events
       from admin_audit_events
       where created_at >= now() - interval '7 days'`
    ),
    client.query(
      `select
         count(*) filter (where first_seen_at >= now() - interval '24 hours')::int as new_users_24h,
         count(*) filter (where first_seen_at >= now() - interval '7 days')::int as new_users_7d,
         count(*) filter (where linked_at >= now() - interval '24 hours')::int as connected_24h,
         count(*) filter (where linked_at >= now() - interval '7 days')::int as connected_7d
       from linkedin_accounts
       full outer join users on linkedin_accounts.user_id = users.id`
    ),
    client.query(
      `select
         count(*) filter (where visibility_status = 'listed' and profile_state = 'active' and created_at >= now() - interval '24 hours')::int as listed_24h,
         count(*) filter (where visibility_status = 'listed' and profile_state = 'active' and created_at >= now() - interval '7 days')::int as listed_7d,
         count(*) filter (where profile_state = 'active' and coalesce(visibility_status, 'hidden') = 'hidden' and created_at >= now() - interval '7 days')::int as ready_hidden_7d
       from member_profiles`
    ),
    client.query(
      `select
         count(*) filter (where created_at >= now() - interval '24 hours')::int as intros_24h,
         count(*) filter (where created_at >= now() - interval '7 days')::int as intros_7d,
         count(*) filter (where status = 'accepted' and updated_at >= now() - interval '24 hours')::int as accepted_24h,
         count(*) filter (where status = 'accepted' and updated_at >= now() - interval '7 days')::int as accepted_7d,
         count(*) filter (where status = 'declined' and updated_at >= now() - interval '24 hours')::int as declined_24h,
         count(*) filter (where status = 'declined' and updated_at >= now() - interval '7 days')::int as declined_7d,
         count(*) filter (where status = 'pending' and created_at <= now() - interval '24 hours')::int as pending_older_24h,
         count(*) filter (where status = 'pending' and created_at <= now() - interval '72 hours')::int as pending_older_72h
       from intro_requests`
    ),
    client.query(
      `${buildDeliveryBaseCte()}
       select
         count(*) filter (where operator_bucket in ('failed', 'retry_due', 'exhausted') and created_at >= now() - interval '24 hours')::int as failures_24h,
         count(*) filter (where operator_bucket in ('failed', 'retry_due', 'exhausted') and created_at >= now() - interval '7 days')::int as failures_7d,
         count(*) filter (where delivered_at is not null and delivered_at >= now() - interval '24 hours')::int as delivered_24h,
         count(*) filter (where delivered_at is not null and delivered_at >= now() - interval '7 days')::int as delivered_7d
       from delivery_base`
    ),
    client.query(
      `select
         count(*) filter (where event_type = 'broadcast' and coalesce(sent_at, created_at) >= now() - interval '7 days')::int as broadcasts_7d,
         coalesce(sum(delivered_count) filter (where event_type = 'broadcast' and coalesce(sent_at, created_at) >= now() - interval '7 days'), 0)::int as broadcast_delivered_7d,
         coalesce(sum(failed_count) filter (where event_type = 'broadcast' and coalesce(sent_at, created_at) >= now() - interval '7 days'), 0)::int as broadcast_failed_7d,
         count(*) filter (where event_type = 'direct' and created_at >= now() - interval '24 hours')::int as direct_24h,
         count(*) filter (where event_type = 'direct' and created_at >= now() - interval '7 days')::int as direct_7d,
         count(*) filter (
           where created_at >= now() - interval '24 hours'
             and (
               coalesce(failed_count, 0) > 0
               or status in ('failed', 'sent_with_failures', 'partial')
               or coalesce(last_error, '') <> ''
             )
         )::int as outbox_failures_24h,
         count(*) filter (
           where created_at >= now() - interval '7 days'
             and (
               coalesce(failed_count, 0) > 0
               or status in ('failed', 'sent_with_failures', 'partial')
               or coalesce(last_error, '') <> ''
             )
         )::int as outbox_failures_7d
       from admin_comm_outbox`
    ),
    client.query(
      `select
         count(*) filter (where created_at >= now() - interval '24 hours')::int as operator_actions_24h,
         count(*) filter (where created_at >= now() - interval '7 days')::int as operator_actions_7d,
         count(*) filter (where event_type in ('admin_listing_hidden', 'admin_listing_unhidden') and created_at >= now() - interval '7 days')::int as listing_changes_7d,
         count(*) filter (where event_type = 'linkedin_relink_transferred' and created_at >= now() - interval '7 days')::int as relinks_7d
       from admin_audit_events`
    )
  ]);

  const users = usersResult.rows[0] || {};
  const quality = qualityResult.rows[0] || {};
  const intros = introsResult.rows[0] || {};
  const delivery = deliveryResult.rows[0] || {};
  const latestBroadcast = Array.isArray(latestBroadcastRows) ? (latestBroadcastRows[0] || null) : null;
  const recentDirectMessages = recentDirectResult.rows[0]?.recent_direct_messages || 0;
  const recentOutboxFailures = recentOutboxFailuresResult.rows[0]?.recent_outbox_failures || 0;
  const recentAuditEvents = recentAuditResult.rows[0]?.recent_audit_events || 0;
  const userTrends = trendUsersResult.rows[0] || {};
  const profileTrends = trendProfilesResult.rows[0] || {};
  const introTrends = trendIntrosResult.rows[0] || {};
  const deliveryTrends = trendDeliveryResult.rows[0] || {};
  const commsTrends = trendCommsResult.rows[0] || {};
  const auditTrends = trendAuditResult.rows[0] || {};

  return {
    home: {
      totalUsers: users.total_users || 0,
      listedUsers: users.listed_users || 0,
      pendingIntros: intros.pending_intros || 0,
      failedDeliveries: delivery.failed_deliveries || 0,
      activeNotice: Boolean(noticeState?.isActive),
      latestBroadcastStatus: latestBroadcast?.status || 'none',
      newUsers24h: userTrends.new_users_24h || 0,
      newUsers7d: userTrends.new_users_7d || 0,
      connected24h: userTrends.connected_24h || 0,
      connected7d: userTrends.connected_7d || 0,
      listed24h: profileTrends.listed_24h || 0,
      listed7d: profileTrends.listed_7d || 0,
      intros24h: introTrends.intros_24h || 0,
      intros7d: introTrends.intros_7d || 0,
      accepted7d: introTrends.accepted_7d || 0,
      declined7d: introTrends.declined_7d || 0,
      pendingOlder24h: introTrends.pending_older_24h || 0,
      failures24h: deliveryTrends.failures_24h || 0,
      failures7d: deliveryTrends.failures_7d || 0,
      exhaustedNow: delivery.exhausted || 0,
      broadcasts7d: commsTrends.broadcasts_7d || 0,
      directMessages7d: commsTrends.direct_7d || 0
    },
    operations: {
      totalUsers: users.total_users || 0,
      readyNotListed: users.ready_not_listed || 0,
      listedIncomplete: quality.listed_incomplete || 0,
      pendingIntros: intros.pending_intros || 0,
      staleIntros: intros.stale_intros || 0,
      deliveryIssues: delivery.delivery_issues || 0,
      connectedNoProfile: totalCountsOr(users.connected_no_profile_count),
      readyNoSkills: totalCountsOr(quality.ready_no_skills_count),
      listedActive: totalCountsOr(quality.listed_active_count),
      listedInactive: totalCountsOr(quality.listed_inactive_count),
      noIntroYet: totalCountsOr(quality.no_intro_yet_count),
      recentRelinks7d: auditTrends.relinks_7d || 0,
      newIntros24h: introTrends.intros_24h || 0,
      accepted7d: introTrends.accepted_7d || 0,
      declined7d: introTrends.declined_7d || 0,
      pendingOlder24h: introTrends.pending_older_24h || 0
    },
    communications: {
      activeNotice: Boolean(noticeState?.isActive),
      draftBroadcastReady: Boolean(broadcastDraft?.body),
      latestBroadcastStatus: latestBroadcast?.status || 'none',
      recentDirectMessages,
      recentOutboxFailures,
      directMessages24h: commsTrends.direct_24h || 0,
      directMessages7d: commsTrends.direct_7d || 0,
      broadcasts7d: commsTrends.broadcasts_7d || 0,
      broadcastDeliveredRecipients7d: commsTrends.broadcast_delivered_7d || 0,
      broadcastFailedRecipients7d: commsTrends.broadcast_failed_7d || 0,
      outboxFailures24h: commsTrends.outbox_failures_24h || 0,
      outboxFailures7d: commsTrends.outbox_failures_7d || 0,
      latestBroadcastRecipients: latestBroadcast?.estimated_recipient_count || 0,
      latestBroadcastDelivered: latestBroadcast?.delivered_count || 0,
      latestBroadcastFailed: latestBroadcast?.failed_count || 0
    },
    system: {
      retryDue: delivery.retry_due || 0,
      exhausted: delivery.exhausted || 0,
      recentAuditEvents,
      failedDeliveries: delivery.failed_deliveries || 0,
      failures24h: deliveryTrends.failures_24h || 0,
      failures7d: deliveryTrends.failures_7d || 0,
      delivered24h: deliveryTrends.delivered_24h || 0,
      delivered7d: deliveryTrends.delivered_7d || 0,
      operatorActions24h: auditTrends.operator_actions_24h || 0,
      operatorActions7d: auditTrends.operator_actions_7d || 0,
      listingChanges7d: auditTrends.listing_changes_7d || 0,
      relinks7d: auditTrends.relinks_7d || 0
    }
  };
}


function buildSearchLike(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return `%${normalized.replace(/\s+/g, ' ')}%`;
}

function buildSearchId(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function searchAdminUsersPage(client, { queryText, page = 0, pageSize = 8 } = {}) {
  const normalizedPage = Number.isFinite(page) && page >= 0 ? page : 0;
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 20) : 8;
  const query = typeof queryText === 'string' ? queryText.trim() : '';
  const like = buildSearchLike(query);
  const exactId = buildSearchId(query);
  const searchWhere = `($1::bigint is not null and (user_id = $1 or telegram_user_id = $1)) or lower(coalesce(telegram_username, '')) like $2 or lower(coalesce(display_name, '')) like $2 or lower(coalesce(linkedin_name, '')) like $2 or lower(coalesce(headline_user, '')) like $2 or lower(coalesce(linkedin_public_url, '')) like $2 or lower(coalesce(company_user, '')) like $2`;
  const countResult = await client.query(`${buildUsersBaseCte()} select count(*)::int as total_count from user_base where ${searchWhere}`, [exactId, like]);
  const totalCount = countResult.rows[0]?.total_count || 0;
  const offset = normalizedPage * normalizedPageSize;
  const result = await client.query(`${buildUsersBaseCte()} select * from user_base where ${searchWhere} order by last_seen_at desc nulls last, user_id desc limit $3 offset $4`, [exactId, like, normalizedPageSize + 1, offset]);
  const rows = (result.rows || []).slice(0, normalizedPageSize);
  return {
    scopeKey: 'users',
    queryText: query,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalCount,
    hasPrev: normalizedPage > 0,
    hasNext: offset + normalizedPageSize < totalCount,
    results: rows.map((row) => ({
      userId: row.user_id,
      telegramUserId: row.telegram_user_id,
      telegramUsername: row.telegram_username,
      hasLinkedIn: Boolean(row.has_linkedin),
      displayName: row.display_name,
      linkedinName: row.linkedin_name,
      visibilityStatus: row.visibility_status,
      profileState: row.profile_state,
      headlineUser: row.headline_user,
      companyUser: row.company_user,
      pendingIntroCount: row.pending_intro_count || 0
    }))
  };
}

export async function searchAdminIntrosPage(client, { queryText, page = 0, pageSize = 8 } = {}) {
  const normalizedPage = Number.isFinite(page) && page >= 0 ? page : 0;
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 20) : 8;
  const query = typeof queryText === 'string' ? queryText.trim() : '';
  const like = buildSearchLike(query);
  const exactId = buildSearchId(query);
  const searchWhere = `($1::bigint is not null and intro_request_id = $1) or lower(coalesce(requester_display_name, '')) like $2 or lower(coalesce(target_display_name, '')) like $2 or lower(coalesce(requester_headline_user, '')) like $2 or lower(coalesce(target_headline_user, '')) like $2`;
  const countResult = await client.query(`${buildIntroBaseCte()} select count(*)::int as total_count from intro_base where ${searchWhere}`, [exactId, like]);
  const totalCount = countResult.rows[0]?.total_count || 0;
  const offset = normalizedPage * normalizedPageSize;
  const result = await client.query(`${buildIntroBaseCte()} select * from intro_base where ${searchWhere} order by updated_at desc, intro_request_id desc limit $3 offset $4`, [exactId, like, normalizedPageSize + 1, offset]);
  const rows = (result.rows || []).slice(0, normalizedPageSize);
  return {
    scopeKey: 'intros', queryText: query, page: normalizedPage, pageSize: normalizedPageSize, totalCount,
    hasPrev: normalizedPage > 0, hasNext: offset + normalizedPageSize < totalCount,
    results: rows.map((row) => ({
      introRequestId: row.intro_request_id,
      requesterUserId: row.requester_user_id,
      targetUserId: row.target_user_id,
      requesterDisplayName: row.requester_display_name,
      targetDisplayName: row.target_display_name,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deliveryProblemCount: row.delivery_problem_count || 0
    }))
  };
}

export async function searchAdminDeliveryPage(client, { queryText, page = 0, pageSize = 8 } = {}) {
  const normalizedPage = Number.isFinite(page) && page >= 0 ? page : 0;
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 20) : 8;
  const query = typeof queryText === 'string' ? queryText.trim() : '';
  const like = buildSearchLike(query);
  const exactId = buildSearchId(query);
  const searchWhere = `($1::bigint is not null and (notification_receipt_id = $1 or intro_request_id = $1 or recipient_telegram_user_id = $1)) or lower(coalesce(recipient_display_name, '')) like $2 or lower(coalesce(requester_display_name, '')) like $2 or lower(coalesce(target_display_name, '')) like $2 or lower(coalesce(last_error_code, '')) like $2 or lower(coalesce(error_message, '')) like $2`;
  const countResult = await client.query(`${buildDeliveryBaseCte()} select count(*)::int as total_count from delivery_base where ${searchWhere}`, [exactId, like]);
  const totalCount = countResult.rows[0]?.total_count || 0;
  const offset = normalizedPage * normalizedPageSize;
  const result = await client.query(`${buildDeliveryBaseCte()} select * from delivery_base where ${searchWhere} order by coalesce(last_attempt_at, delivered_at, created_at) desc, notification_receipt_id desc limit $3 offset $4`, [exactId, like, normalizedPageSize + 1, offset]);
  const rows = (result.rows || []).slice(0, normalizedPageSize);
  return {
    scopeKey: 'delivery', queryText: query, page: normalizedPage, pageSize: normalizedPageSize, totalCount,
    hasPrev: normalizedPage > 0, hasNext: offset + normalizedPageSize < totalCount,
    results: rows.map((row) => ({
      notificationReceiptId: row.notification_receipt_id,
      introRequestId: row.intro_request_id,
      recipientUserId: row.recipient_user_id,
      recipientDisplayName: row.recipient_display_name,
      operatorBucket: row.operator_bucket,
      attemptCount: row.attempt_count || 0,
      maxAttempts: row.max_attempts || 0,
      lastErrorCode: row.last_error_code,
      errorMessage: row.error_message,
      requesterDisplayName: row.requester_display_name,
      targetDisplayName: row.target_display_name
    }))
  };
}

export async function searchAdminOutboxPage(client, { queryText, page = 0, pageSize = 8 } = {}) {
  const normalizedPage = Number.isFinite(page) && page >= 0 ? page : 0;
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 20) : 8;
  const query = typeof queryText === 'string' ? queryText.trim() : '';
  const like = buildSearchLike(query);
  const exactId = buildSearchId(query);
  const searchWhere = `($1::bigint is not null and o.id = $1) or lower(coalesce(o.event_type, '')) like $2 or lower(coalesce(o.audience_key, '')) like $2 or lower(coalesce(o.body, '')) like $2 or lower(coalesce(target_profile.display_name, '')) like $2 or lower(coalesce(target.telegram_username, '')) like $2 or lower(coalesce(o.status, '')) like $2`;
  const select = `${buildOutboxRecordSelect()} where ${searchWhere}`;
  const countResult = await client.query(`select count(*)::int as total_count from (${select}) q`, [exactId, like]);
  const totalCount = countResult.rows[0]?.total_count || 0;
  const offset = normalizedPage * normalizedPageSize;
  const result = await client.query(`${select} order by o.created_at desc, o.id desc limit $3 offset $4`, [exactId, like, normalizedPageSize + 1, offset]);
  const rows = (result.rows || []).slice(0, normalizedPageSize);
  return { scopeKey: 'outbox', queryText: query, page: normalizedPage, pageSize: normalizedPageSize, totalCount, hasPrev: normalizedPage > 0, hasNext: offset + normalizedPageSize < totalCount, results: rows };
}

export async function searchAdminAuditPage(client, { queryText, page = 0, pageSize = 8 } = {}) {
  const normalizedPage = Number.isFinite(page) && page >= 0 ? page : 0;
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 20) : 8;
  const query = typeof queryText === 'string' ? queryText.trim() : '';
  const like = buildSearchLike(query);
  const exactId = buildSearchId(query);
  const from = `from admin_audit_events e
      left join users actor on actor.id = e.actor_user_id
      left join member_profiles actor_profile on actor_profile.user_id = actor.id
      left join users target on target.id = e.target_user_id
      left join member_profiles target_profile on target_profile.user_id = target.id`;
  const where = `where (($1::bigint is not null and (e.id = $1 or e.target_user_id = $1 or e.actor_user_id = $1 or e.intro_request_id = $1 or e.notification_receipt_id = $1)) or lower(coalesce(e.event_type, '')) like $2 or lower(coalesce(e.summary, '')) like $2 or lower(coalesce(actor.telegram_username, '')) like $2 or lower(coalesce(actor_profile.display_name, '')) like $2 or lower(coalesce(target.telegram_username, '')) like $2 or lower(coalesce(target_profile.display_name, '')) like $2)`;
  const countResult = await client.query(`select count(*)::int as total_count ${from} ${where}`, [exactId, like]);
  const totalCount = countResult.rows[0]?.total_count || 0;
  const offset = normalizedPage * normalizedPageSize;
  const result = await client.query(`select e.id, e.event_type, e.summary, e.created_at, e.target_user_id, e.intro_request_id, e.notification_receipt_id, actor.telegram_username as actor_telegram_username, actor_profile.display_name as actor_display_name, target.telegram_username as target_telegram_username, target_profile.display_name as target_display_name ${from} ${where} order by e.created_at desc, e.id desc limit $3 offset $4`, [exactId, like, normalizedPageSize + 1, offset]);
  const rows = (result.rows || []).slice(0, normalizedPageSize);
  return { scopeKey: 'audit', queryText: query, page: normalizedPage, pageSize: normalizedPageSize, totalCount, hasPrev: normalizedPage > 0, hasNext: offset + normalizedPageSize < totalCount, results: rows };
}

function totalCountsOr(value) {
  return value || 0;
}

export async function listAdminQualityPage(client, { segmentKey = 'listinc', page = 0, pageSize = 8 } = {}) {
  const segment = normalizeAdminQualitySegment(segmentKey);
  const normalizedPage = Number.isFinite(page) && page >= 0 ? page : 0;
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 20) : 8;
  const whereClause = buildQualitySegmentWhereClause(segment);

  const countsResult = await client.query(
    `${buildQualityBaseCte()}
     select
       count(*) filter (where listed_incomplete)::int as listed_incomplete_count,
       count(*) filter (where ready_not_listed)::int as ready_not_listed_count,
       count(*) filter (where missing_critical)::int as missing_critical_count,
       count(*) filter (where duplicate_like)::int as duplicate_like_count,
       count(*) filter (where user_id in (select distinct coalesce(target_user_id, actor_user_id) from admin_audit_events where event_type = 'linkedin_relink_transferred'))::int as relink_count
     from quality_base`
  );
  const counts = countsResult.rows[0] || {};

  const totalCountResult = await client.query(
    `${buildQualityBaseCte()}
     select count(*)::int as total_count
     from quality_base
     where ${whereClause}`
  );
  const totalCount = totalCountResult.rows[0]?.total_count || 0;
  const offset = normalizedPage * normalizedPageSize;

  const result = await client.query(
    `${buildQualityBaseCte()}
     select *
     from quality_base
     where ${whereClause}
     order by last_seen_at desc nulls last, user_id desc
     limit $1 offset $2`,
    [normalizedPageSize + 1, offset]
  );
  const rows = (result.rows || []).slice(0, normalizedPageSize);
  return {
    segmentKey: segment,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    totalCount,
    hasPrev: normalizedPage > 0,
    hasNext: offset + normalizedPageSize < totalCount,
    counts: {
      listedIncomplete: counts.listed_incomplete_count || 0,
      readyNotListed: counts.ready_not_listed_count || 0,
      missingCritical: counts.missing_critical_count || 0,
      duplicateLike: counts.duplicate_like_count || 0,
      relink: counts.relink_count || 0
    },
    users: rows.map((row) => ({
      userId: row.user_id,
      telegramUserId: row.telegram_user_id,
      telegramUsername: row.telegram_username,
      displayName: row.display_name,
      linkedinName: row.linkedin_name,
      headlineUser: row.headline_user,
      companyUser: row.company_user,
      cityUser: row.city_user,
      industryUser: row.industry_user,
      linkedinPublicUrl: row.linkedin_public_url,
      visibilityStatus: row.visibility_status,
      profileState: row.profile_state,
      skillsCount: row.skills_count || 0,
      pendingIntroCount: row.pending_intro_count || 0,
      duplicateLike: Boolean(row.duplicate_like),
      listedIncomplete: Boolean(row.listed_incomplete),
      missingCritical: Boolean(row.missing_critical),
      readyNotListed: Boolean(row.ready_not_listed),
      lastSeenAt: row.last_seen_at
    }))
  };
}

function buildAuditSegmentWhereClause(segmentKey) {
  switch (normalizeAdminAuditSegment(segmentKey)) {
    case 'not':
      return "event_type in ('admin_notice_activated', 'admin_notice_disabled')";
    case 'bc':
      return "event_type in ('admin_broadcast_sent', 'admin_broadcast_failed')";
    case 'user':
      return "event_type in ('admin_listing_hidden', 'admin_listing_unhidden', 'admin_user_note_updated', 'admin_direct_message_sent', 'admin_direct_message_failed')";
    case 'relink':
      return "event_type = 'linkedin_relink_transferred'";
    case 'all':
    default:
      return 'true';
  }
}

export async function createAdminAuditEvent(client, {
  eventType,
  actorUserId = null,
  targetUserId = null,
  secondaryTargetUserId = null,
  introRequestId = null,
  notificationReceiptId = null,
  summary = '',
  detail = null
}) {
  const result = await client.query(
    `
      insert into admin_audit_events (
        event_type,
        actor_user_id,
        target_user_id,
        secondary_target_user_id,
        intro_request_id,
        notification_receipt_id,
        summary,
        detail,
        created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, now())
      returning id
    `,
    [eventType, actorUserId, targetUserId, secondaryTargetUserId, introRequestId, notificationReceiptId, summary || '', detail ? JSON.stringify(detail) : null]
  );
  return result.rows[0]?.id || null;
}

export async function listAdminAuditPage(client, { segmentKey = 'all', page = 0, pageSize = 10, targetUserId = null } = {}) {
  const segment = normalizeAdminAuditSegment(segmentKey);
  const normalizedPage = Number.isFinite(page) && page >= 0 ? page : 0;
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 20) : 10;
  const whereClause = buildAuditSegmentWhereClause(segment);
  const targetUserFilter = Number.isFinite(targetUserId) && targetUserId > 0 ? targetUserId : null;

  const totalCountResult = await client.query(
    `select count(*)::int as total_count
     from admin_audit_events
     where ${whereClause}
       and ($1::bigint is null or actor_user_id = $1 or target_user_id = $1 or secondary_target_user_id = $1)`,
    [targetUserFilter]
  );
  const totalCount = totalCountResult.rows[0]?.total_count || 0;
  const offset = normalizedPage * normalizedPageSize;

  const result = await client.query(
    `
      select
        e.id,
        e.event_type,
        e.summary,
        e.detail,
        e.created_at,
        e.actor_user_id,
        e.target_user_id,
        e.secondary_target_user_id,
        e.intro_request_id,
        e.notification_receipt_id,
        actor.telegram_user_id as actor_telegram_user_id,
        actor.telegram_username as actor_telegram_username,
        actor_profile.display_name as actor_display_name,
        target.telegram_user_id as target_telegram_user_id,
        target.telegram_username as target_telegram_username,
        target_profile.display_name as target_display_name,
        secondary.telegram_user_id as secondary_target_telegram_user_id,
        secondary.telegram_username as secondary_target_telegram_username,
        secondary_profile.display_name as secondary_target_display_name
      from admin_audit_events e
      left join users actor on actor.id = e.actor_user_id
      left join member_profiles actor_profile on actor_profile.user_id = actor.id
      left join users target on target.id = e.target_user_id
      left join member_profiles target_profile on target_profile.user_id = target.id
      left join users secondary on secondary.id = e.secondary_target_user_id
      left join member_profiles secondary_profile on secondary_profile.user_id = secondary.id
      where ${whereClause}
        and ($3::bigint is null or e.actor_user_id = $3 or e.target_user_id = $3 or e.secondary_target_user_id = $3)
      order by e.created_at desc, e.id desc
      limit $1 offset $2
    `,
    [normalizedPageSize + 1, offset, targetUserFilter]
  );
  const rows = (result.rows || []).slice(0, normalizedPageSize);
  return {
    segmentKey: segment,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    targetUserId: targetUserFilter,
    totalCount,
    hasPrev: normalizedPage > 0,
    hasNext: offset + normalizedPageSize < totalCount,
    counts: {
      all: totalCount
    },
    records: rows
  };
}

export async function getAdminAuditRecordById(client, { auditId }) {
  const result = await client.query(
    `
      select
        e.id,
        e.event_type,
        e.summary,
        e.detail,
        e.created_at,
        e.actor_user_id,
        e.target_user_id,
        e.secondary_target_user_id,
        e.intro_request_id,
        e.notification_receipt_id,
        actor.telegram_user_id as actor_telegram_user_id,
        actor.telegram_username as actor_telegram_username,
        actor_profile.display_name as actor_display_name,
        target.telegram_user_id as target_telegram_user_id,
        target.telegram_username as target_telegram_username,
        target_profile.display_name as target_display_name,
        secondary.telegram_user_id as secondary_target_telegram_user_id,
        secondary.telegram_username as secondary_target_telegram_username,
        secondary_profile.display_name as secondary_target_display_name
      from admin_audit_events e
      left join users actor on actor.id = e.actor_user_id
      left join member_profiles actor_profile on actor_profile.user_id = actor.id
      left join users target on target.id = e.target_user_id
      left join member_profiles target_profile on target_profile.user_id = target.id
      left join users secondary on secondary.id = e.secondary_target_user_id
      left join member_profiles secondary_profile on secondary_profile.user_id = secondary.id
      where e.id = $1
      limit 1
    `,
    [auditId]
  );
  return result.rows[0] || null;
}

export async function listAdminIntrosPage(client, { segmentKey = 'all', page = 0, pageSize = 8, targetUserId = null } = {}) {
  const segment = normalizeAdminIntroSegment(segmentKey);
  const normalizedPage = Number.isFinite(page) && page >= 0 ? page : 0;
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 20) : 8;
  const whereClause = buildIntroSegmentWhereClause(segment);
  const targetUserFilter = Number.isFinite(targetUserId) && targetUserId > 0 ? targetUserId : null;

  const countsResult = await client.query(
    `${buildIntroBaseCte()}
     select
       count(*)::int as total_count,
       count(*) filter (where status = 'pending')::int as pending_count,
       count(*) filter (where status = 'pending' and created_at <= now() - interval '24 hours')::int as pending_24h_count,
       count(*) filter (where status = 'accepted')::int as accepted_count,
       count(*) filter (where status = 'accepted' and updated_at >= now() - interval '7 days')::int as accepted_recent_count,
       count(*) filter (where status = 'declined')::int as declined_count,
       count(*) filter (where status = 'declined' and updated_at >= now() - interval '7 days')::int as declined_recent_count,
       count(*) filter (where status = 'pending' and created_at <= now() - interval '72 hours')::int as stale_count,
       count(*) filter (where delivery_problem_count > 0)::int as failed_notify_count
     from intro_base
     where ($1::bigint is null or requester_user_id = $1 or target_user_id = $1)`,
    [targetUserFilter]
  );
  const counts = countsResult.rows[0] || {};

  const totalCountResult = await client.query(
    `${buildIntroBaseCte()}
     select count(*)::int as total_count
     from intro_base
     where ($1::bigint is null or requester_user_id = $1 or target_user_id = $1)
       and ${whereClause}`,
    [targetUserFilter]
  );
  const totalCount = totalCountResult.rows[0]?.total_count || 0;
  const offset = normalizedPage * normalizedPageSize;

  const result = await client.query(
    `${buildIntroBaseCte()}
     select *
     from intro_base
     where ($3::bigint is null or requester_user_id = $3 or target_user_id = $3)
       and ${whereClause}
     order by updated_at desc, intro_request_id desc
     limit $1 offset $2`,
    [normalizedPageSize + 1, offset, targetUserFilter]
  );

  const rows = (result.rows || []).slice(0, normalizedPageSize);
  return {
    segmentKey: segment,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    targetUserId: targetUserFilter,
    totalCount,
    hasPrev: normalizedPage > 0,
    hasNext: offset + normalizedPageSize < totalCount,
    counts: {
      total: counts.total_count || 0,
      pending: counts.pending_count || 0,
      pending24h: counts.pending_24h_count || 0,
      accepted: counts.accepted_count || 0,
      acceptedRecent: counts.accepted_recent_count || 0,
      declined: counts.declined_count || 0,
      declinedRecent: counts.declined_recent_count || 0,
      stale: counts.stale_count || 0,
      failedNotify: counts.failed_notify_count || 0
    },
    intros: rows.map((row) => ({
      introRequestId: row.intro_request_id,
      requesterUserId: row.requester_user_id,
      targetUserId: row.target_user_id,
      targetProfileId: row.target_profile_id,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      requesterDisplayName: row.requester_display_name,
      requesterHeadlineUser: row.requester_headline_user,
      requesterLinkedinPublicUrl: row.requester_linkedin_public_url,
      targetDisplayName: row.target_display_name,
      targetHeadlineUser: row.target_headline_user,
      targetLinkedinPublicUrl: row.target_linkedin_public_url,
      deliveryProblemCount: row.delivery_problem_count || 0
    }))
  };
}

export async function getAdminIntroDetailById(client, { introRequestId }) {
  const result = await client.query(
    `${buildIntroBaseCte()}
     select *
     from intro_base
     where intro_request_id = $1
     limit 1`,
    [introRequestId]
  );

  const row = result.rows[0] || null;
  if (!row) {
    return null;
  }

  return {
    intro_request_id: row.intro_request_id,
    requester_user_id: row.requester_user_id,
    requester_telegram_user_id: row.requester_telegram_user_id,
    requester_telegram_username: row.requester_telegram_username,
    requester_display_name: row.requester_display_name,
    requester_headline_user: row.requester_headline_user,
    requester_linkedin_public_url: row.requester_linkedin_public_url,
    requester_profile_id: row.requester_profile_id,
    target_user_id: row.target_user_id,
    target_telegram_user_id: row.target_telegram_user_id,
    target_telegram_username: row.target_telegram_username,
    target_display_name: row.target_display_name,
    target_headline_user: row.target_headline_user,
    target_linkedin_public_url: row.target_linkedin_public_url,
    target_profile_id: row.target_profile_id_current,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    delivery_problem_count: row.delivery_problem_count || 0
  };
}

export async function listAdminDeliveryPage(client, { segmentKey = 'all', page = 0, pageSize = 8, introRequestId = null } = {}) {
  const segment = normalizeAdminDeliverySegment(segmentKey);
  const normalizedPage = Number.isFinite(page) && page >= 0 ? page : 0;
  const normalizedPageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.min(pageSize, 20) : 8;
  const whereClause = buildDeliverySegmentWhereClause(segment);
  const introFilter = Number.isFinite(introRequestId) && introRequestId > 0 ? introRequestId : null;

  const countsResult = await client.query(
    `${buildDeliveryBaseCte()}
     select
       count(*)::int as total_count,
       count(*) filter (where operator_bucket = 'failed')::int as failed_count,
       count(*) filter (where operator_bucket = 'retry_due')::int as retry_due_count,
       count(*) filter (where operator_bucket = 'exhausted')::int as exhausted_count,
       count(*) filter (where operator_bucket = 'sent')::int as sent_count
     from delivery_base
     where ($1::bigint is null or intro_request_id = $1)`,
    [introFilter]
  );
  const counts = countsResult.rows[0] || {};

  const totalCountResult = await client.query(
    `${buildDeliveryBaseCte()}
     select count(*)::int as total_count
     from delivery_base
     where ($1::bigint is null or intro_request_id = $1)
       and ${whereClause}`,
    [introFilter]
  );
  const totalCount = totalCountResult.rows[0]?.total_count || 0;
  const offset = normalizedPage * normalizedPageSize;

  const result = await client.query(
    `${buildDeliveryBaseCte()}
     select *
     from delivery_base
     where ($3::bigint is null or intro_request_id = $3)
       and ${whereClause}
     order by coalesce(last_attempt_at, delivered_at, created_at) desc, notification_receipt_id desc
     limit $1 offset $2`,
    [normalizedPageSize + 1, offset, introFilter]
  );

  const rows = (result.rows || []).slice(0, normalizedPageSize);
  return {
    segmentKey: segment,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    introRequestId: introFilter,
    targetUserId: targetUserFilter,
    totalCount,
    hasPrev: normalizedPage > 0,
    hasNext: offset + normalizedPageSize < totalCount,
    counts: {
      total: counts.total_count || 0,
      failed: counts.failed_count || 0,
      retryDue: counts.retry_due_count || 0,
      exhausted: counts.exhausted_count || 0,
      sent: counts.sent_count || 0
    },
    records: rows.map((row) => ({
      notificationReceiptId: row.notification_receipt_id,
      eventKey: row.event_key,
      eventType: row.event_type,
      introRequestId: row.intro_request_id,
      recipientUserId: row.recipient_user_id,
      recipientTelegramUserId: row.recipient_telegram_user_id,
      recipientDisplayName: row.recipient_display_name,
      operatorBucket: row.operator_bucket,
      deliveryStatus: row.delivery_status,
      attemptCount: row.attempt_count || 0,
      maxAttempts: row.max_attempts || 0,
      nextAttemptAt: row.next_attempt_at,
      lastAttemptAt: row.last_attempt_at,
      deliveredAt: row.delivered_at,
      createdAt: row.created_at,
      lastErrorCode: row.last_error_code,
      errorMessage: row.error_message,
      requesterUserId: row.requester_user_id,
      targetUserId: row.target_user_id,
      requesterDisplayName: row.requester_display_name,
      targetDisplayName: row.target_display_name
    }))
  };
}

export async function getAdminDeliveryRecordById(client, { notificationReceiptId }) {
  const result = await client.query(
    `${buildDeliveryBaseCte()}
     select *
     from delivery_base
     where notification_receipt_id = $1
     limit 1`,
    [notificationReceiptId]
  );

  const row = result.rows[0] || null;
  if (!row) {
    return null;
  }

  return {
    notification_receipt_id: row.notification_receipt_id,
    event_key: row.event_key,
    event_type: row.event_type,
    intro_request_id: row.intro_request_id,
    recipient_user_id: row.recipient_user_id,
    recipient_telegram_user_id: row.recipient_telegram_user_id,
    recipient_display_name: row.recipient_display_name,
    operator_bucket: row.operator_bucket,
    delivery_status: row.delivery_status,
    attempt_count: row.attempt_count || 0,
    max_attempts: row.max_attempts || 0,
    next_attempt_at: row.next_attempt_at,
    last_attempt_at: row.last_attempt_at,
    delivered_at: row.delivered_at,
    sent_message_id: row.sent_message_id || null,
    created_at: row.created_at,
    last_error_code: row.last_error_code,
    error_message: row.error_message,
    requester_user_id: row.requester_user_id,
    target_user_id: row.target_user_id,
    requester_display_name: row.requester_display_name,
    target_display_name: row.target_display_name
  };
}
