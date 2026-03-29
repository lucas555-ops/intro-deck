import { getPricingConfig, getSubscriptionConfig, getTelegramConfig } from '../../config/env.js';
import { isDatabaseConfigured, withDbTransaction } from '../../db/pool.js';
import { createConfirmedPurchaseReceipt, activateOrExtendProSubscription, getMemberPricingStateByUserId, listRecentPurchaseReceipts } from '../../db/monetizationRepo.js';
import { getProfileSnapshotByUserId } from '../../db/profileRepo.js';
import { upsertTelegramUser } from '../../db/usersRepo.js';

export function buildProInvoicePayload(planCode = 'pro_monthly') {
  return `sub:${planCode}`;
}

export function parseProInvoicePayload(payload) {
  const normalized = String(payload || '').trim();
  const match = normalized.match(/^sub:([a-z0-9_:-]+)$/i);
  if (!match) {
    return null;
  }
  return { planCode: match[1].toLowerCase() };
}

export async function loadPricingSurfaceState({ telegramUserId, telegramUsername = null }) {
  const pricing = getPricingConfig();
  const subscriptionConfig = getSubscriptionConfig();
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      profile: null,
      subscription: null,
      recentReceipts: [],
      pricing,
      subscriptionConfig,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    const [profile, pricingState] = await Promise.all([
      getProfileSnapshotByUserId(client, user.id),
      getMemberPricingStateByUserId(client, { userId: user.id })
    ]);
    return {
      persistenceEnabled: true,
      profile,
      subscription: pricingState.subscription,
      recentReceipts: pricingState.recentReceipts,
      pricing,
      subscriptionConfig,
      reason: 'pricing_state_loaded'
    };
  });
}

export async function getProSubscriptionInvoiceForTelegramUser({ telegramUserId, telegramUsername = null }) {
  const pricing = getPricingConfig();
  const subscriptionConfig = getSubscriptionConfig();
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      blocked: false,
      invoice: null,
      subscription: null,
      pricing,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    const pricingState = await getMemberPricingStateByUserId(client, { userId: user.id });
    if (pricingState.subscription?.isActive) {
      return {
        persistenceEnabled: true,
        blocked: true,
        invoice: null,
        subscription: pricingState.subscription,
        pricing,
        reason: 'pro_subscription_already_active'
      };
    }

    return {
      persistenceEnabled: true,
      blocked: false,
      subscription: pricingState.subscription,
      pricing,
      reason: 'pro_invoice_ready',
      invoice: {
        payload: buildProInvoicePayload('pro_monthly'),
        amountStars: pricing.proMonthlyPriceStars,
        title: 'Intro Deck Pro',
        description: `Unlock Pro for ${subscriptionConfig.proMonthlyDurationDays} days. Active Pro includes direct-contact requests and DM request opens without per-action Stars fees.`
      }
    };
  });
}

export async function confirmProSubscriptionPaymentForTelegramUser({
  telegramUserId,
  telegramUsername = null,
  telegramPaymentChargeId,
  providerPaymentChargeId = null,
  payload = null
}) {
  const pricing = getPricingConfig();
  const subscriptionConfig = getSubscriptionConfig();
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      changed: false,
      duplicate: false,
      blocked: false,
      subscription: null,
      receipt: null,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    const receiptResult = await createConfirmedPurchaseReceipt(client, {
      userId: user.id,
      receiptType: 'subscription',
      productCode: 'pro_monthly',
      amountStars: pricing.proMonthlyPriceStars,
      relatedEntityType: 'subscription',
      relatedEntityId: user.id,
      telegramPaymentChargeId,
      providerPaymentChargeId,
      rawPayloadSnapshot: { payload }
    });

    if (!receiptResult.created && receiptResult.duplicate) {
      const pricingState = await getMemberPricingStateByUserId(client, { userId: user.id });
      return {
        persistenceEnabled: true,
        changed: false,
        duplicate: true,
        blocked: false,
        subscription: pricingState.subscription,
        receipt: receiptResult.receipt,
        reason: 'pro_subscription_payment_already_confirmed'
      };
    }

    const subscription = await activateOrExtendProSubscription(client, {
      userId: user.id,
      durationDays: subscriptionConfig.proMonthlyDurationDays,
      telegramPaymentChargeId,
      providerPaymentChargeId,
      lastReceiptId: receiptResult.receipt?.receiptId || null,
      planCode: 'pro_monthly'
    });

    return {
      persistenceEnabled: true,
      changed: true,
      duplicate: false,
      blocked: false,
      subscription,
      receipt: receiptResult.receipt,
      reason: 'pro_subscription_activated'
    };
  });
}

export async function loadAdminMonetizationState() {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      recentReceipts: [],
      pricing: getPricingConfig(),
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => ({
    persistenceEnabled: true,
    recentReceipts: await listRecentPurchaseReceipts(client, { limit: 8 }),
    pricing: getPricingConfig(),
    reason: 'admin_monetization_state_loaded'
  }));
}
