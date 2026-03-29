function normalizeDmThreadRow(row, role, detail = null) {
  if (!row) {
    return null;
  }

  return {
    dm_thread_id: row.dm_thread_id,
    initiator_user_id: row.initiator_user_id,
    recipient_user_id: row.recipient_user_id,
    target_profile_id: row.target_profile_id || null,
    status: row.status,
    payment_state: row.payment_state,
    price_stars_snapshot: row.price_stars_snapshot,
    first_message_text: row.first_message_text || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    delivered_at: row.delivered_at,
    accepted_at: row.accepted_at,
    declined_at: row.declined_at,
    blocked_at: row.blocked_at,
    closed_at: row.closed_at,
    last_message_at: row.last_message_at,
    last_sender_user_id: row.last_sender_user_id || null,
    counterpart_profile_id: row.counterpart_profile_id || null,
    display_name: row.display_name,
    headline_user: row.headline_user,
    role,
    blocked_by_user_id: row.blocked_by_user_id || null,
    reported_by_user_id: row.reported_by_user_id || null,
    ...(detail ? { messages: detail.messages || [] } : {})
  };
}

async function createDmEvent(client, { threadId, actorUserId = null, eventType, detail = null }) {
  await client.query(
    `
      insert into member_dm_events (thread_id, actor_user_id, event_type, detail_json)
      values ($1, $2, $3, $4::jsonb)
    `,
    [threadId, actorUserId, eventType, detail ? JSON.stringify(detail) : null]
  );
}

async function loadDmCounterpartyRow(client, targetProfileId) {
  const result = await client.query(
    `
      select
        mp.id as profile_id,
        mp.user_id as target_user_id,
        mp.visibility_status,
        mp.profile_state,
        coalesce(nullif(mp.display_name, ''), la.full_name, 'Unnamed profile') as display_name,
        mp.headline_user
      from member_profiles mp
      join users u on u.id = mp.user_id
      left join linkedin_accounts la on la.user_id = u.id
      where mp.id = $1
      limit 1
    `,
    [targetProfileId]
  );
  return result.rows[0] || null;
}

async function loadExistingThreadForPair(client, userAId, userBId) {
  const result = await client.query(
    `
      select
        t.id as dm_thread_id,
        t.initiator_user_id,
        t.recipient_user_id,
        t.target_profile_id,
        t.status,
        t.payment_state,
        t.price_stars_snapshot,
        t.first_message_text,
        t.created_at,
        t.updated_at,
        t.delivered_at,
        t.accepted_at,
        t.declined_at,
        t.blocked_at,
        t.closed_at,
        t.last_message_at,
        t.last_sender_user_id,
        t.blocked_by_user_id,
        t.reported_by_user_id,
        case when t.initiator_user_id = $1 then recipient_mp.id else initiator_mp.id end as counterpart_profile_id,
        case when t.initiator_user_id = $1 then coalesce(nullif(recipient_mp.display_name, ''), recipient_la.full_name, 'Unknown member') else coalesce(nullif(initiator_mp.display_name, ''), initiator_la.full_name, 'Unknown member') end as display_name,
        case when t.initiator_user_id = $1 then recipient_mp.headline_user else initiator_mp.headline_user end as headline_user
      from member_dm_threads t
      left join member_profiles initiator_mp on initiator_mp.user_id = t.initiator_user_id
      left join linkedin_accounts initiator_la on initiator_la.user_id = t.initiator_user_id
      left join member_profiles recipient_mp on recipient_mp.user_id = t.recipient_user_id
      left join linkedin_accounts recipient_la on recipient_la.user_id = t.recipient_user_id
      where least(t.initiator_user_id, t.recipient_user_id) = least($1, $2)
        and greatest(t.initiator_user_id, t.recipient_user_id) = greatest($1, $2)
        and t.status in ('draft', 'payment_pending', 'pending_recipient', 'active', 'blocked')
      order by t.id desc
      limit 1
    `,
    [userAId, userBId]
  );

  return result.rows[0] || null;
}

export async function createOrGetDmThreadDraft(client, { initiatorUserId, targetProfileId, priceStars }) {
  const target = await loadDmCounterpartyRow(client, targetProfileId);
  if (!target) {
    return { created: false, blocked: true, duplicate: false, reason: 'target_profile_missing', thread: null, target: null };
  }

  if (String(target.target_user_id) === String(initiatorUserId)) {
    return { created: false, blocked: true, duplicate: false, reason: 'cannot_message_self', thread: null, target };
  }

  if (target.visibility_status !== 'listed' || target.profile_state !== 'active') {
    return { created: false, blocked: true, duplicate: false, reason: 'target_profile_not_public', thread: null, target };
  }

  const existing = await loadExistingThreadForPair(client, initiatorUserId, target.target_user_id);
  if (existing) {
    const duplicateReason = existing.status === 'active'
      ? 'dm_thread_already_active'
      : existing.status === 'blocked'
        ? 'dm_thread_blocked'
        : 'dm_thread_already_exists';

    return {
      created: false,
      blocked: existing.status === 'blocked',
      duplicate: existing.status !== 'blocked',
      reason: duplicateReason,
      thread: normalizeDmThreadRow(existing, String(existing.recipient_user_id) === String(initiatorUserId) ? 'received' : 'sent'),
      target
    };
  }

  const insertResult = await client.query(
    `
      insert into member_dm_threads (
        initiator_user_id,
        recipient_user_id,
        target_profile_id,
        opened_via,
        status,
        payment_state,
        price_stars_snapshot
      )
      values ($1, $2, $3, 'profile_card', 'draft', 'draft', $4)
      returning
        id as dm_thread_id,
        initiator_user_id,
        recipient_user_id,
        target_profile_id,
        status,
        payment_state,
        price_stars_snapshot,
        first_message_text,
        created_at,
        updated_at,
        delivered_at,
        accepted_at,
        declined_at,
        blocked_at,
        closed_at,
        last_message_at,
        last_sender_user_id,
        blocked_by_user_id,
        reported_by_user_id
    `,
    [initiatorUserId, target.target_user_id, target.profile_id, priceStars]
  );

  const inserted = insertResult.rows[0] || null;
  if (inserted?.dm_thread_id) {
    await createDmEvent(client, {
      threadId: inserted.dm_thread_id,
      actorUserId: initiatorUserId,
      eventType: 'dm_request_created',
      detail: { targetProfileId: target.profile_id }
    });
  }

  return {
    created: true,
    blocked: false,
    duplicate: false,
    reason: 'dm_thread_draft_created',
    thread: normalizeDmThreadRow({ ...inserted, counterpart_profile_id: target.profile_id, display_name: target.display_name, headline_user: target.headline_user }, 'sent'),
    target
  };
}

export async function startDmComposeSession(client, { userId, threadId, composeMode, ttlMinutes = 20 }) {
  const result = await client.query(
    `
      insert into member_dm_compose_sessions (user_id, thread_id, compose_mode, expires_at)
      values ($1, $2, $3, now() + ($4::text || ' minutes')::interval)
      on conflict (user_id)
      do update set
        thread_id = excluded.thread_id,
        compose_mode = excluded.compose_mode,
        expires_at = excluded.expires_at,
        updated_at = now()
      returning user_id, thread_id, compose_mode, expires_at, updated_at
    `,
    [userId, threadId, composeMode, String(ttlMinutes)]
  );
  return result.rows[0] || null;
}

export async function getActiveDmComposeSessionByTelegramUserId(client, telegramUserId) {
  const result = await client.query(
    `
      select s.user_id, s.thread_id, s.compose_mode, s.expires_at, s.updated_at
      from member_dm_compose_sessions s
      join users u on u.id = s.user_id
      where u.telegram_user_id = $1
        and s.expires_at > now()
      limit 1
    `,
    [telegramUserId]
  );
  return result.rows[0] || null;
}

export async function clearDmComposeSessionByUserId(client, userId) {
  await client.query('delete from member_dm_compose_sessions where user_id = $1', [userId]);
}

export async function clearExpiredDmComposeSessions(client) {
  await client.query('delete from member_dm_compose_sessions where expires_at <= now()');
}

async function getThreadParticipantEnvelope(client, { threadId, userId }) {
  const result = await client.query(
    `
      select
        t.id as dm_thread_id,
        t.initiator_user_id,
        t.recipient_user_id,
        t.target_profile_id,
        t.status,
        t.payment_state,
        t.price_stars_snapshot,
        t.first_message_text,
        t.created_at,
        t.updated_at,
        t.delivered_at,
        t.accepted_at,
        t.declined_at,
        t.blocked_at,
        t.closed_at,
        t.last_message_at,
        t.last_sender_user_id,
        t.blocked_by_user_id,
        t.reported_by_user_id,
        initiator.telegram_user_id as initiator_telegram_user_id,
        recipient.telegram_user_id as recipient_telegram_user_id,
        case when t.initiator_user_id = $2 then 'sent' when t.recipient_user_id = $2 then 'received' else null end as role,
        case when t.initiator_user_id = $2 then recipient_mp.id else initiator_mp.id end as counterpart_profile_id,
        case when t.initiator_user_id = $2 then coalesce(nullif(recipient_mp.display_name, ''), recipient_la.full_name, 'Unknown member') else coalesce(nullif(initiator_mp.display_name, ''), initiator_la.full_name, 'Unknown member') end as display_name,
        case when t.initiator_user_id = $2 then recipient_mp.headline_user else initiator_mp.headline_user end as headline_user
      from member_dm_threads t
      join users initiator on initiator.id = t.initiator_user_id
      join users recipient on recipient.id = t.recipient_user_id
      left join member_profiles initiator_mp on initiator_mp.user_id = t.initiator_user_id
      left join linkedin_accounts initiator_la on initiator_la.user_id = t.initiator_user_id
      left join member_profiles recipient_mp on recipient_mp.user_id = t.recipient_user_id
      left join linkedin_accounts recipient_la on recipient_la.user_id = t.recipient_user_id
      where t.id = $1
        and ($2 in (t.initiator_user_id, t.recipient_user_id))
      limit 1
    `,
    [threadId, userId]
  );
  return result.rows[0] || null;
}

export async function saveDmFirstMessageDraft(client, { threadId, initiatorUserId, messageText }) {
  const envelope = await getThreadParticipantEnvelope(client, { threadId, userId: initiatorUserId });
  if (!envelope) {
    return { changed: false, blocked: true, reason: 'dm_thread_missing', thread: null };
  }
  if (String(envelope.initiator_user_id) !== String(initiatorUserId)) {
    return { changed: false, blocked: true, reason: 'dm_thread_not_owned_by_user', thread: null };
  }
  if (!['draft', 'payment_pending'].includes(envelope.status)) {
    return { changed: false, blocked: envelope.status === 'blocked', duplicate: envelope.status !== 'blocked', reason: envelope.status === 'active' ? 'dm_thread_already_active' : 'dm_thread_not_ready_for_compose', thread: normalizeDmThreadRow(envelope, envelope.role) };
  }

  const result = await client.query(
    `
      update member_dm_threads
      set
        first_message_text = $2,
        status = 'payment_pending',
        payment_state = 'pending',
        updated_at = now()
      where id = $1
      returning
        id as dm_thread_id,
        initiator_user_id,
        recipient_user_id,
        target_profile_id,
        status,
        payment_state,
        price_stars_snapshot,
        first_message_text,
        created_at,
        updated_at,
        delivered_at,
        accepted_at,
        declined_at,
        blocked_at,
        closed_at,
        last_message_at,
        last_sender_user_id,
        blocked_by_user_id,
        reported_by_user_id
    `,
    [threadId, messageText]
  );

  const row = result.rows[0] || null;
  await createDmEvent(client, {
    threadId,
    actorUserId: initiatorUserId,
    eventType: 'dm_first_message_saved',
    detail: { length: messageText.length }
  });

  return {
    changed: true,
    blocked: false,
    reason: 'dm_first_message_saved',
    thread: normalizeDmThreadRow({ ...row, counterpart_profile_id: envelope.counterpart_profile_id, display_name: envelope.display_name, headline_user: envelope.headline_user }, envelope.role)
  };
}

export async function getDmThreadPaymentEnvelope(client, { threadId }) {
  const result = await client.query(
    `
      select
        t.id as dm_thread_id,
        t.initiator_user_id,
        t.recipient_user_id,
        t.target_profile_id,
        t.status,
        t.payment_state,
        t.price_stars_snapshot,
        t.first_message_text,
        initiator.telegram_user_id as initiator_telegram_user_id,
        recipient.telegram_user_id as recipient_telegram_user_id,
        coalesce(nullif(initiator_mp.display_name, ''), initiator_la.full_name, 'Unknown member') as initiator_display_name,
        initiator_mp.headline_user as initiator_headline_user,
        coalesce(nullif(recipient_mp.display_name, ''), recipient_la.full_name, 'Unknown member') as recipient_display_name,
        recipient_mp.headline_user as recipient_headline_user
      from member_dm_threads t
      join users initiator on initiator.id = t.initiator_user_id
      join users recipient on recipient.id = t.recipient_user_id
      left join member_profiles initiator_mp on initiator_mp.user_id = t.initiator_user_id
      left join linkedin_accounts initiator_la on initiator_la.user_id = t.initiator_user_id
      left join member_profiles recipient_mp on recipient_mp.user_id = t.recipient_user_id
      left join linkedin_accounts recipient_la on recipient_la.user_id = t.recipient_user_id
      where t.id = $1
      limit 1
    `,
    [threadId]
  );
  return result.rows[0] || null;
}

export async function markDmThreadPaymentConfirmed(client, { threadId, initiatorUserId, telegramPaymentChargeId, providerPaymentChargeId = null }) {
  const current = await getDmThreadPaymentEnvelope(client, { threadId });
  if (!current) {
    return { changed: false, blocked: true, duplicate: false, reason: 'dm_thread_missing', thread: null };
  }
  if (String(current.initiator_user_id) !== String(initiatorUserId)) {
    return { changed: false, blocked: true, duplicate: false, reason: 'dm_thread_not_owned_by_user', thread: null };
  }
  if (current.status === 'pending_recipient' || current.payment_state === 'confirmed') {
    return { changed: false, blocked: false, duplicate: true, reason: 'dm_payment_already_confirmed', thread: normalizeDmThreadRow({ ...current, counterpart_profile_id: current.target_profile_id, display_name: current.recipient_display_name, headline_user: current.recipient_headline_user }, 'sent'), envelope: current };
  }
  if (current.status !== 'payment_pending' || current.payment_state !== 'pending' || !(typeof current.first_message_text === 'string' && current.first_message_text.trim())) {
    return { changed: false, blocked: true, duplicate: false, reason: 'dm_thread_not_ready_for_payment', thread: null };
  }

  const updateResult = await client.query(
    `
      update member_dm_threads
      set
        status = 'pending_recipient',
        payment_state = 'confirmed',
        delivered_at = now(),
        telegram_payment_charge_id = $3,
        provider_payment_charge_id = $4,
        updated_at = now(),
        last_message_at = now(),
        last_sender_user_id = initiator_user_id
      where id = $1
        and initiator_user_id = $2
      returning
        id as dm_thread_id,
        initiator_user_id,
        recipient_user_id,
        target_profile_id,
        status,
        payment_state,
        price_stars_snapshot,
        first_message_text,
        created_at,
        updated_at,
        delivered_at,
        accepted_at,
        declined_at,
        blocked_at,
        closed_at,
        last_message_at,
        last_sender_user_id,
        blocked_by_user_id,
        reported_by_user_id
    `,
    [threadId, initiatorUserId, telegramPaymentChargeId, providerPaymentChargeId]
  );

  const row = updateResult.rows[0] || null;
  await client.query(
    `
      insert into member_dm_messages (thread_id, sender_user_id, recipient_user_id, message_kind, message_text, delivery_state, delivered_at)
      values ($1, $2, $3, 'request', $4, 'delivered', now())
    `,
    [threadId, current.initiator_user_id, current.recipient_user_id, current.first_message_text]
  );
  await createDmEvent(client, {
    threadId,
    actorUserId: initiatorUserId,
    eventType: 'dm_payment_confirmed',
    detail: { amountStars: current.price_stars_snapshot }
  });

  return {
    changed: true,
    blocked: false,
    duplicate: false,
    reason: 'dm_request_delivered',
    thread: normalizeDmThreadRow({ ...row, counterpart_profile_id: current.target_profile_id, display_name: current.recipient_display_name, headline_user: current.recipient_headline_user }, 'sent'),
    envelope: current
  };
}

export async function decideDmThread(client, { userId, threadId, decision }) {
  const current = await getThreadParticipantEnvelope(client, { threadId, userId });
  if (!current) {
    return { changed: false, blocked: true, duplicate: false, reason: 'dm_thread_missing', thread: null };
  }
  if (String(current.recipient_user_id) !== String(userId)) {
    return { changed: false, blocked: true, duplicate: false, reason: 'dm_thread_not_actionable_by_user', thread: normalizeDmThreadRow(current, current.role) };
  }
  if (!['acc', 'dec', 'blk', 'rpt'].includes(decision)) {
    return { changed: false, blocked: true, duplicate: false, reason: 'dm_invalid_decision', thread: normalizeDmThreadRow(current, current.role) };
  }
  if (current.status === 'active' && decision === 'acc') {
    return { changed: false, blocked: false, duplicate: true, reason: 'dm_thread_already_active', thread: normalizeDmThreadRow(current, current.role) };
  }
  if (current.status === 'declined') {
    return { changed: false, blocked: false, duplicate: true, reason: 'dm_thread_already_declined', thread: normalizeDmThreadRow(current, current.role) };
  }
  if (current.status === 'blocked') {
    return { changed: false, blocked: true, duplicate: false, reason: 'dm_thread_blocked', thread: normalizeDmThreadRow(current, current.role) };
  }
  if (current.status !== 'pending_recipient') {
    return { changed: false, blocked: true, duplicate: false, reason: 'dm_thread_not_ready_for_decision', thread: normalizeDmThreadRow(current, current.role) };
  }

  let status = 'declined';
  let reason = 'dm_thread_declined';
  let eventType = 'dm_request_declined';
  const detail = {};
  if (decision === 'acc') {
    status = 'active';
    reason = 'dm_thread_accepted';
    eventType = 'dm_request_accepted';
  } else if (decision === 'blk') {
    status = 'blocked';
    reason = 'dm_thread_blocked';
    eventType = 'dm_user_blocked';
    detail.blocked = true
  } else if (decision === 'rpt') {
    status = 'blocked';
    reason = 'dm_thread_reported';
    eventType = 'dm_user_reported';
    detail.reported = true
  }

  const result = await client.query(
    `
      update member_dm_threads
      set
        status = $3,
        accepted_at = case when $3 = 'active' then now() else accepted_at end,
        declined_at = case when $3 = 'declined' then now() else declined_at end,
        blocked_at = case when $3 = 'blocked' then now() else blocked_at end,
        blocked_by_user_id = case when $3 = 'blocked' then $2 else blocked_by_user_id end,
        reported_by_user_id = case when $4 then $2 else reported_by_user_id end,
        updated_at = now()
      where id = $1
      returning
        id as dm_thread_id,
        initiator_user_id,
        recipient_user_id,
        target_profile_id,
        status,
        payment_state,
        price_stars_snapshot,
        first_message_text,
        created_at,
        updated_at,
        delivered_at,
        accepted_at,
        declined_at,
        blocked_at,
        closed_at,
        last_message_at,
        last_sender_user_id,
        blocked_by_user_id,
        reported_by_user_id
    `,
    [threadId, userId, status, decision === 'rpt']
  );

  const row = result.rows[0] || null;
  await createDmEvent(client, { threadId, actorUserId: userId, eventType, detail });
  const initiatorView = await getDmThreadDetailByUserId(client, { userId: row.initiator_user_id, threadId });
  return {
    changed: true,
    blocked: status === 'blocked',
    duplicate: false,
    reason,
    thread: normalizeDmThreadRow({ ...row, counterpart_profile_id: current.counterpart_profile_id, display_name: current.display_name, headline_user: current.headline_user }, current.role),
    requesterThread: initiatorView.thread || null,
    requesterTelegramUserId: current.initiator_telegram_user_id || null
  };
}

export async function appendDmThreadMessage(client, { threadId, senderUserId, messageText }) {
  const envelope = await getThreadParticipantEnvelope(client, { threadId, userId: senderUserId });
  if (!envelope) {
    return { changed: false, blocked: true, reason: 'dm_thread_missing', thread: null, recipientTelegramUserId: null };
  }
  if (envelope.status !== 'active') {
    return { changed: false, blocked: envelope.status === 'blocked', duplicate: false, reason: envelope.status === 'declined' ? 'dm_thread_declined' : 'dm_thread_not_active', thread: normalizeDmThreadRow(envelope, envelope.role) };
  }
  const recipientUserId = String(envelope.initiator_user_id) === String(senderUserId) ? envelope.recipient_user_id : envelope.initiator_user_id;
  const recipientTelegramUserId = String(envelope.initiator_user_id) === String(senderUserId) ? envelope.recipient_telegram_user_id : envelope.initiator_telegram_user_id;

  await client.query(
    `
      insert into member_dm_messages (thread_id, sender_user_id, recipient_user_id, message_kind, message_text, delivery_state, delivered_at)
      values ($1, $2, $3, 'message', $4, 'delivered', now())
    `,
    [threadId, senderUserId, recipientUserId, messageText]
  );

  const updateResult = await client.query(
    `
      update member_dm_threads
      set
        last_message_at = now(),
        last_sender_user_id = $2,
        updated_at = now()
      where id = $1
      returning
        id as dm_thread_id,
        initiator_user_id,
        recipient_user_id,
        target_profile_id,
        status,
        payment_state,
        price_stars_snapshot,
        first_message_text,
        created_at,
        updated_at,
        delivered_at,
        accepted_at,
        declined_at,
        blocked_at,
        closed_at,
        last_message_at,
        last_sender_user_id,
        blocked_by_user_id,
        reported_by_user_id
    `,
    [threadId, senderUserId]
  );
  const row = updateResult.rows[0] || null;
  await createDmEvent(client, { threadId, actorUserId: senderUserId, eventType: 'dm_message_sent', detail: { length: messageText.length } });
  return {
    changed: true,
    blocked: false,
    reason: 'dm_message_sent',
    recipientTelegramUserId,
    thread: normalizeDmThreadRow({ ...row, counterpart_profile_id: envelope.counterpart_profile_id, display_name: envelope.display_name, headline_user: envelope.headline_user }, envelope.role)
  };
}

async function loadDmMessagesByThreadId(client, threadId, limit = 12) {
  const result = await client.query(
    `
      select id as dm_message_id, sender_user_id, recipient_user_id, message_kind, message_text, delivery_state, created_at, delivered_at
      from member_dm_messages
      where thread_id = $1
      order by id asc
      limit $2
    `,
    [threadId, limit]
  );
  return result.rows || [];
}

export async function getDmInboxStateByUserId(client, { userId }) {
  const receivedResult = await client.query(
    `
      select
        t.id as dm_thread_id,
        t.initiator_user_id,
        t.recipient_user_id,
        t.target_profile_id,
        t.status,
        t.payment_state,
        t.price_stars_snapshot,
        t.first_message_text,
        t.created_at,
        t.updated_at,
        t.delivered_at,
        t.accepted_at,
        t.declined_at,
        t.blocked_at,
        t.closed_at,
        t.last_message_at,
        t.last_sender_user_id,
        t.blocked_by_user_id,
        t.reported_by_user_id,
        initiator_mp.id as counterpart_profile_id,
        coalesce(nullif(initiator_mp.display_name, ''), initiator_la.full_name, 'Unknown member') as display_name,
        initiator_mp.headline_user
      from member_dm_threads t
      left join member_profiles initiator_mp on initiator_mp.user_id = t.initiator_user_id
      left join linkedin_accounts initiator_la on initiator_la.user_id = t.initiator_user_id
      where t.recipient_user_id = $1
        and t.status in ('pending_recipient', 'active', 'blocked')
      order by coalesce(t.last_message_at, t.updated_at, t.created_at) desc
      limit 6
    `,
    [userId]
  );

  const sentResult = await client.query(
    `
      select
        t.id as dm_thread_id,
        t.initiator_user_id,
        t.recipient_user_id,
        t.target_profile_id,
        t.status,
        t.payment_state,
        t.price_stars_snapshot,
        t.first_message_text,
        t.created_at,
        t.updated_at,
        t.delivered_at,
        t.accepted_at,
        t.declined_at,
        t.blocked_at,
        t.closed_at,
        t.last_message_at,
        t.last_sender_user_id,
        t.blocked_by_user_id,
        t.reported_by_user_id,
        recipient_mp.id as counterpart_profile_id,
        coalesce(nullif(recipient_mp.display_name, ''), recipient_la.full_name, 'Unknown member') as display_name,
        recipient_mp.headline_user
      from member_dm_threads t
      left join member_profiles recipient_mp on recipient_mp.user_id = t.recipient_user_id
      left join linkedin_accounts recipient_la on recipient_la.user_id = t.recipient_user_id
      where t.initiator_user_id = $1
        and t.status in ('payment_pending', 'pending_recipient', 'active', 'declined', 'blocked')
      order by coalesce(t.last_message_at, t.updated_at, t.created_at) desc
      limit 6
    `,
    [userId]
  );

  const countsResult = await client.query(
    `
      select
        count(*) filter (where recipient_user_id = $1 and status = 'pending_recipient')::int as received_pending,
        count(*) filter (where recipient_user_id = $1 and status in ('pending_recipient', 'active', 'blocked'))::int as received_total,
        count(*) filter (where initiator_user_id = $1 and status in ('payment_pending', 'pending_recipient'))::int as sent_pending,
        count(*) filter (where initiator_user_id = $1 and status in ('payment_pending', 'pending_recipient', 'active', 'declined', 'blocked'))::int as sent_total,
        count(*) filter (where $1 in (initiator_user_id, recipient_user_id) and status = 'active')::int as active_total
      from member_dm_threads
    `,
    [userId]
  );

  return {
    counts: countsResult.rows[0] || {
      received_pending: 0,
      received_total: 0,
      sent_pending: 0,
      sent_total: 0,
      active_total: 0
    },
    received: receivedResult.rows.map((row) => normalizeDmThreadRow(row, 'received')),
    sent: sentResult.rows.map((row) => normalizeDmThreadRow(row, 'sent'))
  };
}

export async function getDmThreadDetailByUserId(client, { userId, threadId }) {
  const threadRow = await getThreadParticipantEnvelope(client, { threadId, userId });
  if (!threadRow) {
    return { blocked: true, reason: 'dm_thread_missing', thread: null };
  }
  const messages = await loadDmMessagesByThreadId(client, threadId);
  return {
    blocked: false,
    reason: 'dm_thread_loaded',
    thread: normalizeDmThreadRow(threadRow, threadRow.role, { messages })
  };
}
