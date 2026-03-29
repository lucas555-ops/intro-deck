import { getPricingConfig, getRuntimeGuardConfig, getTelegramConfig } from '../../config/env.js';
import { isDatabaseConfigured, withDbTransaction } from '../../db/pool.js';
import {
  appendDmThreadMessage,
  clearDmComposeSessionByUserId,
  createOrGetDmThreadDraft,
  decideDmThread,
  getActiveDmComposeSessionByTelegramUserId,
  getDmInboxStateByUserId,
  getDmThreadDetailByUserId,
  getDmThreadPaymentEnvelope,
  markDmThreadPaymentConfirmed,
  saveDmFirstMessageDraft,
  startDmComposeSession
} from '../../db/dmRepo.js';
import { getProfileSnapshotByUserId } from '../../db/profileRepo.js';
import { tryAcquireUserActionGuard } from '../../db/runtimeGuardRepo.js';
import { upsertTelegramUser } from '../../db/usersRepo.js';
import { sendTelegramMessage } from '../telegram/botApi.js';
import { createConfirmedPurchaseReceipt, getUserEntitlements } from '../../db/monetizationRepo.js';
import { normalizeProfileFieldValue } from '../profile/contract.js';

const DM_COMPOSE_TTL_MINUTES = 20;

export function buildDmInvoicePayload(threadId) {
  return `dm:${threadId}`;
}

export function parseDmInvoicePayload(payload) {
  const normalized = String(payload || '').trim();
  const match = normalized.match(/^dm:(\d+)$/);
  if (!match) {
    return null;
  }
  const threadId = Number.parseInt(match[1], 10);
  return Number.isFinite(threadId) && threadId > 0 ? { threadId } : null;
}

function validateDmMessageText(text, { firstMessage = false } = {}) {
  const normalized = normalizeProfileFieldValue('ab', text);
  if (firstMessage && normalized.length > 400) {
    return normalized.slice(0, 400);
  }
  return normalized;
}

function buildDmRequestNotification(envelope) {
  return {
    text: [
      '💬 New DM request',
      '',
      `${envelope.initiator_display_name || 'A member'} wants to message you through Intro Deck.`,
      envelope.initiator_headline_user ? `Headline: ${envelope.initiator_headline_user}` : null,
      '',
      `Message: ${envelope.first_message_text}`,
      '',
      'Recipient approval is required before this becomes an active conversation.'
    ].filter(Boolean).join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: '✅ Accept', callback_data: `dm:acc:${envelope.dm_thread_id}` },
          { text: '❌ Decline', callback_data: `dm:dec:${envelope.dm_thread_id}` }
        ],
        [
          { text: '⛔ Block', callback_data: `dm:blk:${envelope.dm_thread_id}` },
          { text: '🚩 Report', callback_data: `dm:rpt:${envelope.dm_thread_id}` }
        ],
        [{ text: '🧾 Open request', callback_data: `dm:view:${envelope.dm_thread_id}` }]
      ]
    }
  };
}

function buildDmDecisionNotification(thread, reason) {
  const lines = ['💬 DM request update', ''];
  if (reason === 'dm_thread_accepted') {
    lines.push(`${thread.display_name || 'This member'} accepted your DM request.`);
    lines.push('The conversation is now active inside the bot.');
  } else if (reason === 'dm_thread_declined') {
    lines.push(`${thread.display_name || 'This member'} declined your DM request.`);
    lines.push('No active conversation was opened.');
  } else if (reason === 'dm_thread_reported') {
    lines.push('Your DM request was reported and blocked.');
  } else {
    lines.push('Your DM request was blocked.');
  }

  return {
    text: lines.join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [{ text: '🧾 View thread', callback_data: `dm:view:${thread.dm_thread_id}` }],
        [{ text: '📨 DM inbox', callback_data: 'dm:inbox' }]
      ]
    }
  };
}

function buildDmMessageNotification({ thread, messageText }) {
  return {
    text: [
      '💬 New DM message',
      '',
      `${thread.display_name || 'A member'} sent a new message:`,
      '',
      messageText
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [{ text: '🧾 Open thread', callback_data: `dm:view:${thread.dm_thread_id}` }],
        [{ text: '📨 DM inbox', callback_data: 'dm:inbox' }]
      ]
    }
  };
}

async function notifyDmRecipientOfPaidRequest(envelope) {
  const { botToken } = getTelegramConfig();
  if (!envelope?.recipient_telegram_user_id) {
    return { sent: false, skipped: true, reason: 'recipient_telegram_user_id_missing' };
  }
  const message = buildDmRequestNotification(envelope);
  await sendTelegramMessage({
    botToken,
    chatId: envelope.recipient_telegram_user_id,
    text: message.text,
    replyMarkup: message.replyMarkup,
    parseMode: null
  });
  return { sent: true, skipped: false, reason: 'recipient_notified' };
}

async function notifyRequesterOfDecision({ requesterTelegramUserId, requesterThread, reason }) {
  const { botToken } = getTelegramConfig();
  if (!requesterTelegramUserId || !requesterThread?.dm_thread_id) {
    return { sent: false, skipped: true, reason: 'requester_telegram_user_id_missing' };
  }
  const message = buildDmDecisionNotification(requesterThread, reason);
  await sendTelegramMessage({
    botToken,
    chatId: requesterTelegramUserId,
    text: message.text,
    replyMarkup: message.replyMarkup,
    parseMode: null
  });
  return { sent: true, skipped: false, reason: 'requester_notified' };
}

async function notifyDmRecipientOfNewMessage({ recipientTelegramUserId, thread, messageText }) {
  const { botToken } = getTelegramConfig();
  if (!recipientTelegramUserId) {
    return { sent: false, skipped: true, reason: 'recipient_telegram_user_id_missing' };
  }
  const message = buildDmMessageNotification({ thread, messageText });
  await sendTelegramMessage({
    botToken,
    chatId: recipientTelegramUserId,
    text: message.text,
    replyMarkup: message.replyMarkup,
    parseMode: null
  });
  return { sent: true, skipped: false, reason: 'recipient_message_notified' };
}

export async function loadDmInboxState({ telegramUserId, telegramUsername = null }) {
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
    const inbox = await getDmInboxStateByUserId(client, { userId: user.id });
    return {
      persistenceEnabled: true,
      inbox,
      profile,
      reason: 'dm_inbox_loaded'
    };
  });
}

export async function beginDmRequestComposeForTelegramUser({ telegramUserId, telegramUsername = null, targetProfileId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      changed: false,
      created: false,
      duplicate: false,
      blocked: false,
      throttled: false,
      reason: 'DATABASE_URL is not configured',
      thread: null,
      target: null,
      pendingSession: null
    };
  }

  return withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    const profile = await getProfileSnapshotByUserId(client, user.id);
    const { actionThrottleSeconds } = getRuntimeGuardConfig();
    const guard = await tryAcquireUserActionGuard(client, {
      guardKey: `dm_begin:${user.id}:${targetProfileId}`,
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
        reason: 'dm_request_throttled',
        thread: null,
        target: null,
        pendingSession: null
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
        reason: 'connect_linkedin_before_dm_request',
        thread: null,
        target: null,
        pendingSession: null
      };
    }

    const { dmOpenPriceStars } = getPricingConfig();
    const result = await createOrGetDmThreadDraft(client, {
      initiatorUserId: user.id,
      targetProfileId,
      priceStars: dmOpenPriceStars
    });

    let pendingSession = null;
    if (result.thread?.dm_thread_id && !result.duplicate && !result.blocked) {
      pendingSession = await startDmComposeSession(client, {
        userId: user.id,
        threadId: result.thread.dm_thread_id,
        composeMode: 'request',
        ttlMinutes: DM_COMPOSE_TTL_MINUTES
      });
    }

    return {
      persistenceEnabled: true,
      changed: Boolean(result.created),
      created: Boolean(result.created),
      duplicate: Boolean(result.duplicate),
      blocked: Boolean(result.blocked),
      throttled: false,
      reason: result.reason,
      thread: result.thread,
      target: result.target,
      pendingSession
    };
  });
}

export async function beginDmReplyComposeForTelegramUser({ telegramUserId, telegramUsername = null, threadId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      changed: false,
      blocked: false,
      thread: null,
      pendingSession: null,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    const detail = await getDmThreadDetailByUserId(client, { userId: user.id, threadId });
    if (!detail.thread) {
      return {
        persistenceEnabled: true,
        changed: false,
        blocked: true,
        thread: null,
        pendingSession: null,
        reason: detail.reason
      };
    }
    if (detail.thread.status !== 'active') {
      return {
        persistenceEnabled: true,
        changed: false,
        blocked: detail.thread.status === 'blocked',
        thread: detail.thread,
        pendingSession: null,
        reason: detail.thread.status === 'declined' ? 'dm_thread_declined' : 'dm_thread_not_active'
      };
    }

    const pendingSession = await startDmComposeSession(client, {
      userId: user.id,
      threadId,
      composeMode: 'reply',
      ttlMinutes: DM_COMPOSE_TTL_MINUTES
    });

    return {
      persistenceEnabled: true,
      changed: true,
      blocked: false,
      thread: detail.thread,
      pendingSession,
      reason: 'dm_reply_compose_started'
    };
  });
}

export async function cancelDmComposeForTelegramUser({ telegramUserId, telegramUsername = null }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      cleared: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    await clearDmComposeSessionByUserId(client, user.id);
    return {
      persistenceEnabled: true,
      cleared: true,
      reason: 'dm_compose_cleared'
    };
  });
}

export async function applyDmComposeInput({ telegramUserId, telegramUsername = null, text }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      consumed: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  let notify = null;
  const result = await withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    const session = await getActiveDmComposeSessionByTelegramUserId(client, telegramUserId);
    if (!session?.user_id) {
      return {
        persistenceEnabled: true,
        consumed: false,
        reason: 'no_active_dm_compose_session'
      };
    }

    if (String(session.user_id) !== String(user.id)) {
      return {
        persistenceEnabled: true,
        consumed: false,
        reason: 'no_active_dm_compose_session'
      };
    }

    const messageText = validateDmMessageText(text, { firstMessage: session.compose_mode === 'request' });
    if (session.compose_mode === 'request') {
      const saveResult = await saveDmFirstMessageDraft(client, {
        threadId: session.thread_id,
        initiatorUserId: user.id,
        messageText
      });
      let thread = saveResult.thread || null;
      let reason = saveResult.reason;
      let autoCovered = false;
      let paymentEnvelope = null;
      if (!saveResult.blocked && thread?.status === 'payment_pending') {
        const entitlements = await getUserEntitlements(client, { userId: user.id });
        if (entitlements.canOpenDmWithoutPayment) {
          const covered = await markDmThreadPaymentConfirmed(client, {
            threadId: session.thread_id,
            initiatorUserId: user.id,
            telegramPaymentChargeId: null,
            providerPaymentChargeId: null
          });
          if (covered.changed) {
            thread = covered.thread || thread;
            reason = 'dm_request_sent_via_pro';
            autoCovered = true;
            paymentEnvelope = covered.envelope || null;
          }
        }
      }
      await clearDmComposeSessionByUserId(client, user.id);
      notify = autoCovered && paymentEnvelope
        ? { type: 'dm_request_paid', envelope: paymentEnvelope }
        : null;
      return {
        persistenceEnabled: true,
        consumed: true,
        composeMode: 'request',
        autoCovered,
        reason,
        blocked: Boolean(saveResult.blocked),
        thread
      };
    }

    const sendResult = await appendDmThreadMessage(client, {
      threadId: session.thread_id,
      senderUserId: user.id,
      messageText
    });
    await clearDmComposeSessionByUserId(client, user.id);
    notify = sendResult.changed
      ? {
        recipientTelegramUserId: sendResult.recipientTelegramUserId,
        thread: sendResult.thread,
        messageText
      }
      : null;
    return {
      persistenceEnabled: true,
      consumed: true,
      composeMode: 'reply',
      reason: sendResult.reason,
      blocked: Boolean(sendResult.blocked),
      thread: sendResult.thread || null
    };
  });

  if (notify?.type === 'dm_request_paid' && notify?.envelope) {
    await notifyDmRecipientOfPaidRequest(notify.envelope).catch((error) => {
      console.warn('[dm] recipient request notify failed', error?.message || error);
    });
  } else if (notify) {
    await notifyDmRecipientOfNewMessage(notify).catch((error) => {
      console.warn('[dm] recipient message notify failed', error?.message || error);
    });
  }

  return result;
}

export async function loadDmThreadDetailForTelegramUser({ telegramUserId, telegramUsername = null, threadId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      thread: null,
      profile: null,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    const profile = await getProfileSnapshotByUserId(client, user.id);
    const result = await getDmThreadDetailByUserId(client, { userId: user.id, threadId });
    return {
      persistenceEnabled: true,
      thread: result.thread || null,
      profile,
      blocked: Boolean(result.blocked),
      reason: result.reason
    };
  });
}

export async function getDmThreadInvoiceForTelegramUser({ telegramUserId, telegramUsername = null, threadId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      blocked: false,
      reason: 'DATABASE_URL is not configured',
      thread: null,
      invoice: null
    };
  }

  return withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    const detail = await getDmThreadDetailByUserId(client, { userId: user.id, threadId });
    if (!detail.thread) {
      return {
        persistenceEnabled: true,
        blocked: true,
        reason: detail.reason,
        thread: null,
        invoice: null
      };
    }
    if (String(detail.thread.initiator_user_id) !== String(user.id)) {
      return {
        persistenceEnabled: true,
        blocked: true,
        reason: 'dm_thread_not_owned_by_user',
        thread: detail.thread,
        invoice: null
      };
    }
    if (detail.thread.status !== 'payment_pending') {
      return {
        persistenceEnabled: true,
        blocked: detail.thread.status === 'blocked',
        reason: detail.thread.status === 'pending_recipient' ? 'dm_payment_already_confirmed' : 'dm_thread_not_ready_for_payment',
        thread: detail.thread,
        invoice: null
      };
    }
    const invoice = {
      payload: buildDmInvoicePayload(threadId),
      amountStars: detail.thread.price_stars_snapshot,
      title: 'DM request',
      description: `Send your first DM request to ${detail.thread.display_name || 'this member'}. Recipient approval is required.`
    };
    return {
      persistenceEnabled: true,
      blocked: false,
      reason: 'dm_invoice_ready',
      thread: detail.thread,
      invoice
    };
  });
}

export async function confirmDmPaymentForTelegramUser({ telegramUserId, telegramUsername = null, threadId, telegramPaymentChargeId, providerPaymentChargeId = null }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      changed: false,
      duplicate: false,
      blocked: false,
      reason: 'DATABASE_URL is not configured',
      thread: null
    };
  }

  const result = await withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    const paymentResult = await markDmThreadPaymentConfirmed(client, {
      threadId,
      initiatorUserId: user.id,
      telegramPaymentChargeId,
      providerPaymentChargeId
    });
    if (paymentResult.changed && paymentResult.thread) {
      await createConfirmedPurchaseReceipt(client, {
        userId: user.id,
        receiptType: 'dm_open',
        productCode: 'dm_request_open',
        amountStars: paymentResult.thread.price_stars_snapshot || getPricingConfig().dmOpenPriceStars,
        relatedEntityType: 'dm_thread',
        relatedEntityId: paymentResult.thread.dm_thread_id,
        telegramPaymentChargeId,
        providerPaymentChargeId,
        rawPayloadSnapshot: { threadId }
      });
    }
    return paymentResult;
  });

  if (result.changed && result.envelope) {
    await notifyDmRecipientOfPaidRequest(result.envelope).catch((error) => {
      console.warn('[dm] recipient request notify failed', error?.message || error);
    });
  }

  return {
    persistenceEnabled: true,
    ...result
  };
}

export async function decideDmThreadForTelegramUser({ telegramUserId, telegramUsername = null, threadId, decision }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      changed: false,
      duplicate: false,
      blocked: false,
      reason: 'DATABASE_URL is not configured',
      thread: null
    };
  }

  const result = await withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    return decideDmThread(client, { userId: user.id, threadId, decision });
  });

  if (result.changed && result.requesterThread) {
    await notifyRequesterOfDecision({
      requesterTelegramUserId: result.requesterTelegramUserId,
      requesterThread: result.requesterThread,
      reason: result.reason
    }).catch((error) => {
      console.warn('[dm] requester decision notify failed', error?.message || error);
    });
  }

  return {
    persistenceEnabled: true,
    ...result
  };
}
