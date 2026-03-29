import { Composer } from 'grammy';
import { safeEditOrReply } from '../../lib/telegram/safeEditOrReply.js';
import {
  beginContactUnlockPaymentForTelegramUser,
  confirmContactUnlockPaymentForTelegramUser,
  loadContactUnlockRequestDetailForTelegramUser,
  parseContactUnlockInvoicePayload,
  decideContactUnlockRequestForTelegramUser
} from '../../lib/storage/contactUnlockStore.js';
import { formatContactUnlockDecisionReason, formatContactUnlockRequestReason, formatUserFacingError } from '../utils/notices.js';

async function sendContactUnlockInvoice(ctx, invoice) {
  return ctx.api.raw.sendInvoice({
    chat_id: ctx.from.id,
    title: invoice.title,
    description: invoice.description,
    payload: invoice.payload,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: 'Direct contact request', amount: invoice.amountStars }]
  });
}

export function createContactUnlockComposer({
  clearAllPendingInputs,
  buildContactUnlockDetailSurface,
  buildIntroInboxSurface
}) {
  const composer = new Composer();

  composer.callbackQuery(/^dir:unlock:(\d+):(\d+)$/, async (ctx) => {
    const profileId = Number.parseInt(ctx.match?.[1] || '0', 10);
    await clearAllPendingInputs(ctx.from.id);

    const result = await beginContactUnlockPaymentForTelegramUser({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null,
      targetProfileId: profileId
    }).catch((error) => ({
      persistenceEnabled: true,
      changed: false,
      created: false,
      duplicate: false,
      blocked: false,
      throttled: false,
      reason: String(error?.message || error),
      request: null,
      invoice: null
    }));

    if (!result.persistenceEnabled) {
      await ctx.answerCallbackQuery({ text: 'Persistence is disabled in this environment.' });
      return;
    }

    if (result.blocked || result.throttled || !result.invoice) {
      await ctx.answerCallbackQuery({ text: formatContactUnlockRequestReason(result.reason) });
      return;
    }

    try {
      await sendContactUnlockInvoice(ctx, result.invoice);
      await ctx.answerCallbackQuery({ text: `Invoice sent • ${result.invoice.amountStars}⭐` });
    } catch (error) {
      await ctx.answerCallbackQuery({ text: formatUserFacingError(error?.message || error, 'Could not open the payment sheet right now.') });
    }
  });

  composer.callbackQuery(/^cu:view:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await clearAllPendingInputs(ctx.from.id);
    const requestId = Number.parseInt(ctx.match?.[1] || '0', 10);
    const surface = await buildContactUnlockDetailSurface(ctx, requestId);
    await safeEditOrReply(ctx, surface.text, { reply_markup: surface.reply_markup });
  });

  composer.callbackQuery(/^cu:(acc|dec):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await clearAllPendingInputs(ctx.from.id);
    const action = ctx.match?.[1];
    const requestId = Number.parseInt(ctx.match?.[2] || '0', 10);

    const result = await decideContactUnlockRequestForTelegramUser({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null,
      requestId,
      decision: action
    }).catch((error) => ({
      persistenceEnabled: true,
      changed: false,
      duplicate: false,
      blocked: false,
      reason: String(error?.message || error),
      request: null
    }));

    let notice = 'Direct contact request updated.';
    if (!result.persistenceEnabled) {
      notice = '⚠️ Persistence is disabled in this environment.';
    } else if (result.changed && result.reason === 'contact_unlock_revealed') {
      notice = `✅ Approved direct contact request from ${result.request?.display_name || 'this member'}. Your hidden Telegram username is now revealed to the requester.`;
    } else if (result.changed && result.reason === 'contact_unlock_declined') {
      notice = `✅ Declined direct contact request from ${result.request?.display_name || 'this member'}.`;
    } else if (result.duplicate) {
      notice = `ℹ️ ${formatContactUnlockDecisionReason(result.reason)}`;
    } else if (result.blocked) {
      notice = `⚠️ ${formatContactUnlockDecisionReason(result.reason)}`;
    } else {
      notice = `⚠️ ${formatUserFacingError(result.reason, formatContactUnlockDecisionReason(result.reason))}`;
    }

    const surface = result.request?.contact_unlock_request_id
      ? await buildContactUnlockDetailSurface(ctx, result.request.contact_unlock_request_id, notice)
      : await buildIntroInboxSurface(ctx, notice);
    await safeEditOrReply(ctx, surface.text, { reply_markup: surface.reply_markup });
  });

  composer.on('pre_checkout_query', async (ctx, next) => {
    const parsed = parseContactUnlockInvoicePayload(ctx.preCheckoutQuery?.invoice_payload);
    if (!parsed) {
      return next();
    }

    const detail = await loadContactUnlockRequestDetailForTelegramUser({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null,
      requestId: parsed.requestId
    }).catch(() => ({ persistenceEnabled: true, request: null, blocked: true, reason: 'contact_unlock_request_missing' }));

    const ok = Boolean(detail.request && detail.request.status === 'payment_pending');
    await ctx.api.raw.answerPreCheckoutQuery({
      pre_checkout_query_id: ctx.preCheckoutQuery.id,
      ok,
      ...(ok ? {} : { error_message: formatContactUnlockRequestReason(detail.reason) })
    });
  });

  composer.on('message:successful_payment', async (ctx, next) => {
    const payment = ctx.message?.successful_payment;
    const parsed = parseContactUnlockInvoicePayload(payment?.invoice_payload);
    if (!parsed) {
      return next();
    }

    const result = await confirmContactUnlockPaymentForTelegramUser({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null,
      requestId: parsed.requestId,
      telegramPaymentChargeId: payment.telegram_payment_charge_id,
      providerPaymentChargeId: payment.provider_payment_charge_id || null
    }).catch((error) => ({
      persistenceEnabled: true,
      changed: false,
      duplicate: false,
      blocked: false,
      reason: String(error?.message || error),
      request: null
    }));

    if (result.changed) {
      await ctx.reply('✅ Direct contact request paid. It is now waiting for recipient approval.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📥 Inbox', callback_data: 'intro:inbox' }],
            [{ text: '🧾 View request', callback_data: `cu:view:${parsed.requestId}` }]
          ]
        }
      });
      return;
    }

    if (result.duplicate) {
      await ctx.reply(`ℹ️ ${formatContactUnlockRequestReason(result.reason)}`);
      return;
    }

    await ctx.reply(`⚠️ ${formatUserFacingError(result.reason, 'Could not finalize this direct contact payment right now.')}`);
  });

  return composer;
}
