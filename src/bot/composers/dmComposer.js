import { Composer } from 'grammy';
import { safeEditOrReply } from '../../lib/telegram/safeEditOrReply.js';
import {
  beginDmReplyComposeForTelegramUser,
  beginDmRequestComposeForTelegramUser,
  confirmDmPaymentForTelegramUser,
  decideDmThreadForTelegramUser,
  getDmThreadInvoiceForTelegramUser,
  loadDmThreadDetailForTelegramUser,
  parseDmInvoicePayload
} from '../../lib/storage/dmStore.js';
import { formatDmDecisionReason, formatDmRequestReason, formatUserFacingError } from '../utils/notices.js';

async function sendDmInvoice(ctx, invoice) {
  return ctx.api.raw.sendInvoice({
    chat_id: ctx.from.id,
    title: invoice.title,
    description: invoice.description,
    payload: invoice.payload,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: 'DM request', amount: invoice.amountStars }]
  });
}

export function createDmComposer({ clearAllPendingInputs, buildDmInboxSurface, buildDmThreadSurface }) {
  const composer = new Composer();

  composer.command('dm', async (ctx) => {
    await clearAllPendingInputs(ctx.from.id);
    const surface = await buildDmInboxSurface(ctx);
    await ctx.reply(surface.text, { reply_markup: surface.reply_markup });
  });

  composer.callbackQuery('dm:inbox', async (ctx) => {
    await ctx.answerCallbackQuery();
    await clearAllPendingInputs(ctx.from.id);
    const surface = await buildDmInboxSurface(ctx);
    await safeEditOrReply(ctx, surface.text, { reply_markup: surface.reply_markup });
  });

  composer.callbackQuery(/^dir:dm:(\d+):(\d+)$/, async (ctx) => {
    const profileId = Number.parseInt(ctx.match?.[1] || '0', 10);
    await clearAllPendingInputs(ctx.from.id);

    const result = await beginDmRequestComposeForTelegramUser({
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
      thread: null,
      target: null
    }));

    if (!result.persistenceEnabled) {
      await ctx.answerCallbackQuery({ text: 'Persistence is disabled in this environment.' });
      return;
    }

    if (result.blocked || result.throttled) {
      await ctx.answerCallbackQuery({ text: formatDmRequestReason(result.reason) });
      return;
    }

    if (result.duplicate && result.thread?.dm_thread_id) {
      const surface = await buildDmThreadSurface(ctx, result.thread.dm_thread_id, `ℹ️ ${formatDmRequestReason(result.reason)}`);
      await safeEditOrReply(ctx, surface.text, { reply_markup: surface.reply_markup });
      return;
    }

    await ctx.answerCallbackQuery({ text: 'Send your first DM request message in chat.' });
    await ctx.reply([
      `💬 DM request to ${result.target?.display_name || 'this member'}`,
      '',
      'Reply with the first message now.',
      'Recipient approval is required before the conversation becomes active.',
      'After you send the message, you will be asked to pay the DM request fee.'
    ].join('\n'));
  });

  composer.callbackQuery(/^dm:view:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await clearAllPendingInputs(ctx.from.id);
    const threadId = Number.parseInt(ctx.match?.[1] || '0', 10);
    const surface = await buildDmThreadSurface(ctx, threadId);
    await safeEditOrReply(ctx, surface.text, { reply_markup: surface.reply_markup });
  });

  composer.callbackQuery(/^dm:send:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await clearAllPendingInputs(ctx.from.id);
    const threadId = Number.parseInt(ctx.match?.[1] || '0', 10);
    const result = await beginDmReplyComposeForTelegramUser({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null,
      threadId
    }).catch((error) => ({
      persistenceEnabled: true,
      changed: false,
      blocked: false,
      reason: String(error?.message || error),
      thread: null
    }));

    if (!result.persistenceEnabled) {
      await ctx.reply('⚠️ Persistence is disabled in this environment.');
      return;
    }

    if (!result.changed) {
      const surface = await buildDmThreadSurface(ctx, threadId, `⚠️ ${formatDmRequestReason(result.reason)}`);
      await safeEditOrReply(ctx, surface.text, { reply_markup: surface.reply_markup });
      return;
    }

    await ctx.reply([
      `💬 Reply to ${result.thread?.display_name || 'this member'}`,
      '',
      'Send your next text message in chat now.',
      'It will be delivered inside this active DM thread.'
    ].join('\n'));
  });

  composer.callbackQuery(/^dm:pay:(\d+)$/, async (ctx) => {
    const threadId = Number.parseInt(ctx.match?.[1] || '0', 10);
    await clearAllPendingInputs(ctx.from.id);
    const result = await getDmThreadInvoiceForTelegramUser({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null,
      threadId
    }).catch((error) => ({
      persistenceEnabled: true,
      blocked: false,
      reason: String(error?.message || error),
      thread: null,
      invoice: null
    }));

    if (!result.persistenceEnabled) {
      await ctx.answerCallbackQuery({ text: 'Persistence is disabled in this environment.' });
      return;
    }

    if (result.blocked || !result.invoice) {
      await ctx.answerCallbackQuery({ text: formatDmRequestReason(result.reason) });
      return;
    }

    try {
      await sendDmInvoice(ctx, result.invoice);
      await ctx.answerCallbackQuery({ text: `Invoice sent • ${result.invoice.amountStars}⭐` });
    } catch (error) {
      await ctx.answerCallbackQuery({ text: formatUserFacingError(error?.message || error, 'Could not open the DM payment sheet right now.') });
    }
  });

  composer.callbackQuery(/^dm:(acc|dec|blk|rpt):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await clearAllPendingInputs(ctx.from.id);
    const decision = ctx.match?.[1];
    const threadId = Number.parseInt(ctx.match?.[2] || '0', 10);

    const result = await decideDmThreadForTelegramUser({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null,
      threadId,
      decision
    }).catch((error) => ({
      persistenceEnabled: true,
      changed: false,
      duplicate: false,
      blocked: false,
      reason: String(error?.message || error),
      thread: null
    }));

    let notice = 'DM thread updated.';
    if (!result.persistenceEnabled) {
      notice = '⚠️ Persistence is disabled in this environment.';
    } else if (result.changed && result.reason === 'dm_thread_accepted') {
      notice = `✅ Accepted DM request from ${result.thread?.display_name || 'this member'}. The conversation is now active.`;
    } else if (result.changed && result.reason === 'dm_thread_declined') {
      notice = `✅ Declined DM request from ${result.thread?.display_name || 'this member'}.`;
    } else if (result.changed && result.reason === 'dm_thread_reported') {
      notice = '✅ Reported and blocked this DM request.';
    } else if (result.changed && result.reason === 'dm_thread_blocked') {
      notice = '✅ Blocked this DM request.';
    } else if (result.duplicate) {
      notice = `ℹ️ ${formatDmDecisionReason(result.reason)}`;
    } else if (result.blocked) {
      notice = `⚠️ ${formatDmDecisionReason(result.reason)}`;
    } else {
      notice = `⚠️ ${formatUserFacingError(result.reason, formatDmDecisionReason(result.reason))}`;
    }

    const surface = result.thread?.dm_thread_id
      ? await buildDmThreadSurface(ctx, result.thread.dm_thread_id, notice)
      : await buildDmInboxSurface(ctx, notice);
    await safeEditOrReply(ctx, surface.text, { reply_markup: surface.reply_markup });
  });

  composer.on('pre_checkout_query', async (ctx, next) => {
    const parsed = parseDmInvoicePayload(ctx.preCheckoutQuery?.invoice_payload);
    if (!parsed) {
      return next();
    }

    const detail = await loadDmThreadDetailForTelegramUser({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null,
      threadId: parsed.threadId
    }).catch(() => ({ persistenceEnabled: true, thread: null, blocked: true, reason: 'dm_thread_missing' }));

    const ok = Boolean(detail.thread && detail.thread.status === 'payment_pending');
    await ctx.api.raw.answerPreCheckoutQuery({
      pre_checkout_query_id: ctx.preCheckoutQuery.id,
      ok,
      ...(ok ? {} : { error_message: formatDmRequestReason(detail.reason) })
    });
  });

  composer.on('message:successful_payment', async (ctx, next) => {
    const payment = ctx.message?.successful_payment;
    const parsed = parseDmInvoicePayload(payment?.invoice_payload);
    if (!parsed) {
      return next();
    }

    const result = await confirmDmPaymentForTelegramUser({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null,
      threadId: parsed.threadId,
      telegramPaymentChargeId: payment.telegram_payment_charge_id,
      providerPaymentChargeId: payment.provider_payment_charge_id || null
    }).catch((error) => ({
      persistenceEnabled: true,
      changed: false,
      duplicate: false,
      blocked: false,
      reason: String(error?.message || error),
      thread: null
    }));

    if (result.changed) {
      await ctx.reply('✅ DM request paid. It is now waiting for recipient approval.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '📨 DM inbox', callback_data: 'dm:inbox' }],
            [{ text: '🧾 View thread', callback_data: `dm:view:${parsed.threadId}` }]
          ]
        }
      });
      return;
    }

    if (result.duplicate) {
      await ctx.reply(`ℹ️ ${formatDmRequestReason(result.reason)}`);
      return;
    }

    await ctx.reply(`⚠️ ${formatUserFacingError(result.reason, 'Could not finalize this DM payment right now.')}`);
  });

  return composer;
}
