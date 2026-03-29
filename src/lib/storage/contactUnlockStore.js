import { getPricingConfig, getRuntimeGuardConfig, getTelegramConfig } from '../../config/env.js';
import { isDatabaseConfigured, withDbTransaction } from '../../db/pool.js';
import {
  createOrGetContactUnlockRequest,
  decideContactUnlockRequest,
  getContactUnlockInboxStateByUserId,
  getContactUnlockRequestDetailByUserId,
  getContactUnlockRequestPaymentEnvelope,
  markContactUnlockRequestPaymentConfirmed
} from '../../db/contactUnlockRepo.js';
import { getProfileSnapshotByUserId } from '../../db/profileRepo.js';
import { tryAcquireUserActionGuard } from '../../db/runtimeGuardRepo.js';
import { upsertTelegramUser } from '../../db/usersRepo.js';
import { sendTelegramMessage } from '../telegram/botApi.js';

export function buildContactUnlockInvoicePayload(requestId) {
  return `cu:${requestId}`;
}

export function parseContactUnlockInvoicePayload(payload) {
  const normalized = String(payload || '').trim();
  const match = normalized.match(/^cu:(\d+)$/);
  if (!match) {
    return null;
  }
  const requestId = Number.parseInt(match[1], 10);
  return Number.isFinite(requestId) && requestId > 0 ? { requestId } : null;
}

function buildOwnerNotification(request) {
  return {
    text: [
      '🔐 New direct contact request',
      '',
      `${request.requester_display_name || 'A member'} paid to request your direct Telegram contact.`,
      request.requester_headline_user ? `Headline: ${request.requester_headline_user}` : null,
      '',
      'Review the request and approve or decline it.'
    ].filter(Boolean).join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `cu:acc:${request.contact_unlock_request_id}` },
          { text: '❌ Decline', callback_data: `cu:dec:${request.contact_unlock_request_id}` }
        ],
        [{ text: '🧾 Open request', callback_data: `cu:view:${request.contact_unlock_request_id}` }]
      ]
    }
  };
}

function buildRequesterPaidNotification(request) {
  return {
    text: [
      '⭐ Direct contact request paid',
      '',
      `Your request for ${request.target_display_name || 'this member'} is now waiting for approval.`,
      'Payment opens the request only. The recipient still decides whether to reveal contact.'
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [{ text: '🧾 View request', callback_data: `cu:view:${request.contact_unlock_request_id}` }],
        [{ text: '📥 Inbox', callback_data: 'intro:inbox' }]
      ]
    }
  };
}

function buildRequesterRevealNotification(request) {
  const username = String(request.revealed_contact_value || '').trim();
  const clean = username.replace(/^@+/, '');
  return {
    text: [
      '✅ Direct contact approved',
      '',
      `Telegram username: @${clean}`,
      'You can now open the direct contact in Telegram.'
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [{ text: '🔓 Open contact', url: `https://t.me/${clean}` }],
        [{ text: '🧾 View request', callback_data: `cu:view:${request.contact_unlock_request_id}` }]
      ]
    }
  };
}

function buildRequesterDeclineNotification(request) {
  return {
    text: [
      'ℹ️ Direct contact request declined',
      '',
      `${request.display_name || 'This member'} declined your direct contact request.`,
      'No Telegram username was revealed.'
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [{ text: '🧾 View request', callback_data: `cu:view:${request.contact_unlock_request_id}` }],
        [{ text: '📥 Inbox', callback_data: 'intro:inbox' }]
      ]
    }
  };
}

async function notifyOwnerOfPaidRequest(request) {
  const { botToken } = getTelegramConfig();
  if (!request?.target_telegram_user_id) {
    return { sent: false, skipped: true, reason: 'target_telegram_user_id_missing' };
  }
  const message = buildOwnerNotification(request);
  await sendTelegramMessage({
    botToken,
    chatId: request.target_telegram_user_id,
    text: message.text,
    replyMarkup: message.replyMarkup,
    parseMode: null
  });
  return { sent: true, skipped: false, reason: 'owner_notified' };
}

async function notifyRequesterOfPaidRequest(request) {
  const { botToken } = getTelegramConfig();
  if (!request?.requester_telegram_user_id) {
    return { sent: false, skipped: true, reason: 'requester_telegram_user_id_missing' };
  }
  const message = buildRequesterPaidNotification(request);
  await sendTelegramMessage({
    botToken,
    chatId: request.requester_telegram_user_id,
    text: message.text,
    replyMarkup: message.replyMarkup,
    parseMode: null
  });
  return { sent: true, skipped: false, reason: 'requester_paid_notified' };
}

async function notifyRequesterOfDecision(decisionResult) {
  const request = decisionResult?.requesterRequest || decisionResult?.request;
  const requesterTelegramUserId = decisionResult?.requesterTelegramUserId;
  if (!requesterTelegramUserId) {
    return { sent: false, skipped: true, reason: 'requester_telegram_user_id_missing' };
  }
  const { botToken } = getTelegramConfig();
  const message = request?.status === 'revealed'
    ? buildRequesterRevealNotification(request)
    : buildRequesterDeclineNotification(request);
  await sendTelegramMessage({
    botToken,
    chatId: requesterTelegramUserId,
    text: message.text,
    replyMarkup: message.replyMarkup,
    parseMode: null
  });
  return { sent: true, skipped: false, reason: 'requester_decision_notified' };
}

export async function loadContactUnlockInboxState({ telegramUserId, telegramUsername = null }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      inbox: null,
      profile: null,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    const profile = await getProfileSnapshotByUserId(client, user.id);
    const inbox = await getContactUnlockInboxStateByUserId(client, { userId: user.id });

    return {
      persistenceEnabled: true,
      inbox,
      profile,
      reason: 'contact_unlock_inbox_loaded'
    };
  });
}

export async function beginContactUnlockPaymentForTelegramUser({ telegramUserId, telegramUsername = null, targetProfileId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      changed: false,
      created: false,
      duplicate: false,
      blocked: false,
      throttled: false,
      reason: 'DATABASE_URL is not configured',
      request: null,
      target: null,
      invoice: null
    };
  }

  return withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    const profile = await getProfileSnapshotByUserId(client, user.id);
    const { actionThrottleSeconds } = getRuntimeGuardConfig();
    const guard = await tryAcquireUserActionGuard(client, {
      guardKey: `contact_unlock:${user.id}:${targetProfileId}`,
      ttlSeconds: actionThrottleSeconds
    });

    if (!guard.acquired) {
      return {
        persistenceEnabled: true,
        changed: false,
        created: false,
        duplicate: false,
        blocked: false,
        throttled: true,
        reason: 'contact_unlock_request_throttled',
        request: null,
        target: null,
        invoice: null
      };
    }

    if (!profile?.linkedin_sub) {
      return {
        persistenceEnabled: true,
        changed: false,
        created: false,
        duplicate: false,
        blocked: true,
        throttled: false,
        reason: 'connect_linkedin_before_contact_unlock',
        request: null,
        target: null,
        invoice: null
      };
    }

    const { contactUnlockPriceStars } = getPricingConfig();
    const result = await createOrGetContactUnlockRequest(client, {
      requesterUserId: user.id,
      targetProfileId,
      priceStars: contactUnlockPriceStars
    });

    const request = result.request || null;
    const target = result.target || null;
    const invoice = request && request.status !== 'revealed'
      ? {
        payload: buildContactUnlockInvoicePayload(request.contact_unlock_request_id),
        amountStars: request.price_stars_snapshot,
        title: `Direct contact request`,
        description: `Request direct Telegram contact for ${target?.display_name || 'this member'}. Recipient approval is required.`
      }
      : null;

    return {
      persistenceEnabled: true,
      changed: Boolean(result.created),
      created: Boolean(result.created),
      duplicate: Boolean(result.duplicate),
      blocked: Boolean(result.blocked),
      throttled: false,
      reason: result.reason,
      request,
      target,
      invoice
    };
  });
}

export async function confirmContactUnlockPaymentForTelegramUser({
  telegramUserId,
  telegramUsername = null,
  requestId,
  telegramPaymentChargeId,
  providerPaymentChargeId = null
}) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      changed: false,
      blocked: false,
      duplicate: false,
      reason: 'DATABASE_URL is not configured',
      request: null
    };
  }

  const paymentResult = await withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    return markContactUnlockRequestPaymentConfirmed(client, {
      requestId,
      requesterUserId: user.id,
      telegramPaymentChargeId,
      providerPaymentChargeId
    });
  });

  if (paymentResult.changed && paymentResult.request) {
    await notifyOwnerOfPaidRequest(paymentResult.request).catch((error) => {
      console.warn('[contact unlock] owner notify failed', error?.message || error);
    });
    await notifyRequesterOfPaidRequest(paymentResult.request).catch((error) => {
      console.warn('[contact unlock] requester paid notify failed', error?.message || error);
    });
  }

  return {
    persistenceEnabled: true,
    ...paymentResult
  };
}

export async function decideContactUnlockRequestForTelegramUser({ telegramUserId, telegramUsername = null, requestId, decision }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      changed: false,
      blocked: false,
      duplicate: false,
      reason: 'DATABASE_URL is not configured',
      request: null
    };
  }

  const result = await withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    const decisionResult = await decideContactUnlockRequest(client, { userId: user.id, requestId, decision });
    if (!decisionResult.request) {
      return decisionResult;
    }
    const envelope = await getContactUnlockRequestPaymentEnvelope(client, { requestId });
    const requesterView = envelope?.requester_user_id
      ? await getContactUnlockRequestDetailByUserId(client, { userId: envelope.requester_user_id, requestId })
      : { request: null };
    return {
      ...decisionResult,
      requesterTelegramUserId: envelope?.requester_telegram_user_id || null,
      requesterRequest: requesterView?.request || null
    };
  });

  if (result.changed && result.request) {
    await notifyRequesterOfDecision(result).catch((error) => {
      console.warn('[contact unlock] requester decision notify failed', error?.message || error);
    });
  }

  return {
    persistenceEnabled: true,
    ...result
  };
}

export async function loadContactUnlockRequestDetailForTelegramUser({ telegramUserId, telegramUsername = null, requestId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      request: null,
      profile: null,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    const profile = await getProfileSnapshotByUserId(client, user.id);
    const result = await getContactUnlockRequestDetailByUserId(client, { userId: user.id, requestId });
    return {
      persistenceEnabled: true,
      request: result.request || null,
      profile,
      blocked: Boolean(result.blocked),
      reason: result.reason
    };
  });
}
