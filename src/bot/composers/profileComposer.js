import { Composer } from 'grammy';
import { renderProfileInputKeyboard, renderProfileInputPrompt, renderProfilePreviewKeyboard, renderProfileSavedNotice } from '../../lib/telegram/render.js';
import { safeEditOrReply } from '../../lib/telegram/safeEditOrReply.js';
import { cancelDirectoryFilterInputForTelegramUser } from '../../lib/storage/directoryFilterStore.js';
import {
  beginProfileFieldEdit,
  clearProfileSkillsForTelegramUser,
  toggleProfileContactModeForTelegramUser,
  toggleProfileSkillForTelegramUser,
  toggleProfileVisibilityForTelegramUser
} from '../../lib/storage/profileEditStore.js';
import { formatUserFacingError } from '../utils/notices.js';

export function createProfileComposer({
  clearAllPendingInputs,
  buildProfileMenuSurface,
  buildProfilePreviewSurface,
  buildProfileSkillsSurface
}) {
  const composer = new Composer();

  const renderProfileMenu = async (ctx, method = 'edit', notice = null) => {
    await clearAllPendingInputs(ctx.from.id);
    const surface = await buildProfileMenuSurface(ctx, notice);
    if (method === 'reply') {
      await ctx.reply(surface.text, { reply_markup: surface.reply_markup });
      return;
    }
    await safeEditOrReply(ctx, surface.text, { reply_markup: surface.reply_markup });
  };

  composer.command('profile', async (ctx) => {
    await renderProfileMenu(ctx, 'reply');
  });

  composer.callbackQuery('p:menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderProfileMenu(ctx, 'edit');
  });

  composer.callbackQuery('p:prev', async (ctx) => {
    await ctx.answerCallbackQuery();
    await cancelDirectoryFilterInputForTelegramUser({ telegramUserId: ctx.from.id }).catch(() => null);
    const surface = await buildProfilePreviewSurface(ctx);
    await safeEditOrReply(ctx, surface.text, { reply_markup: surface.reply_markup });
  });

  composer.callbackQuery('p:sk', async (ctx) => {
    await ctx.answerCallbackQuery();
    await clearAllPendingInputs(ctx.from.id);
    const surface = await buildProfileSkillsSurface(ctx);
    await safeEditOrReply(ctx, surface.text, { reply_markup: surface.reply_markup });
  });

  composer.callbackQuery('p:sk:clr', async (ctx) => {
    await ctx.answerCallbackQuery();
    const result = await clearProfileSkillsForTelegramUser({
      telegramUserId: ctx.from.id
    }).catch((error) => ({
      persistenceEnabled: true,
      changed: false,
      reason: String(error?.message || error)
    }));

    let notice = 'Skills cleared.';
    if (!result.persistenceEnabled) {
      notice = '⚠️ Persistence is disabled in this environment.';
    } else if (!result.changed) {
      notice = `⚠️ ${formatUserFacingError(result.reason, 'Could not clear skills right now.')}`;
    } else {
      notice = '✅ Skills cleared. Add at least 1 skill to become directory-ready.';
    }

    const surface = await buildProfileSkillsSurface(ctx, notice);
    await safeEditOrReply(ctx, surface.text, { reply_markup: surface.reply_markup });
  });

  composer.callbackQuery(/^p:skt:([a-z]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const skillSlug = ctx.match?.[1];

    const result = await toggleProfileSkillForTelegramUser({
      telegramUserId: ctx.from.id,
      skillSlug
    }).catch((error) => ({
      persistenceEnabled: true,
      changed: false,
      reason: String(error?.message || error)
    }));

    let notice = 'Skill updated.';
    if (!result.persistenceEnabled) {
      notice = '⚠️ Persistence is disabled in this environment.';
    } else if (!result.changed) {
      notice = `⚠️ ${formatUserFacingError(result.reason, 'Could not update this skill right now.')}`;
    } else {
      notice = result.toggledOn
        ? `✅ Added skill: ${result.skillMeta.label}`
        : `✅ Removed skill: ${result.skillMeta.label}`;
    }

    const surface = await buildProfileSkillsSurface(ctx, notice);
    await safeEditOrReply(ctx, surface.text, { reply_markup: surface.reply_markup });
  });

  composer.callbackQuery(/^p:ed:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const fieldKey = ctx.match?.[1];

    try {
      await cancelDirectoryFilterInputForTelegramUser({ telegramUserId: ctx.from.id }).catch(() => null);
      const editState = await beginProfileFieldEdit({
        telegramUserId: ctx.from.id,
        fieldKey
      });

      await ctx.reply(renderProfileInputPrompt({
        fieldKey,
        profileSnapshot: editState.profile
      }), {
        reply_markup: renderProfileInputKeyboard()
      });
    } catch (error) {
      await renderProfileMenu(ctx, 'edit', `⚠️ ${formatUserFacingError(error?.message || error, 'Could not open this editor right now.')}`);
    }
  });


  composer.callbackQuery('p:cm', async (ctx) => {
    await ctx.answerCallbackQuery();
    const result = await toggleProfileContactModeForTelegramUser({
      telegramUserId: ctx.from.id
    }).catch((error) => ({
      persistenceEnabled: true,
      changed: false,
      blocked: false,
      reason: String(error?.message || error)
    }));

    let notice = 'Contact mode updated.';
    if (!result.persistenceEnabled) {
      notice = '⚠️ Persistence is disabled in this environment.';
    } else if (result.blocked && result.reason === 'hidden_telegram_username_required_for_paid_unlock') {
      notice = '⚠️ Add your hidden Telegram username first before enabling paid direct contact requests.';
    } else if (result.blocked) {
      notice = `⚠️ ${formatUserFacingError(result.reason, 'Could not update contact mode right now.')}`;
    } else if (!result.changed) {
      notice = `⚠️ ${formatUserFacingError(result.reason, 'Could not update contact mode right now.')}`;
    } else {
      notice = result.profile?.contact_mode === 'paid_unlock_requires_approval'
        ? '✅ Contact mode is now direct contact by paid request.'
        : '✅ Contact mode is now intro only.';
    }

    const surface = await buildProfilePreviewSurface(ctx, notice);
    await safeEditOrReply(ctx, surface.text, { reply_markup: surface.reply_markup });
  });

  composer.callbackQuery('p:vis', async (ctx) => {
    await ctx.answerCallbackQuery();
    const result = await toggleProfileVisibilityForTelegramUser({
      telegramUserId: ctx.from.id
    }).catch((error) => ({
      persistenceEnabled: true,
      changed: false,
      blocked: false,
      reason: String(error?.message || error)
    }));

    let notice = 'Visibility updated.';
    if (!result.persistenceEnabled) {
      notice = '⚠️ Persistence is disabled in this environment.';
    } else if (result.blocked) {
      notice = '⚠️ Complete all required fields and add at least 1 skill before listing in the directory.';
    } else if (!result.changed) {
      notice = `⚠️ ${formatUserFacingError(result.reason, 'Could not update directory visibility right now.')}`;
    } else {
      notice = `✅ Visibility is now ${result.profile.visibility_status}.`;
    }

    const surface = await buildProfilePreviewSurface(ctx, notice);
    await safeEditOrReply(ctx, surface.text, { reply_markup: surface.reply_markup });
  });

  return composer;
}
