import { Composer } from 'grammy';
import { renderProfilePreviewKeyboard, renderProfileSavedNotice } from '../../lib/telegram/render.js';
import { applyDirectoryFilterInputForTelegramUser } from '../../lib/storage/directoryFilterStore.js';
import { applyAdminCommsTextInput, applyAdminUserNoteInput, loadAdminBroadcastState, loadAdminDirectMessageState, loadAdminNoticeState, loadAdminSearchResults } from '../../lib/storage/adminStore.js';
import { applyProfileFieldInput } from '../../lib/storage/profileEditStore.js';
import { applyDmComposeInput } from '../../lib/storage/dmStore.js';
import { formatUserFacingError } from '../utils/notices.js';

export function createTextComposer({ buildDirectoryFiltersSurface, buildAdminUserCardSurface, buildAdminUserMessageSurface, buildAdminNoticeSurface, buildAdminBroadcastSurface, buildAdminSearchResultsSurface, buildDmThreadSurface }) {
  const composer = new Composer();

  composer.on('message:text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) {
      return next();
    }


    const adminCommsResult = await applyAdminCommsTextInput({
      operatorTelegramUserId: ctx.from.id,
      operatorTelegramUsername: ctx.from.username || null,
      text: ctx.message.text
    }).catch((error) => ({
      persistenceEnabled: true,
      consumed: false,
      reason: String(error?.message || error),
      errored: true
    }));

    if (adminCommsResult.consumed) {
      if (adminCommsResult.session?.inputKind === 'notice_body') {
        const latestNoticeState = await loadAdminNoticeState().catch(() => ({ persistenceEnabled: true, notice: adminCommsResult.state, audienceOptions: [] }));
        const surface = await buildAdminNoticeSurface({
          state: latestNoticeState,
          notice: '✅ Notice text saved.'
        });
        await ctx.reply(surface.text, { reply_markup: surface.reply_markup });
        return;
      }

      if (adminCommsResult.session?.inputKind === 'direct_body') {
        const latestDirectState = await loadAdminDirectMessageState({
          operatorTelegramUserId: ctx.from.id,
          targetUserId: adminCommsResult.session?.targetUserId,
          segmentKey: adminCommsResult.session?.segmentKey || 'all',
          page: adminCommsResult.session?.page || 0
        }).catch(() => ({ persistenceEnabled: true, draft: adminCommsResult.state }));
        const surface = await buildAdminUserMessageSurface({
          card: null,
          state: latestDirectState,
          segmentKey: adminCommsResult.session?.segmentKey || 'all',
          page: adminCommsResult.session?.page || 0,
          notice: '✅ Direct message text saved.'
        });
        await ctx.reply(surface.text, { reply_markup: surface.reply_markup });
        return;
      }

      if (String(adminCommsResult.session?.inputKind || '').startsWith('search_')) {
        const scopeKey = String(adminCommsResult.session?.inputKind || '').replace(/^search_/, '');
        const searchState = await loadAdminSearchResults({
          operatorTelegramUserId: ctx.from.id,
          scopeKey,
          page: 0
        }).catch(() => ({ persistenceEnabled: true, scopeKey, queryText: ctx.message.text, results: [], totalCount: 0, page: 0, pageSize: 8, hasPrev: false, hasNext: false }));
        const surface = await buildAdminSearchResultsSurface({
          scopeKey,
          state: searchState,
          notice: `✅ Search saved for “${ctx.message.text.trim()}”.`
        });
        await ctx.reply(surface.text, { reply_markup: surface.reply_markup });
        return;
      }

      const latestBroadcastState = await loadAdminBroadcastState().catch(() => ({ persistenceEnabled: true, draft: adminCommsResult.state, estimate: 0, audienceOptions: [] }));
      const surface = await buildAdminBroadcastSurface({
        state: latestBroadcastState,
        notice: '✅ Broadcast text saved.'
      });
      await ctx.reply(surface.text, { reply_markup: surface.reply_markup });
      return;
    }

    const adminNoteResult = await applyAdminUserNoteInput({
      operatorTelegramUserId: ctx.from.id,
      operatorTelegramUsername: ctx.from.username || null,
      text: ctx.message.text
    }).catch((error) => ({
      persistenceEnabled: true,
      consumed: false,
      reason: String(error?.message || error),
      errored: true
    }));

    if (adminNoteResult.consumed) {
      const surface = await buildAdminUserCardSurface({
        card: adminNoteResult.card,
        segmentKey: adminNoteResult.session?.segmentKey || 'all',
        page: adminNoteResult.session?.page || 0,
        notice: '✅ Operator note saved.'
      });
      await ctx.reply(surface.text, { reply_markup: surface.reply_markup });
      return;
    }


    const dmResult = await applyDmComposeInput({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null,
      text: ctx.message.text
    }).catch((error) => ({
      persistenceEnabled: true,
      consumed: false,
      reason: String(error?.message || error),
      errored: true
    }));

    if (dmResult.consumed) {
      const notice = dmResult.composeMode === 'request'
        ? (dmResult.autoCovered
          ? '✅ First DM request message sent via Pro. It is now waiting for recipient approval.'
          : '✅ First DM request message saved. Pay to deliver it to the recipient.')
        : '✅ DM message sent.';
      const surface = await buildDmThreadSurface(ctx, dmResult.thread?.dm_thread_id, notice);
      await ctx.reply(surface.text, { reply_markup: surface.reply_markup });
      return;
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
      if (profileResult.blocked && profileResult.reason === 'hidden_telegram_username_requires_migration') {
        await ctx.reply('⚠️ Hidden Telegram username is not available in this database yet. Apply STEP046 migration 019_contact_unlock_requests.sql first.', {
          reply_markup: renderProfilePreviewKeyboard()
        });
        return;
      }

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

    if (adminCommsResult.errored) {
      await ctx.reply(`⚠️ ${formatUserFacingError(adminCommsResult.reason, 'Could not save this admin message right now.')}`);
      return;
    }

    if (adminNoteResult.errored) {
      await ctx.reply(`⚠️ ${formatUserFacingError(adminNoteResult.reason, 'Could not save this operator note right now.')}`);
      return;
    }

    if (dmResult.errored) {
      await ctx.reply(`⚠️ ${formatUserFacingError(dmResult.reason, 'Could not save this DM message right now.')}`);
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
