import { Composer } from 'grammy';
import { renderProfilePreviewKeyboard, renderProfileSavedNotice } from '../../lib/telegram/render.js';
import { applyDirectoryFilterInputForTelegramUser } from '../../lib/storage/directoryFilterStore.js';
import { applyProfileFieldInput } from '../../lib/storage/profileEditStore.js';
import { formatUserFacingError } from '../utils/notices.js';

export function createTextComposer({ buildDirectoryFiltersSurface }) {
  const composer = new Composer();

  composer.on('message:text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) {
      return next();
    }

    const profileResult = await applyProfileFieldInput({
      telegramUserId: ctx.from.id,
      text: ctx.message.text
    }).catch((error) => ({
      persistenceEnabled: true,
      consumed: false,
      reason: String(error?.message || error),
      errored: true
    }));

    if (profileResult.consumed) {
      await ctx.reply(renderProfileSavedNotice({
        fieldLabel: profileResult.fieldMeta.label,
        profileSnapshot: profileResult.profile
      }), {
        reply_markup: renderProfilePreviewKeyboard()
      });
      return;
    }

    const directoryResult = await applyDirectoryFilterInputForTelegramUser({
      telegramUserId: ctx.from.id,
      text: ctx.message.text
    }).catch((error) => ({
      persistenceEnabled: true,
      consumed: false,
      reason: String(error?.message || error),
      errored: true
    }));

    if (directoryResult.consumed) {
      const surface = await buildDirectoryFiltersSurface(ctx, `✅ ${directoryResult.inputMeta.label} saved.`);
      await ctx.reply(surface.text, { reply_markup: surface.reply_markup });
      return;
    }

    if (profileResult.errored) {
      await ctx.reply(`⚠️ ${formatUserFacingError(profileResult.reason, 'Could not save this field right now.')}`);
      return;
    }

    if (directoryResult.errored) {
      await ctx.reply(`⚠️ ${formatUserFacingError(directoryResult.reason, 'Could not save this filter right now.')}`);
      return;
    }

    return next();
  });

  return composer;
}
