function normalizeSubscriptionRow(row) {
  if (!row) {
    return null;
  }
  return {
    subscriptionId: row.id,
    userId: row.user_id,
    planCode: row.plan_code,
    state: row.state,
    source: row.source,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    telegramPaymentChargeId: row.telegram_payment_charge_id || null,
    providerPaymentChargeId: row.provider_payment_charge_id || null,
    lastReceiptId: row.last_receipt_id || null,
    isActive: row.state === 'active' && row.expires_at && new Date(row.expires_at).getTime() > Date.now()
  };
}

function normalizeReceiptRow(row) {
  if (!row) {
    return null;
  }
  return {
    receiptId: row.id,
    userId: row.user_id,
    receiptType: row.receipt_type,
    productCode: row.product_code,
    amountStars: row.amount_stars,
    status: row.status,
    relatedEntityType: row.related_entity_type || null,
    relatedEntityId: row.related_entity_id || null,
    providerReceiptRef: row.provider_receipt_ref || null,
    telegramPaymentChargeId: row.telegram_payment_charge_id || null,
    providerPaymentChargeId: row.provider_payment_charge_id || null,
    purchasedAt: row.purchased_at,
    confirmedAt: row.confirmed_at,
    failedAt: row.failed_at,
    cancelledAt: row.cancelled_at,
    rawPayloadSnapshot: row.raw_payload_snapshot || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getActiveSubscriptionByUserId(client, { userId, planCode = 'pro_monthly' }) {
  const result = await client.query(
    `
      select *
      from member_subscriptions
      where user_id = $1
        and plan_code = $2
      limit 1
    `,
    [userId, planCode]
  );

  const subscription = normalizeSubscriptionRow(result.rows[0] || null);
  if (!subscription) {
    return null;
  }

  if (subscription.state === 'active' && subscription.expiresAt && new Date(subscription.expiresAt).getTime() <= Date.now()) {
    const expired = await client.query(
      `
        update member_subscriptions
        set state = 'expired', updated_at = now()
        where id = $1
        returning *
      `,
      [subscription.subscriptionId]
    );
    return normalizeSubscriptionRow(expired.rows[0] || null);
  }

  return subscription;
}

export async function createConfirmedPurchaseReceipt(client, {
  userId,
  receiptType,
  productCode,
  amountStars,
  relatedEntityType = null,
  relatedEntityId = null,
  providerReceiptRef = null,
  telegramPaymentChargeId = null,
  providerPaymentChargeId = null,
  rawPayloadSnapshot = null
}) {
  if (telegramPaymentChargeId) {
    const existingByTelegram = await client.query(
      `select * from purchase_receipts where telegram_payment_charge_id = $1 limit 1`,
      [telegramPaymentChargeId]
    );
    if (existingByTelegram.rows[0]) {
      return { created: false, duplicate: true, receipt: normalizeReceiptRow(existingByTelegram.rows[0]) };
    }
  }

  if (providerPaymentChargeId) {
    const existingByProvider = await client.query(
      `select * from purchase_receipts where provider_payment_charge_id = $1 limit 1`,
      [providerPaymentChargeId]
    );
    if (existingByProvider.rows[0]) {
      return { created: false, duplicate: true, receipt: normalizeReceiptRow(existingByProvider.rows[0]) };
    }
  }

  const inserted = await client.query(
    `
      insert into purchase_receipts (
        user_id,
        receipt_type,
        product_code,
        amount_stars,
        status,
        related_entity_type,
        related_entity_id,
        provider_receipt_ref,
        telegram_payment_charge_id,
        provider_payment_charge_id,
        purchased_at,
        confirmed_at,
        raw_payload_snapshot,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, 'confirmed', $5, $6, $7, $8, $9, now(), now(), $10::jsonb, now(), now())
      returning *
    `,
    [
      userId,
      receiptType,
      productCode,
      amountStars,
      relatedEntityType,
      relatedEntityId,
      providerReceiptRef,
      telegramPaymentChargeId,
      providerPaymentChargeId,
      rawPayloadSnapshot ? JSON.stringify(rawPayloadSnapshot) : null
    ]
  );

  return { created: true, duplicate: false, receipt: normalizeReceiptRow(inserted.rows[0] || null) };
}

export async function activateOrExtendProSubscription(client, {
  userId,
  durationDays = 30,
  source = 'telegram_stars',
  telegramPaymentChargeId = null,
  providerPaymentChargeId = null,
  lastReceiptId = null,
  planCode = 'pro_monthly'
}) {
  const currentResult = await client.query(
    `select * from member_subscriptions where user_id = $1 limit 1`,
    [userId]
  );
  const current = currentResult.rows[0] || null;
  const hasActiveWindow = Boolean(current && current.state === 'active' && current.expires_at && new Date(current.expires_at).getTime() > Date.now());

  if (!current) {
    const inserted = await client.query(
      `
        insert into member_subscriptions (
          user_id,
          plan_code,
          state,
          source,
          started_at,
          expires_at,
          created_at,
          updated_at,
          telegram_payment_charge_id,
          provider_payment_charge_id,
          last_receipt_id
        )
        values ($1, $2, 'active', $3, now(), now() + make_interval(days => $4), now(), now(), $5, $6, $7)
        returning *
      `,
      [userId, planCode, source, durationDays, telegramPaymentChargeId, providerPaymentChargeId, lastReceiptId]
    );
    return normalizeSubscriptionRow(inserted.rows[0] || null);
  }

  const updated = await client.query(
    `
      update member_subscriptions
      set
        plan_code = $2,
        state = 'active',
        source = $3,
        started_at = case when $4 then started_at else now() end,
        expires_at = case when $4 then coalesce(expires_at, now()) + make_interval(days => $5) else now() + make_interval(days => $5) end,
        updated_at = now(),
        telegram_payment_charge_id = coalesce($6, telegram_payment_charge_id),
        provider_payment_charge_id = coalesce($7, provider_payment_charge_id),
        last_receipt_id = coalesce($8, last_receipt_id)
      where user_id = $1
      returning *
    `,
    [userId, planCode, source, hasActiveWindow, durationDays, telegramPaymentChargeId, providerPaymentChargeId, lastReceiptId]
  );

  return normalizeSubscriptionRow(updated.rows[0] || null);
}

export async function getUserEntitlements(client, { userId }) {
  const subscription = await getActiveSubscriptionByUserId(client, { userId, planCode: 'pro_monthly' });
  const proActive = Boolean(subscription?.isActive);
  return {
    subscription,
    proActive,
    canUseDirectContactWithoutPayment: proActive,
    canOpenDmWithoutPayment: proActive
  };
}

export async function listRecentPurchaseReceipts(client, { limit = 8 } = {}) {
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 20) : 8;
  const result = await client.query(
    `
      select
        pr.*,
        u.telegram_user_id,
        u.telegram_username,
        coalesce(mp.display_name, la.full_name, u.telegram_username, concat('user #', u.id::text)) as display_name
      from purchase_receipts pr
      join users u on u.id = pr.user_id
      left join member_profiles mp on mp.user_id = u.id
      left join linkedin_accounts la on la.user_id = u.id
      where pr.status = 'confirmed'
      order by coalesce(pr.confirmed_at, pr.purchased_at, pr.created_at) desc, pr.id desc
      limit $1
    `,
    [normalizedLimit]
  );
  return (result.rows || []).map((row) => ({
    ...normalizeReceiptRow(row),
    telegramUserId: row.telegram_user_id,
    telegramUsername: row.telegram_username || null,
    displayName: row.display_name || null
  }));
}

export async function getMemberPricingStateByUserId(client, { userId }) {
  const subscription = await getActiveSubscriptionByUserId(client, { userId, planCode: 'pro_monthly' });
  const receiptResult = await client.query(
    `
      select *
      from purchase_receipts
      where user_id = $1 and status = 'confirmed'
      order by coalesce(confirmed_at, purchased_at, created_at) desc, id desc
      limit 5
    `,
    [userId]
  );

  return {
    subscription,
    recentReceipts: (receiptResult.rows || []).map(normalizeReceiptRow)
  };
}


export async function getAdminMonetizationSummary(client) {
  const [subscriptionResult, receiptResult, contactResult, dmResult] = await Promise.all([
    client.query(`
      select
        count(*) filter (where state = 'active' and expires_at is not null and expires_at > now())::int as active_pro,
        count(*) filter (where state = 'expired' or (state = 'active' and expires_at is not null and expires_at <= now()))::int as expired_pro
      from member_subscriptions
      where plan_code = 'pro_monthly'
    `),
    client.query(`
      select
        coalesce(sum(amount_stars) filter (where status = 'confirmed' and coalesce(confirmed_at, purchased_at, created_at) >= now() - interval '7 days'), 0)::int as revenue_7d,
        coalesce(sum(amount_stars) filter (where status = 'confirmed' and coalesce(confirmed_at, purchased_at, created_at) >= now() - interval '30 days'), 0)::int as revenue_30d,
        count(*) filter (where receipt_type = 'subscription' and status = 'confirmed' and coalesce(confirmed_at, purchased_at, created_at) >= now() - interval '7 days')::int as pro_purchases_7d,
        count(*) filter (where receipt_type = 'contact_unlock' and status = 'confirmed' and coalesce(confirmed_at, purchased_at, created_at) >= now() - interval '7 days')::int as contact_paid_7d,
        count(*) filter (where receipt_type = 'dm_open' and status = 'confirmed' and coalesce(confirmed_at, purchased_at, created_at) >= now() - interval '7 days')::int as dm_paid_7d
      from purchase_receipts
    `),
    client.query(`
      select
        count(*) filter (where created_at >= now() - interval '7 days')::int as contact_requests_7d,
        count(*) filter (where payment_state = 'paid' and updated_at >= now() - interval '7 days')::int as contact_paid_pending_or_done_7d,
        count(*) filter (where revealed_at is not null and revealed_at >= now() - interval '7 days')::int as contact_revealed_7d,
        count(*) filter (where declined_at is not null and declined_at >= now() - interval '7 days')::int as contact_declined_7d
      from contact_unlock_requests
    `),
    client.query(`
      select
        count(*) filter (where created_at >= now() - interval '7 days')::int as dm_created_7d,
        count(*) filter (where delivered_at is not null and delivered_at >= now() - interval '7 days')::int as dm_delivered_7d,
        count(*) filter (where accepted_at is not null and accepted_at >= now() - interval '7 days')::int as dm_accepted_7d,
        count(*) filter (where blocked_at is not null and blocked_at >= now() - interval '7 days')::int as dm_blocked_7d,
        count(*) filter (where reported_by_user_id is not null and blocked_at is not null and blocked_at >= now() - interval '7 days')::int as dm_reported_7d,
        count(*) filter (where status = 'active')::int as dm_active_now
      from member_dm_threads
    `)
  ]);

  const subscriptions = subscriptionResult.rows[0] || {};
  const receipts = receiptResult.rows[0] || {};
  const contacts = contactResult.rows[0] || {};
  const dms = dmResult.rows[0] || {};

  return {
    activePro: subscriptions.active_pro || 0,
    expiredPro: subscriptions.expired_pro || 0,
    revenue7dStars: receipts.revenue_7d || 0,
    revenue30dStars: receipts.revenue_30d || 0,
    proPurchases7d: receipts.pro_purchases_7d || 0,
    contactRequests7d: contacts.contact_requests_7d || 0,
    contactPaid7d: receipts.contact_paid_7d || contacts.contact_paid_pending_or_done_7d || 0,
    contactRevealed7d: contacts.contact_revealed_7d || 0,
    contactDeclined7d: contacts.contact_declined_7d || 0,
    dmCreated7d: dms.dm_created_7d || 0,
    dmPaid7d: receipts.dm_paid_7d || 0,
    dmDelivered7d: dms.dm_delivered_7d || 0,
    dmAccepted7d: dms.dm_accepted_7d || 0,
    dmBlocked7d: dms.dm_blocked_7d || 0,
    dmReported7d: dms.dm_reported_7d || 0,
    dmActiveNow: dms.dm_active_now || 0
  };
}
