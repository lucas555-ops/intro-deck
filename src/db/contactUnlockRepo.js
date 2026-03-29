function normalizeUnlockItem(row, role) {
  if (!row) {
    return null;
  }

  return {
    contact_unlock_request_id: row.contact_unlock_request_id,
    status: row.status,
    payment_state: row.payment_state,
    price_stars_snapshot: row.price_stars_snapshot,
    requested_at: row.requested_at,
    approved_at: row.approved_at,
    declined_at: row.declined_at,
    revealed_at: row.revealed_at,
    updated_at: row.updated_at,
    profile_id: row.profile_id,
    display_name: row.display_name,
    headline_user: row.headline_user,
    revealed_contact_value: row.revealed_contact_value || null,
    role
  };
}

async function loadRequesterSnapshotRow(client, requesterUserId) {
  const result = await client.query(
    `
      select
        u.id as requester_user_id,
        mp.id as profile_id,
        coalesce(nullif(mp.display_name, ''), la.full_name, 'Unknown member') as display_name,
        mp.headline_user
      from users u
      left join member_profiles mp on mp.user_id = u.id
      left join linkedin_accounts la on la.user_id = u.id
      where u.id = $1
      limit 1
    `,
    [requesterUserId]
  );

  return result.rows[0] || null;
}

async function loadTargetContactRow(client, targetProfileId) {
  const result = await client.query(
    `
      select
        mp.id as profile_id,
        mp.user_id as target_user_id,
        mp.contact_mode,
        mp.visibility_status,
        mp.profile_state,
        mp.telegram_username_hidden,
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

async function loadContactUnlockDetailRow(client, requestId, userId) {
  const result = await client.query(
    `
      select
        cur.id as contact_unlock_request_id,
        cur.status,
        cur.payment_state,
        cur.price_stars_snapshot,
        cur.requested_at,
        cur.approved_at,
        cur.declined_at,
        cur.revealed_at,
        cur.updated_at,
        cur.revealed_contact_value,
        case
          when cur.target_user_id = $2 then 'received'
          when cur.requester_user_id = $2 then 'sent'
          else null
        end as role,
        case
          when cur.target_user_id = $2 then requester_mp.id
          else target_mp.id
        end as profile_id,
        case
          when cur.target_user_id = $2 then coalesce(nullif(requester_mp.display_name, ''), requester_la.full_name, cur.requester_display_name, 'Unknown member')
          else coalesce(nullif(target_mp.display_name, ''), target_la.full_name, cur.target_display_name, 'Unknown member')
        end as display_name,
        case
          when cur.target_user_id = $2 then coalesce(requester_mp.headline_user, cur.requester_headline_user)
          else coalesce(target_mp.headline_user, cur.target_headline_user)
        end as headline_user
      from contact_unlock_requests cur
      left join member_profiles requester_mp on requester_mp.user_id = cur.requester_user_id
      left join linkedin_accounts requester_la on requester_la.user_id = cur.requester_user_id
      left join member_profiles requester_mp on requester_mp.user_id = cur.requester_user_id
      left join linkedin_accounts requester_la on requester_la.user_id = cur.requester_user_id
      left join member_profiles target_mp on target_mp.user_id = cur.target_user_id
      left join linkedin_accounts target_la on target_la.user_id = cur.target_user_id
      where cur.id = $1
        and (cur.target_user_id = $2 or cur.requester_user_id = $2)
      limit 1
    `,
    [requestId, userId]
  );

  return result.rows[0] || null;
}

export async function createOrGetContactUnlockRequest(client, { requesterUserId, targetProfileId, priceStars }) {
  const requester = await loadRequesterSnapshotRow(client, requesterUserId);
  if (!requester) {
    return { created: false, blocked: true, reason: 'requester_user_missing', request: null, target: null };
  }

  const target = await loadTargetContactRow(client, targetProfileId);
  if (!target) {
    return { created: false, blocked: true, reason: 'target_profile_missing', request: null, target: null };
  }

  if (String(target.target_user_id) == String(requesterUserId)) {
    return { created: false, blocked: true, reason: 'cannot_request_direct_contact_to_self', request: null, target };
  }

  if (target.visibility_status !== 'listed' || target.profile_state !== 'active') {
    return { created: false, blocked: true, reason: 'target_profile_not_public', request: null, target };
  }

  if (target.contact_mode !== 'paid_unlock_requires_approval') {
    return { created: false, blocked: true, reason: 'target_profile_not_paid_unlock_mode', request: null, target };
  }

  if (!(typeof target.telegram_username_hidden === 'string' && target.telegram_username_hidden.trim())) {
    return { created: false, blocked: true, reason: 'target_profile_no_hidden_telegram_username', request: null, target };
  }

  const existingResult = await client.query(
    `
      select
        id as contact_unlock_request_id,
        status,
        payment_state,
        price_stars_snapshot,
        requested_at,
        approved_at,
        declined_at,
        revealed_at,
        updated_at,
        revealed_contact_value
      from contact_unlock_requests
      where requester_user_id = $1
        and target_profile_id = $2
        and contact_type = 'telegram_username'
        and status in ('payment_pending', 'paid_pending_approval', 'revealed')
      order by id desc
      limit 1
    `,
    [requesterUserId, targetProfileId]
  );

  const existing = existingResult.rows[0] || null;
  if (existing) {
    return {
      created: false,
      blocked: false,
      duplicate: true,
      reason: existing.status === 'revealed' ? 'contact_unlock_already_revealed' : 'contact_unlock_request_already_exists',
      request: {
        ...existing,
        target_user_id: target.target_user_id,
        target_profile_id: target.profile_id,
        display_name: target.display_name,
        headline_user: target.headline_user
      },
      target
    };
  }

  const insertResult = await client.query(
    `
      insert into contact_unlock_requests (
        requester_user_id,
        target_user_id,
        target_profile_id,
        contact_type,
        status,
        payment_state,
        price_stars_snapshot,
        policy_snapshot,
        requester_display_name,
        requester_headline_user,
        target_display_name,
        target_headline_user
      )
      values ($1, $2, $3, 'telegram_username', 'payment_pending', 'pending', $4, $5, $6, $7, $8, $9)
      returning
        id as contact_unlock_request_id,
        status,
        payment_state,
        price_stars_snapshot,
        requested_at,
        approved_at,
        declined_at,
        revealed_at,
        updated_at,
        revealed_contact_value
    `,
    [
      requesterUserId,
      target.target_user_id,
      target.profile_id,
      priceStars,
      target.contact_mode,
      requester.display_name,
      requester.headline_user || null,
      target.display_name,
      target.headline_user || null
    ]
  );

  return {
    created: true,
    blocked: false,
    duplicate: false,
    reason: 'contact_unlock_request_created',
    request: {
      ...insertResult.rows[0],
      target_user_id: target.target_user_id,
      target_profile_id: target.profile_id,
      display_name: target.display_name,
      headline_user: target.headline_user
    },
    target
  };
}

export async function getContactUnlockRequestPaymentEnvelope(client, { requestId }) {
  const result = await client.query(
    `
      select
        cur.id as contact_unlock_request_id,
        cur.requester_user_id,
        requester.telegram_user_id as requester_telegram_user_id,
        cur.target_user_id,
        target.telegram_user_id as target_telegram_user_id,
        cur.target_profile_id,
        cur.status,
        cur.payment_state,
        cur.price_stars_snapshot,
        cur.policy_snapshot,
        coalesce(nullif(requester_mp.display_name, ''), requester_la.full_name, cur.requester_display_name, 'Unknown member') as requester_display_name,
        coalesce(requester_mp.headline_user, cur.requester_headline_user) as requester_headline_user,
        coalesce(nullif(target_mp.display_name, ''), target_la.full_name, cur.target_display_name, 'Unknown member') as target_display_name,
        coalesce(target_mp.headline_user, cur.target_headline_user) as target_headline_user,
        target_mp.telegram_username_hidden
      from contact_unlock_requests cur
      join users requester on requester.id = cur.requester_user_id
      join users target on target.id = cur.target_user_id
      left join member_profiles requester_mp on requester_mp.user_id = cur.requester_user_id
      left join linkedin_accounts requester_la on requester_la.user_id = cur.requester_user_id
      left join member_profiles target_mp on target_mp.user_id = cur.target_user_id
      left join linkedin_accounts target_la on target_la.user_id = cur.target_user_id
      where cur.id = $1
      limit 1
    `,
    [requestId]
  );

  return result.rows[0] || null;
}

export async function markContactUnlockRequestPaymentConfirmed(client, {
  requestId,
  requesterUserId,
  telegramPaymentChargeId,
  providerPaymentChargeId = null
}) {
  const current = await getContactUnlockRequestPaymentEnvelope(client, { requestId });
  if (!current) {
    return { changed: false, blocked: true, reason: 'contact_unlock_request_missing', request: null };
  }

  if (String(current.requester_user_id) !== String(requesterUserId)) {
    return { changed: false, blocked: true, reason: 'contact_unlock_request_not_owned_by_user', request: null };
  }

  if (current.status === 'revealed') {
    return { changed: false, duplicate: true, reason: 'contact_unlock_already_revealed', request: current };
  }

  if (current.payment_state === 'paid') {
    return { changed: false, duplicate: true, reason: 'contact_unlock_payment_already_confirmed', request: current };
  }

  const result = await client.query(
    `
      update contact_unlock_requests
      set
        status = 'paid_pending_approval',
        payment_state = 'paid',
        telegram_payment_charge_id = $3,
        provider_payment_charge_id = $4,
        updated_at = now()
      where id = $1
        and requester_user_id = $2
        and status = 'payment_pending'
      returning id as contact_unlock_request_id
    `,
    [requestId, requesterUserId, telegramPaymentChargeId, providerPaymentChargeId]
  );

  if (!result.rows[0]) {
    return { changed: false, blocked: true, reason: 'contact_unlock_payment_confirmation_failed', request: null };
  }

  const request = await getContactUnlockRequestPaymentEnvelope(client, { requestId });
  return {
    changed: true,
    blocked: false,
    duplicate: false,
    reason: 'contact_unlock_payment_confirmed',
    request
  };
}

export async function decideContactUnlockRequest(client, { userId, requestId, decision }) {
  const nextDecision = decision === 'acc' ? 'reveal' : decision === 'dec' ? 'decline' : null;
  if (!nextDecision) {
    return { changed: false, blocked: true, reason: 'contact_unlock_invalid_decision', request: null };
  }

  const current = await getContactUnlockRequestPaymentEnvelope(client, { requestId });
  if (!current) {
    return { changed: false, blocked: true, reason: 'contact_unlock_request_missing', request: null };
  }

  if (String(current.target_user_id) !== String(userId)) {
    return { changed: false, blocked: true, reason: 'contact_unlock_request_not_actionable_by_user', request: null };
  }

  if (current.status === 'revealed') {
    return { changed: false, duplicate: true, reason: 'contact_unlock_already_revealed', request: current };
  }

  if (current.status === 'declined') {
    return { changed: false, duplicate: true, reason: 'contact_unlock_already_declined', request: current };
  }

  if (current.status !== 'paid_pending_approval') {
    return { changed: false, blocked: true, reason: 'contact_unlock_request_not_ready_for_decision', request: current };
  }

  if (nextDecision === 'decline') {
    await client.query(
      `
        update contact_unlock_requests
        set
          status = 'declined',
          declined_at = now(),
          updated_at = now()
        where id = $1
      `,
      [requestId]
    );

    const request = await loadContactUnlockDetailRow(client, requestId, userId);
    return { changed: true, blocked: false, duplicate: false, reason: 'contact_unlock_declined', request };
  }

  const targetContact = await loadTargetContactRow(client, current.target_profile_id);
  if (!targetContact) {
    return { changed: false, blocked: true, reason: 'target_profile_missing', request: current };
  }
  if (targetContact.contact_mode !== 'paid_unlock_requires_approval') {
    return { changed: false, blocked: true, reason: 'target_profile_not_paid_unlock_mode', request: current };
  }
  if (!(typeof targetContact.telegram_username_hidden === 'string' && targetContact.telegram_username_hidden.trim())) {
    return { changed: false, blocked: true, reason: 'target_profile_no_hidden_telegram_username', request: current };
  }

  await client.query(
    `
      update contact_unlock_requests
      set
        status = 'revealed',
        approved_at = now(),
        revealed_at = now(),
        revealed_contact_value = $2,
        updated_at = now()
      where id = $1
    `,
    [requestId, targetContact.telegram_username_hidden.trim()]
  );

  const request = await loadContactUnlockDetailRow(client, requestId, userId);
  return { changed: true, blocked: false, duplicate: false, reason: 'contact_unlock_revealed', request };
}

export async function getContactUnlockInboxStateByUserId(client, { userId }) {
  const receivedResult = await client.query(
    `
      select
        cur.id as contact_unlock_request_id,
        cur.status,
        cur.payment_state,
        cur.price_stars_snapshot,
        cur.requested_at,
        cur.approved_at,
        cur.declined_at,
        cur.revealed_at,
        cur.updated_at,
        cur.revealed_contact_value,
        requester_mp.id as profile_id,
        coalesce(nullif(requester_mp.display_name, ''), requester_la.full_name, cur.requester_display_name, 'Unknown member') as display_name,
        coalesce(requester_mp.headline_user, cur.requester_headline_user) as headline_user
      from contact_unlock_requests cur
      left join member_profiles requester_mp on requester_mp.user_id = cur.requester_user_id
      left join linkedin_accounts requester_la on requester_la.user_id = cur.requester_user_id
      where cur.target_user_id = $1
      order by cur.updated_at desc, cur.id desc
      limit 8
    `,
    [userId]
  );

  const sentResult = await client.query(
    `
      select
        cur.id as contact_unlock_request_id,
        cur.status,
        cur.payment_state,
        cur.price_stars_snapshot,
        cur.requested_at,
        cur.approved_at,
        cur.declined_at,
        cur.revealed_at,
        cur.updated_at,
        cur.revealed_contact_value,
        target_mp.id as profile_id,
        coalesce(nullif(target_mp.display_name, ''), target_la.full_name, cur.target_display_name, 'Unknown member') as display_name,
        coalesce(target_mp.headline_user, cur.target_headline_user) as headline_user
      from contact_unlock_requests cur
      left join member_profiles requester_mp on requester_mp.user_id = cur.requester_user_id
      left join linkedin_accounts requester_la on requester_la.user_id = cur.requester_user_id
      left join member_profiles target_mp on target_mp.user_id = cur.target_user_id
      left join linkedin_accounts target_la on target_la.user_id = cur.target_user_id
      where cur.requester_user_id = $1
      order by cur.updated_at desc, cur.id desc
      limit 8
    `,
    [userId]
  );

  const received = (receivedResult.rows || []).map((row) => normalizeUnlockItem(row, 'received'));
  const sent = (sentResult.rows || []).map((row) => normalizeUnlockItem(row, 'sent'));

  return {
    counts: {
      receivedPendingApproval: received.filter((item) => item.status === 'paid_pending_approval').length,
      receivedTotal: received.length,
      sentPendingApproval: sent.filter((item) => item.status === 'paid_pending_approval').length,
      sentTotal: sent.length,
      sentRevealed: sent.filter((item) => item.status === 'revealed').length
    },
    received,
    sent
  };
}

export async function getContactUnlockRequestDetailByUserId(client, { userId, requestId }) {
  const row = await loadContactUnlockDetailRow(client, requestId, userId);
  if (!row) {
    return { request: null, blocked: true, reason: 'contact_unlock_request_missing' };
  }

  return {
    request: normalizeUnlockItem(row, row.role),
    blocked: false,
    reason: 'contact_unlock_request_loaded'
  };
}
