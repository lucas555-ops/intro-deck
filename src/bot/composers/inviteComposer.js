import { Composer } from 'grammy';
import { safeEditOrReply } from '../../lib/telegram/safeEditOrReply.js';
import { attemptInviteAttributionForTelegramUser } from '../../lib/storage/inviteStore.js';
import { buildInlineInviteResult } from '../../lib/telegram/render.js';

function parseStartParam(ctx) {
  const text = String(ctx.message?.text || '').trim();
  const parts = text.split(/\s+/, 2);
  return parts.length > 1 ? parts[1].trim() : null;
}

function formatInviteStartNotice(result) {
  if (!result || !result.persistenceEnabled) {
    return null;
  }

  if (result.created) {
    const inviter = result.invitedBy?.displayName || 'your contact';
    return `✅ Invite linked: you joined from ${inviter}.`;
  }

  if (result.alreadyLinked) {
    return 'ℹ️ Invite already linked earlier.';
  }

  if (result.existingUser) {
    return 'ℹ️ Invite link ignored: referral credit only applies on the first start.';
  }

  if (result.invalid) {
    return result.reason === 'self_referral'
      ? '⚠️ Invite link ignored: you cannot use your own invite link.'
      : '⚠️ Invite link ignored: this link is not valid for invite credit.';
  }

  return null;
}

export function createInviteComposer({
  clearAllPendingInputs,
  buildHomeSurface,
  buildInviteSurface,
  buildInviteLinkSurface,
  buildInviteCardMessage
}) {
  const composer = new Composer();

  const renderHome = async (ctx, method = 'edit', notice = null) => {
    await clearAllPendingInputs(ctx.from.id);
    const surface = await buildHomeSurface(ctx, notice);
    if (method === 'reply') {
      await ctx.reply(surface.text, {
        reply_markup: surface.reply_markup,
        ...(surface.parse_mode ? { parse_mode: surface.parse_mode } : {}),
        ...(surface.disable_web_page_preview ? { disable_web_page_preview: true } : {})
      });
      return;
    }
    await safeEditOrReply(ctx, surface.text, {
      reply_markup: surface.reply_markup,
      ...(surface.parse_mode ? { parse_mode: surface.parse_mode } : {}),
      ...(surface.disable_web_page_preview ? { disable_web_page_preview: true } : {})
    });
  };

  const renderInvite = async (ctx, method = 'edit', notice = null) => {
    await clearAllPendingInputs(ctx.from.id);
    const surface = await buildInviteSurface(ctx, notice);
    const options = {
      reply_markup: surface.reply_markup,
      ...(surface.parse_mode ? { parse_mode: surface.parse_mode } : {}),
      ...(surface.disable_web_page_preview ? { disable_web_page_preview: true } : {})
    };
    if (method === 'reply') {
      await ctx.reply(surface.text, options);
      return;
    }
    await safeEditOrReply(ctx, surface.text, options);
  };

  composer.command('start', async (ctx, next) => {
    const startParam = parseStartParam(ctx);
    const attribution = await attemptInviteAttributionForTelegramUser({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null,
      startParam
    }).catch((error) => ({
      persistenceEnabled: true,
      created: false,
      reason: String(error?.message || error)
    }));

    const notice = formatInviteStartNotice(attribution);
    await renderHome(ctx, 'reply', notice);
    if (typeof next === 'function') {
      return next();
    }
    return undefined;
  });

  composer.command('invite', async (ctx) => {
    await renderInvite(ctx, 'reply');
  });

  composer.callbackQuery('invite:root', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderInvite(ctx, 'edit');
  });

  composer.callbackQuery('invite:show_link', async (ctx) => {
    await ctx.answerCallbackQuery();
    const surface = await buildInviteLinkSurface(ctx);
    await ctx.reply(surface.text, { reply_markup: surface.reply_markup, parse_mode: 'HTML', disable_web_page_preview: true });
  });

  composer.callbackQuery('invite:send_card', async (ctx) => {
    await ctx.answerCallbackQuery('Invite card sent below. Forward it to a contact if you prefer a card.');
    const card = await buildInviteCardMessage(ctx);
    await ctx.reply(card.text, { reply_markup: card.reply_markup, parse_mode: 'HTML', disable_web_page_preview: true });
  });

  composer.inlineQuery(/^invite(?:\s+.*)?$/i, async (ctx) => {
    const surface = await buildInviteCardMessage(ctx).catch(() => null);
    if (!surface?.snapshot?.inviteLink) {
      await ctx.answerInlineQuery([], { is_personal: true, cache_time: 0 });
      return;
    }

    await ctx.answerInlineQuery([
      buildInlineInviteResult({ inviteState: surface.snapshot })
    ], {
      is_personal: true,
      cache_time: 0
    });
  });

  return composer;
}
