import { Composer } from 'grammy';
import { safeEditOrReply } from '../../lib/telegram/safeEditOrReply.js';
import {
  confirmProSubscriptionPaymentForTelegramUser,
  getProSubscriptionInvoiceForTelegramUser,
  parseProInvoicePayload
} from '../../lib/storage/monetizationStore.js';
import { formatUserFacingError } from '../utils/notices.js';

async function sendSubscriptionInvoice(ctx, invoice) {
  return ctx.api.raw.sendInvoice({
    chat_id: ctx.from.id,
    title: invoice.title,
    description: invoice.description,
    payload: invoice.payload,
    provider_token: '',
    currency: 'XTR',
    prices: [{ label: 'Intro Deck Pro', amount: invoice.amountStars }]
  });
}

export function createMonetizationComposer({ clearAllPendingInputs, buildPricingSurface }) {
  const composer = new Composer();

  async function renderPricing(ctx, method = 'edit', notice = null) {
    await clearAllPendingInputs(ctx.from.id);
    const surface = await buildPricingSurface(ctx, notice);
    if (method === 'reply') {
      await ctx.reply(surface.text, { reply_markup: surface.reply_markup });
      return;
    }
    await safeEditOrReply(ctx, surface.text, { reply_markup: surface.reply_markup });
  }

  composer.command('plans', async (ctx) => {
    await renderPricing(ctx, 'reply');
  });

  composer.callbackQuery('plans:root', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderPricing(ctx, 'edit');
  });

  composer.callbackQuery('plans:buy:pro', async (ctx) => {
    await clearAllPendingInputs(ctx.from.id);
    const result = await getProSubscriptionInvoiceForTelegramUser({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null
    }).catch((error) => ({
      persistenceEnabled: true,
      blocked: false,
      invoice: null,
      subscription: null,
      reason: String(error?.message || error)
    }));

    if (!result.persistenceEnabled) {
      await ctx.answerCallbackQuery({ text: 'Persistence is disabled in this environment.' });
      return;
    }

    if (result.blocked || !result.invoice) {
      const text = result.reason === 'pro_subscription_already_active'
        ? 'Pro is already active on this account.'
        : formatUserFacingError(result.reason, 'Could not open the Pro payment sheet right now.');
      await ctx.answerCallbackQuery({ text });
      return;
    }

    try {
      await sendSubscriptionInvoice(ctx, result.invoice);
      await ctx.answerCallbackQuery({ text: `Invoice sent • ${result.invoice.amountStars}⭐` });
    } catch (error) {
      await ctx.answerCallbackQuery({ text: formatUserFacingError(error?.message || error, 'Could not open the Pro payment sheet right now.') });
    }
  });

  composer.on('pre_checkout_query', async (ctx, next) => {
    const parsed = parseProInvoicePayload(ctx.preCheckoutQuery?.invoice_payload);
    if (!parsed) {
      return next();
    }

    await ctx.api.raw.answerPreCheckoutQuery({
      pre_checkout_query_id: ctx.preCheckoutQuery.id,
      ok: parsed.planCode === 'pro_monthly',
      ...(parsed.planCode === 'pro_monthly' ? {} : { error_message: 'Unsupported subscription plan.' })
    });
  });

  composer.on('message:successful_payment', async (ctx, next) => {
    const payment = ctx.message?.successful_payment;
    const parsed = parseProInvoicePayload(payment?.invoice_payload);
    if (!parsed) {
      return next();
    }

    const result = await confirmProSubscriptionPaymentForTelegramUser({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null,
      telegramPaymentChargeId: payment.telegram_payment_charge_id,
      providerPaymentChargeId: payment.provider_payment_charge_id || null,
      payload: payment.invoice_payload
    }).catch((error) => ({
      persistenceEnabled: true,
      changed: false,
      duplicate: false,
      blocked: false,
      subscription: null,
      reason: String(error?.message || error)
    }));

    if (result.changed) {
      await ctx.reply('✅ Intro Deck Pro is active now. Direct contact requests and DM request opens are included while your subscription is active.', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '⭐ Open plans', callback_data: 'plans:root' }],
            [{ text: '🏠 Home', callback_data: 'home:root' }]
          ]
        }
      });
      return;
    }

    if (result.duplicate) {
      await ctx.reply('ℹ️ This Pro payment was already confirmed.');
      return;
    }

    await ctx.reply(`⚠️ ${formatUserFacingError(result.reason, 'Could not finalize this Pro payment right now.')}`);
  });

  return composer;
}
