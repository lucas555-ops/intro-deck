import { Composer } from 'grammy';
import { safeEditOrReply } from '../../lib/telegram/safeEditOrReply.js';
import { isOperatorTelegramUser } from '../../config/env.js';
import {
  activateAdminNoticeState,
  beginAdminBroadcastEdit,
  beginAdminDirectMessageEdit,
  beginAdminNoticeEdit,
  beginAdminUserNoteEdit,
  cancelAdminCommsEdit,
  cancelAdminUserNoteEdit,
  clearAdminBroadcastDraftState,
  clearAdminDirectMessageDraftState,
  disableAdminNoticeState,
  loadAdminAuditPage,
  loadAdminAuditRecord,
  loadAdminCommOutbox,
  loadAdminCommOutboxRecord,
  loadAdminCommunicationsState,
  loadAdminBroadcastState,
  loadAdminDeliveryPage,
  loadAdminDeliveryRecord,
  loadAdminDirectMessageState,
  loadAdminIntroDetail,
  loadAdminIntrosPage,
  loadAdminNoticeState,
  loadAdminQualityPage,
  loadAdminUserCard,
  loadAdminUsersPage,
  selectAdminDirectMessageTemplate,
  sendAdminBroadcast,
  sendAdminDirectMessage,
  updateAdminBroadcastAudienceSelection,
  updateAdminNoticeAudienceSelection,
  updateAdminUserListingVisibility
} from '../../lib/storage/adminStore.js';
import { normalizeAdminAuditSegment, normalizeAdminDeliverySegment, normalizeAdminIntroSegment, normalizeAdminQualitySegment, normalizeAdminUserSegment } from '../../db/adminRepo.js';
import { formatUserFacingError } from '../utils/notices.js';

function parseOpsIntroRequestId(text = '') {
  const match = String(text).match(/^\/ops(?:@\w+)?(?:\s+(\d+))?/);
  if (!match?.[1]) {
    return null;
  }

  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parsePage(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function createOperatorComposer({
  clearAllPendingInputs,
  buildOperatorDiagnosticsSurface,
  buildAdminHomeSurface,
  buildAdminOperationsSurface,
  buildAdminCommunicationsSurface,
  buildAdminSystemSurface,
  buildAdminHealthSurface,
  buildAdminOperatorsSurface,
  buildAdminUsersSurface,
  buildAdminUserCardSurface,
  buildAdminUserPublicCardSurface,
  buildAdminUserMessageSurface,
  buildAdminDirectTemplatePickerSurface,
  buildAdminDirectPreviewSurface,
  buildAdminUserNotePromptSurface,
  buildAdminIntrosSurface,
  buildAdminIntroDetailSurface,
  buildAdminDeliverySurface,
  buildAdminDeliveryRecordSurface,
  buildAdminQualitySurface,
  buildAdminAuditSurface,
  buildAdminAuditRecordSurface,
  buildAdminNoticeSurface,
  buildAdminNoticeAudienceSurface,
  buildAdminNoticePreviewSurface,
  buildAdminBroadcastSurface,
  buildAdminBroadcastAudienceSurface,
  buildAdminBroadcastPreviewSurface,
  buildAdminOutboxSurface,
  buildAdminOutboxRecordSurface,
  buildAdminCommsEditPromptSurface,
  buildAdminPlaceholderSurface,
  buildOperatorOnlySurface
}) {
  const composer = new Composer();

  async function renderSurface(ctx, surface, method = 'edit') {
    await clearAllPendingInputs(ctx.from.id);
    if (method === 'reply') {
      await ctx.reply(surface.text, { reply_markup: surface.reply_markup });
      return;
    }

    await safeEditOrReply(ctx, surface.text, { reply_markup: surface.reply_markup });
  }

  async function renderOperatorOnly(ctx, method = 'edit') {
    const surface = await buildOperatorOnlySurface();
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminUsers(ctx, { segmentKey = 'all', page = 0, notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminUsersPage({
      segmentKey,
      page
    }).catch((error) => ({
      persistenceEnabled: true,
      users: [],
      counts: null,
      segmentKey: normalizeAdminUserSegment(segmentKey),
      page: 0,
      totalCount: 0,
      hasPrev: false,
      hasNext: false,
      reason: String(error?.message || error)
    }));

    const surface = await buildAdminUsersSurface({ state, notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminUserCard(ctx, { targetUserId, segmentKey = 'all', page = 0, notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminUserCard({ targetUserId }).catch((error) => ({
      persistenceEnabled: true,
      card: null,
      reason: String(error?.message || error)
    }));

    const surface = await buildAdminUserCardSurface({
      card: state.card,
      segmentKey: normalizeAdminUserSegment(segmentKey),
      page: parsePage(page),
      notice
    });
    await renderSurface(ctx, surface, method);
  }


  async function renderAdminIntros(ctx, { segmentKey = 'all', page = 0, notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminIntrosPage({ segmentKey, page }).catch((error) => ({
      persistenceEnabled: true,
      intros: [],
      counts: null,
      segmentKey: normalizeAdminIntroSegment(segmentKey),
      page: 0,
      totalCount: 0,
      hasPrev: false,
      hasNext: false,
      reason: String(error?.message || error)
    }));

    const surface = await buildAdminIntrosSurface({ state, notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminIntroDetail(ctx, { introRequestId, segmentKey = 'all', page = 0, notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminIntroDetail({ introRequestId }).catch((error) => ({
      persistenceEnabled: true,
      intro: null,
      notificationSummary: null,
      recentReceipts: [],
      reason: String(error?.message || error)
    }));

    const surface = await buildAdminIntroDetailSurface({
      intro: state.intro,
      notificationSummary: state.notificationSummary,
      recentReceipts: state.recentReceipts,
      segmentKey: normalizeAdminIntroSegment(segmentKey),
      page: parsePage(page),
      notice
    });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminDelivery(ctx, { segmentKey = 'all', page = 0, introRequestId = null, notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminDeliveryPage({ segmentKey, page, introRequestId }).catch((error) => ({
      persistenceEnabled: true,
      records: [],
      counts: null,
      segmentKey: normalizeAdminDeliverySegment(segmentKey),
      page: 0,
      totalCount: 0,
      hasPrev: false,
      hasNext: false,
      introRequestId,
      reason: String(error?.message || error)
    }));

    const surface = await buildAdminDeliverySurface({ state, notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminDeliveryRecord(ctx, { notificationReceiptId, backCallback = 'adm:dlv', notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminDeliveryRecord({ notificationReceiptId }).catch((error) => ({
      persistenceEnabled: true,
      record: null,
      reason: String(error?.message || error)
    }));

    const surface = await buildAdminDeliveryRecordSurface({ record: state.record, backCallback, notice });
    await renderSurface(ctx, surface, method);
  }


  async function renderAdminQuality(ctx, { segmentKey = 'listinc', page = 0, notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminQualityPage({ segmentKey, page }).catch((error) => ({
      persistenceEnabled: true,
      users: [],
      counts: null,
      segmentKey: normalizeAdminQualitySegment(segmentKey),
      page: 0,
      totalCount: 0,
      hasPrev: false,
      hasNext: false,
      reason: String(error?.message || error)
    }));

    const surface = await buildAdminQualitySurface({ state, notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminAudit(ctx, { segmentKey = 'all', page = 0, notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminAuditPage({ segmentKey, page }).catch((error) => ({
      persistenceEnabled: true,
      records: [],
      counts: null,
      segmentKey: normalizeAdminAuditSegment(segmentKey),
      page: 0,
      totalCount: 0,
      hasPrev: false,
      hasNext: false,
      reason: String(error?.message || error)
    }));

    const surface = await buildAdminAuditSurface({ state, notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminAuditRecord(ctx, { auditId, backCallback = 'adm:audit', notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminAuditRecord({ auditId }).catch((error) => ({
      persistenceEnabled: true,
      record: null,
      reason: String(error?.message || error)
    }));
    const surface = await buildAdminAuditRecordSurface({ record: state.record, backCallback, notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminCommunications(ctx, { notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminCommunicationsState().catch((error) => ({
      persistenceEnabled: true,
      notice: { body: '', audienceKey: 'ALL', isActive: false },
      broadcastDraft: { body: '', audienceKey: 'ALL_CONNECTED' },
      outboxCount: 0,
      reason: String(error?.message || error)
    }));

    const surface = await buildAdminCommunicationsSurface({ state, notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminNotice(ctx, { notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminNoticeState().catch((error) => ({
      persistenceEnabled: true,
      notice: { body: '', audienceKey: 'ALL', isActive: false },
      audienceOptions: [],
      reason: String(error?.message || error)
    }));

    const surface = await buildAdminNoticeSurface({ state, notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminNoticeAudience(ctx, { notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminNoticeState().catch((error) => ({
      persistenceEnabled: true,
      notice: { body: '', audienceKey: 'ALL', isActive: false },
      audienceOptions: [],
      reason: String(error?.message || error)
    }));
    const surface = await buildAdminNoticeAudienceSurface({ state, notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminNoticePreview(ctx, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminNoticeState().catch((error) => ({
      persistenceEnabled: true,
      notice: { body: '', audienceKey: 'ALL', isActive: false },
      audienceOptions: [],
      reason: String(error?.message || error)
    }));
    const surface = await buildAdminNoticePreviewSurface({ state });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminBroadcast(ctx, { notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminBroadcastState().catch((error) => ({
      persistenceEnabled: true,
      draft: { body: '', audienceKey: 'ALL_CONNECTED' },
      estimate: 0,
      audienceOptions: [],
      reason: String(error?.message || error)
    }));
    const surface = await buildAdminBroadcastSurface({ state, notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminBroadcastAudience(ctx, { notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminBroadcastState().catch((error) => ({
      persistenceEnabled: true,
      draft: { body: '', audienceKey: 'ALL_CONNECTED' },
      estimate: 0,
      audienceOptions: [],
      reason: String(error?.message || error)
    }));
    const surface = await buildAdminBroadcastAudienceSurface({ state, notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminBroadcastPreview(ctx, { notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminBroadcastState().catch((error) => ({
      persistenceEnabled: true,
      draft: { body: '', audienceKey: 'ALL_CONNECTED' },
      estimate: 0,
      audienceOptions: [],
      reason: String(error?.message || error)
    }));
    const surface = await buildAdminBroadcastPreviewSurface({ state, notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminOutbox(ctx, { notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminCommOutbox().catch((error) => ({
      persistenceEnabled: true,
      records: [],
      reason: String(error?.message || error)
    }));
    const surface = await buildAdminOutboxSurface({ records: state.records || [], notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminOutboxRecord(ctx, { outboxId, notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminCommOutboxRecord({ outboxId }).catch((error) => ({
      persistenceEnabled: true,
      record: null,
      reason: String(error?.message || error)
    }));
    const surface = await buildAdminOutboxRecordSurface({ record: state.record, notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminSurface(ctx, target = 'home', method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    let surface;
    switch (target) {
      case 'home':
        surface = await buildAdminHomeSurface();
        break;
      case 'ops':
        surface = await buildAdminOperationsSurface();
        break;
      case 'comms':
        await renderAdminCommunications(ctx, {}, method);
        return;
      case 'sys':
        surface = await buildAdminSystemSurface();
        break;
      case 'health':
        surface = await buildAdminHealthSurface();
        break;
      case 'opscope':
        surface = await buildAdminOperatorsSurface();
        break;
      case 'directory':
        await renderAdminQuality(ctx, {}, method);
        return;
      case 'intros':
        await renderAdminIntros(ctx, {}, method);
        return;
      case 'delivery':
        await renderAdminDelivery(ctx, {}, method);
        return;
      case 'notice':
        await renderAdminNotice(ctx, {}, method);
        return;
      case 'broadcast':
        await renderAdminBroadcast(ctx, {}, method);
        return;
      case 'templates':
        surface = await buildAdminPlaceholderSurface({
          title: '📌 Templates',
          description: 'Templates library and reuse flow land next under Communications.',
          backCallback: 'adm:comms',
          nextStep: 'STEP030'
        });
        break;
      case 'outbox':
        await renderAdminOutbox(ctx, {}, method);
        return;
      case 'audit':
        await renderAdminAudit(ctx, {}, method);
        return;
      default:
        surface = await buildAdminHomeSurface();
        break;
    }

    await renderSurface(ctx, surface, method);
  }

  async function renderOperatorDiagnostics(ctx, options = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const surface = await buildOperatorDiagnosticsSurface(ctx, options);
    await renderSurface(ctx, surface, method);
  }

  composer.command('ops', async (ctx) => {
    const introRequestId = parseOpsIntroRequestId(ctx.message?.text || '');
    if (introRequestId) {
      await renderOperatorDiagnostics(ctx, { introRequestId }, 'reply');
      return;
    }

    await renderAdminSurface(ctx, 'home', 'reply');
  });

  composer.callbackQuery('adm:home', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminSurface(ctx, 'home', 'edit');
  });

  composer.callbackQuery('adm:ops', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminSurface(ctx, 'ops', 'edit');
  });

  composer.callbackQuery('adm:comms', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminSurface(ctx, 'comms', 'edit');
  });

  composer.callbackQuery('adm:sys', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminSurface(ctx, 'sys', 'edit');
  });

  composer.callbackQuery('adm:health', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminSurface(ctx, 'health', 'edit');
  });

  composer.callbackQuery('adm:opscope', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminSurface(ctx, 'opscope', 'edit');
  });

  composer.callbackQuery('adm:audit', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminAudit(ctx, { segmentKey: 'all', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:audit:seg:(all|not|bc|user|relink)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminAudit(ctx, { segmentKey: ctx.match?.[1] || 'all', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:audit:page:(all|not|bc|user|relink):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminAudit(ctx, { segmentKey: ctx.match?.[1] || 'all', page: parsePage(ctx.match?.[2]) }, 'edit');
  });

  composer.callbackQuery(/^adm:audit:open:(\d+):(all|not|bc|user|relink):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const segmentKey = ctx.match?.[2] || 'all';
    const page = parsePage(ctx.match?.[3]);
    await renderAdminAuditRecord(ctx, { auditId: parsePositiveInt(ctx.match?.[1]), backCallback: `adm:audit:page:${segmentKey}:${page}` }, 'edit');
  });

  composer.callbackQuery('adm:usr:list', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminUsers(ctx, { segmentKey: 'all', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:usr:seg:(all|conn|inc|ready|listd|pend)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminUsers(ctx, { segmentKey: ctx.match?.[1] || 'all', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:usr:page:(all|conn|inc|ready|listd|pend):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminUsers(ctx, {
      segmentKey: ctx.match?.[1] || 'all',
      page: parsePage(ctx.match?.[2])
    }, 'edit');
  });

  composer.callbackQuery(/^adm:usr:open:(\d+):(all|conn|inc|ready|listd|pend):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminUserCard(ctx, {
      targetUserId: parsePositiveInt(ctx.match?.[1]),
      segmentKey: ctx.match?.[2] || 'all',
      page: parsePage(ctx.match?.[3])
    }, 'edit');
  });

  composer.callbackQuery(/^adm:card:view:(\d+):(all|conn|inc|ready|listd|pend):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetUserId = parsePositiveInt(ctx.match?.[1]);
    const segmentKey = ctx.match?.[2] || 'all';
    const page = parsePage(ctx.match?.[3]);
    const state = await loadAdminUserCard({ targetUserId }).catch(() => ({ persistenceEnabled: true, card: null }));
    const surface = await buildAdminUserPublicCardSurface({ card: state.card, segmentKey, page });
    await renderSurface(ctx, surface, 'edit');
  });

  composer.callbackQuery(/^adm:card:(hide|unhide):(\d+):(all|conn|inc|ready|listd|pend):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const action = ctx.match?.[1];
    const targetUserId = parsePositiveInt(ctx.match?.[2]);
    const segmentKey = ctx.match?.[3] || 'all';
    const page = parsePage(ctx.match?.[4]);

    const result = await updateAdminUserListingVisibility({
      operatorTelegramUserId: ctx.from.id,
      operatorTelegramUsername: ctx.from.username || null,
      targetUserId,
      nextVisibility: action === 'hide' ? 'hidden' : 'listed'
    }).catch((error) => ({
      persistenceEnabled: true,
      changed: false,
      blocked: false,
      reason: String(error?.message || error),
      card: null
    }));

    let notice = 'Listing updated.';
    if (!result.persistenceEnabled) {
      notice = '⚠️ Persistence is disabled in this environment.';
    } else if (result.blocked) {
      notice = action === 'hide'
        ? '⚠️ Could not hide this listing right now.'
        : '⚠️ This profile must be directory-ready before it can be listed.';
    } else if (!result.changed) {
      notice = `⚠️ ${formatUserFacingError(result.reason, 'Could not update listing visibility right now.')}`;
    } else {
      notice = action === 'hide' ? '✅ Listing hidden.' : '✅ Listing is now visible in the directory.';
    }

    await renderAdminUserCard(ctx, { targetUserId, segmentKey, page, notice }, 'edit');
  });

  composer.callbackQuery(/^adm:card:note:(\d+):(all|conn|inc|ready|listd|pend):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetUserId = parsePositiveInt(ctx.match?.[1]);
    const segmentKey = ctx.match?.[2] || 'all';
    const page = parsePage(ctx.match?.[3]);

    const state = await loadAdminUserCard({ targetUserId }).catch(() => ({ persistenceEnabled: true, card: null }));
    if (!state?.card) {
      await renderAdminUsers(ctx, { segmentKey, page, notice: '⚠️ Could not open the user card right now.' }, 'edit');
      return;
    }

    await clearAllPendingInputs(ctx.from.id);
    const started = await beginAdminUserNoteEdit({
      operatorTelegramUserId: ctx.from.id,
      targetUserId,
      segmentKey,
      page
    }).catch((error) => ({
      persistenceEnabled: true,
      started: false,
      reason: String(error?.message || error)
    }));

    if (!started.persistenceEnabled) {
      await renderAdminUserCard(ctx, { targetUserId, segmentKey, page, notice: '⚠️ Persistence is disabled in this environment.' }, 'edit');
      return;
    }

    if (!started.started) {
      await renderAdminUserCard(ctx, { targetUserId, segmentKey, page, notice: `⚠️ ${formatUserFacingError(started.reason, 'Could not open note editing right now.')}` }, 'edit');
      return;
    }

    const surface = await buildAdminUserNotePromptSurface({ card: state.card, segmentKey, page });
    await ctx.reply(surface.text, { reply_markup: surface.reply_markup });
  });

  composer.callbackQuery(/^adm:card:cancelnote:(\d+):(all|conn|inc|ready|listd|pend):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await cancelAdminUserNoteEdit({ operatorTelegramUserId: ctx.from.id }).catch(() => null);
    await renderAdminUserCard(ctx, {
      targetUserId: parsePositiveInt(ctx.match?.[1]),
      segmentKey: ctx.match?.[2] || 'all',
      page: parsePage(ctx.match?.[3])
    }, 'edit');
  });

  composer.callbackQuery(/^adm:card:msg:(\d+):(all|conn|inc|ready|listd|pend):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetUserId = parsePositiveInt(ctx.match?.[1]);
    const segmentKey = ctx.match?.[2] || 'all';
    const page = parsePage(ctx.match?.[3]);
    const [cardState, directState] = await Promise.all([
      loadAdminUserCard({ targetUserId }).catch(() => ({ persistenceEnabled: true, card: null })),
      loadAdminDirectMessageState({ operatorTelegramUserId: ctx.from.id, targetUserId, segmentKey, page }).catch(() => ({ persistenceEnabled: true, draft: { targetUserId, body: '', templateKey: 'blank', segmentKey, page } }))
    ]);
    const surface = await buildAdminUserMessageSurface({ card: cardState.card, state: directState, segmentKey, page });
    await renderSurface(ctx, surface, 'edit');
  });

  composer.callbackQuery(/^adm:msg:tpl:(\d+):(all|conn|inc|ready|listd|pend):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetUserId = parsePositiveInt(ctx.match?.[1]);
    const segmentKey = ctx.match?.[2] || 'all';
    const page = parsePage(ctx.match?.[3]);
    const [cardState, directState] = await Promise.all([
      loadAdminUserCard({ targetUserId }).catch(() => ({ persistenceEnabled: true, card: null })),
      loadAdminDirectMessageState({ operatorTelegramUserId: ctx.from.id, targetUserId, segmentKey, page }).catch(() => ({ persistenceEnabled: true, draft: { targetUserId, body: '', templateKey: 'blank', segmentKey, page } }))
    ]);
    const surface = await buildAdminDirectTemplatePickerSurface({ card: cardState.card, state: directState, segmentKey, page });
    await renderSurface(ctx, surface, 'edit');
  });

  composer.callbackQuery(/^adm:msg:tplset:(\d+):(all|conn|inc|ready|listd|pend):(\d+):([a-z]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetUserId = parsePositiveInt(ctx.match?.[1]);
    const segmentKey = ctx.match?.[2] || 'all';
    const page = parsePage(ctx.match?.[3]);
    const templateKey = ctx.match?.[4] || 'blank';
    const [cardState, result] = await Promise.all([
      loadAdminUserCard({ targetUserId }).catch(() => ({ persistenceEnabled: true, card: null })),
      selectAdminDirectMessageTemplate({ operatorTelegramUserId: ctx.from.id, operatorTelegramUsername: ctx.from.username || null, targetUserId, templateKey, segmentKey, page }).catch((error) => ({ persistenceEnabled: true, draft: null, reason: String(error?.message || error) }))
    ]);
    const surface = await buildAdminUserMessageSurface({
      card: cardState.card,
      state: { draft: result.draft || { targetUserId, body: '', templateKey, segmentKey, page } },
      segmentKey,
      page,
      notice: result.draft ? '✅ Template applied.' : `⚠️ ${formatUserFacingError(result.reason, 'Could not apply this template right now.')}`
    });
    await renderSurface(ctx, surface, 'edit');
  });

  composer.callbackQuery(/^adm:msg:edit:(\d+):(all|conn|inc|ready|listd|pend):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetUserId = parsePositiveInt(ctx.match?.[1]);
    const segmentKey = ctx.match?.[2] || 'all';
    const page = parsePage(ctx.match?.[3]);
    const directState = await loadAdminDirectMessageState({ operatorTelegramUserId: ctx.from.id, targetUserId, segmentKey, page }).catch(() => ({ persistenceEnabled: true, draft: { targetUserId, body: '', templateKey: 'blank', segmentKey, page } }));
    await clearAllPendingInputs(ctx.from.id);
    const started = await beginAdminDirectMessageEdit({ operatorTelegramUserId: ctx.from.id, targetUserId, segmentKey, page }).catch((error) => ({ persistenceEnabled: true, started: false, reason: String(error?.message || error) }));
    if (!started.persistenceEnabled || !started.started) {
      const cardState = await loadAdminUserCard({ targetUserId }).catch(() => ({ persistenceEnabled: true, card: null }));
      const surface = await buildAdminUserMessageSurface({ card: cardState.card, state: directState, segmentKey, page, notice: `⚠️ ${formatUserFacingError(started.reason, 'Could not open direct message editing right now.')}` });
      await renderSurface(ctx, surface, 'edit');
      return;
    }
    const surface = await buildAdminCommsEditPromptSurface({ title: '✏️ Direct message text', currentValue: directState?.draft?.body || '', cancelCallback: `adm:card:msg:${targetUserId}:${segmentKey}:${page}` });
    await ctx.reply(surface.text, { reply_markup: surface.reply_markup });
  });

  composer.callbackQuery(/^adm:msg:preview:(\d+):(all|conn|inc|ready|listd|pend):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetUserId = parsePositiveInt(ctx.match?.[1]);
    const segmentKey = ctx.match?.[2] || 'all';
    const page = parsePage(ctx.match?.[3]);
    const [cardState, directState] = await Promise.all([
      loadAdminUserCard({ targetUserId }).catch(() => ({ persistenceEnabled: true, card: null })),
      loadAdminDirectMessageState({ operatorTelegramUserId: ctx.from.id, targetUserId, segmentKey, page }).catch(() => ({ persistenceEnabled: true, draft: { targetUserId, body: '', templateKey: 'blank', segmentKey, page } }))
    ]);
    const surface = await buildAdminDirectPreviewSurface({ card: cardState.card, state: directState, segmentKey, page });
    await renderSurface(ctx, surface, 'edit');
  });

  composer.callbackQuery(/^adm:msg:confirm:(\d+):(all|conn|inc|ready|listd|pend):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetUserId = parsePositiveInt(ctx.match?.[1]);
    const segmentKey = ctx.match?.[2] || 'all';
    const page = parsePage(ctx.match?.[3]);
    const [cardState, result] = await Promise.all([
      loadAdminUserCard({ targetUserId }).catch(() => ({ persistenceEnabled: true, card: null })),
      sendAdminDirectMessage({ operatorTelegramUserId: ctx.from.id, operatorTelegramUsername: ctx.from.username || null, targetUserId }).catch((error) => ({ persistenceEnabled: true, sent: false, reason: String(error?.message || error) }))
    ]);
    const directState = await loadAdminDirectMessageState({ operatorTelegramUserId: ctx.from.id, targetUserId, segmentKey, page }).catch(() => ({ persistenceEnabled: true, draft: { targetUserId, body: '', templateKey: 'blank', segmentKey, page } }));
    const notice = result.sent ? '✅ Direct message sent.' : `⚠️ ${formatUserFacingError(result.reason, 'Could not send this direct message right now.')}`;
    const surface = await buildAdminUserMessageSurface({ card: cardState.card, state: directState, segmentKey, page, notice });
    await renderSurface(ctx, surface, 'edit');
  });

  composer.callbackQuery(/^adm:msg:clear:(\d+):(all|conn|inc|ready|listd|pend):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetUserId = parsePositiveInt(ctx.match?.[1]);
    const segmentKey = ctx.match?.[2] || 'all';
    const page = parsePage(ctx.match?.[3]);
    const [cardState, result] = await Promise.all([
      loadAdminUserCard({ targetUserId }).catch(() => ({ persistenceEnabled: true, card: null })),
      clearAdminDirectMessageDraftState({ operatorTelegramUserId: ctx.from.id }).catch((error) => ({ persistenceEnabled: true, cleared: false, reason: String(error?.message || error) }))
    ]);
    const directState = await loadAdminDirectMessageState({ operatorTelegramUserId: ctx.from.id, targetUserId, segmentKey, page }).catch(() => ({ persistenceEnabled: true, draft: { targetUserId, body: '', templateKey: 'blank', segmentKey, page } }));
    const notice = result.cleared ? '✅ Direct message draft cleared.' : `⚠️ ${formatUserFacingError(result.reason, 'Could not clear this direct message draft right now.')}`;
    const surface = await buildAdminUserMessageSurface({ card: cardState.card, state: directState, segmentKey, page, notice });
    await renderSurface(ctx, surface, 'edit');
  });

  composer.callbackQuery('adm:dir', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminSurface(ctx, 'directory', 'edit');
  });


  composer.callbackQuery('adm:qual', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminQuality(ctx, { segmentKey: 'listinc', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:qual:seg:(listinc|ready|miss|dupe|relink)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminQuality(ctx, { segmentKey: ctx.match?.[1] || 'listinc', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:qual:page:(listinc|ready|miss|dupe|relink):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminQuality(ctx, { segmentKey: ctx.match?.[1] || 'listinc', page: parsePage(ctx.match?.[2]) }, 'edit');
  });


  composer.callbackQuery('adm:intro:list', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminIntros(ctx, { segmentKey: 'all', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:intro:seg:(all|pend|acc|dec|stale|fail)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminIntros(ctx, { segmentKey: ctx.match?.[1] || 'all', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:intro:page:(all|pend|acc|dec|stale|fail):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminIntros(ctx, { segmentKey: ctx.match?.[1] || 'all', page: parsePage(ctx.match?.[2]) }, 'edit');
  });

  composer.callbackQuery(/^adm:intro:open:(\d+):(all|pend|acc|dec|stale|fail):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminIntroDetail(ctx, {
      introRequestId: parsePositiveInt(ctx.match?.[1]),
      segmentKey: ctx.match?.[2] || 'all',
      page: parsePage(ctx.match?.[3])
    }, 'edit');
  });

  composer.callbackQuery(/^adm:intro:dlv:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminDelivery(ctx, { introRequestId: parsePositiveInt(ctx.match?.[1]), segmentKey: 'all', page: 0 }, 'edit');
  });

  composer.callbackQuery('adm:dlv', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminDelivery(ctx, { segmentKey: 'all', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:dlv:seg:(all|fail|due|exh|ok)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminDelivery(ctx, { segmentKey: ctx.match?.[1] || 'all', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:dlv:page:(all|fail|due|exh|ok):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminDelivery(ctx, { segmentKey: ctx.match?.[1] || 'all', page: parsePage(ctx.match?.[2]) }, 'edit');
  });

  composer.callbackQuery(/^adm:dlv:open:(\d+):(all|fail|due|exh|ok):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const segmentKey = ctx.match?.[2] || 'all';
    const page = parsePage(ctx.match?.[3]);
    await renderAdminDeliveryRecord(ctx, {
      notificationReceiptId: parsePositiveInt(ctx.match?.[1]),
      backCallback: `adm:dlv:page:${segmentKey}:${page}`
    }, 'edit');
  });

  composer.callbackQuery(/^adm:dlv:intro:(\d+):seg:(all|fail|due|exh|ok)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminDelivery(ctx, { introRequestId: parsePositiveInt(ctx.match?.[1]), segmentKey: ctx.match?.[2] || 'all', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:dlv:intro:(\d+):page:(all|fail|due|exh|ok):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminDelivery(ctx, { introRequestId: parsePositiveInt(ctx.match?.[1]), segmentKey: ctx.match?.[2] || 'all', page: parsePage(ctx.match?.[3]) }, 'edit');
  });

  composer.callbackQuery(/^adm:dlv:intro:(\d+):open:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const introRequestId = parsePositiveInt(ctx.match?.[1]);
    await renderAdminDeliveryRecord(ctx, {
      notificationReceiptId: parsePositiveInt(ctx.match?.[2]),
      backCallback: `adm:intro:dlv:${introRequestId}`
    }, 'edit');
  });

  composer.callbackQuery('adm:tpl', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminSurface(ctx, 'templates', 'edit');
  });


  composer.callbackQuery('adm:not', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminNotice(ctx, {}, 'edit');
  });

  composer.callbackQuery('adm:not:edit', async (ctx) => {
    await ctx.answerCallbackQuery();
    const state = await loadAdminNoticeState().catch(() => ({ persistenceEnabled: true, notice: { body: '', audienceKey: 'ALL', isActive: false } }));
    await clearAllPendingInputs(ctx.from.id);
    const started = await beginAdminNoticeEdit({ operatorTelegramUserId: ctx.from.id }).catch((error) => ({ persistenceEnabled: true, started: false, reason: String(error?.message || error) }));
    if (!started.persistenceEnabled || !started.started) {
      await renderAdminNotice(ctx, { notice: `⚠️ ${formatUserFacingError(started.reason, 'Could not open notice editing right now.')}` }, 'edit');
      return;
    }
    const surface = await buildAdminCommsEditPromptSurface({ title: '✏️ Notice text', currentValue: state.notice?.body || '', cancelCallback: 'adm:not' });
    await ctx.reply(surface.text, { reply_markup: surface.reply_markup });
  });

  composer.callbackQuery('adm:not:aud', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminNoticeAudience(ctx, {}, 'edit');
  });

  composer.callbackQuery(/^adm:not:aud:([A-Z_]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const result = await updateAdminNoticeAudienceSelection({
      operatorTelegramUserId: ctx.from.id,
      operatorTelegramUsername: ctx.from.username || null,
      audienceKey: ctx.match?.[1] || 'ALL'
    }).catch((error) => ({ persistenceEnabled: true, notice: null, reason: String(error?.message || error) }));
    await renderAdminNotice(ctx, { notice: result.persistenceEnabled ? '✅ Audience updated.' : '⚠️ Persistence is disabled in this environment.' }, 'edit');
  });

  composer.callbackQuery('adm:not:preview', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminNoticePreview(ctx, 'edit');
  });

  composer.callbackQuery('adm:not:on', async (ctx) => {
    await ctx.answerCallbackQuery();
    const result = await activateAdminNoticeState({ operatorTelegramUserId: ctx.from.id, operatorTelegramUsername: ctx.from.username || null }).catch((error) => ({ persistenceEnabled: true, activated: false, reason: String(error?.message || error) }));
    const notice = result.activated ? '✅ Notice activated.' : `⚠️ ${formatUserFacingError(result.reason, 'Could not activate the notice right now.')}`;
    await renderAdminNotice(ctx, { notice }, 'edit');
  });

  composer.callbackQuery('adm:not:off', async (ctx) => {
    await ctx.answerCallbackQuery();
    const result = await disableAdminNoticeState({ operatorTelegramUserId: ctx.from.id, operatorTelegramUsername: ctx.from.username || null }).catch((error) => ({ persistenceEnabled: true, disabled: false, reason: String(error?.message || error) }));
    const notice = result.disabled ? '✅ Notice disabled.' : `⚠️ ${formatUserFacingError(result.reason, 'Could not disable the notice right now.')}`;
    await renderAdminNotice(ctx, { notice }, 'edit');
  });

  composer.callbackQuery('adm:bc', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminBroadcast(ctx, {}, 'edit');
  });

  composer.callbackQuery('adm:bc:edit', async (ctx) => {
    await ctx.answerCallbackQuery();
    const state = await loadAdminBroadcastState().catch(() => ({ persistenceEnabled: true, draft: { body: '', audienceKey: 'ALL_CONNECTED' } }));
    await clearAllPendingInputs(ctx.from.id);
    const started = await beginAdminBroadcastEdit({ operatorTelegramUserId: ctx.from.id }).catch((error) => ({ persistenceEnabled: true, started: false, reason: String(error?.message || error) }));
    if (!started.persistenceEnabled || !started.started) {
      await renderAdminBroadcast(ctx, { notice: `⚠️ ${formatUserFacingError(started.reason, 'Could not open broadcast editing right now.')}` }, 'edit');
      return;
    }
    const surface = await buildAdminCommsEditPromptSurface({ title: '✏️ Broadcast text', currentValue: state.draft?.body || '', cancelCallback: 'adm:bc' });
    await ctx.reply(surface.text, { reply_markup: surface.reply_markup });
  });

  composer.callbackQuery('adm:bc:aud', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminBroadcastAudience(ctx, {}, 'edit');
  });

  composer.callbackQuery(/^adm:bc:aud:([A-Z_]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const result = await updateAdminBroadcastAudienceSelection({
      operatorTelegramUserId: ctx.from.id,
      operatorTelegramUsername: ctx.from.username || null,
      audienceKey: ctx.match?.[1] || 'ALL_CONNECTED'
    }).catch((error) => ({ persistenceEnabled: true, reason: String(error?.message || error) }));
    const notice = result.persistenceEnabled ? '✅ Audience updated.' : '⚠️ Persistence is disabled in this environment.';
    await renderAdminBroadcast(ctx, { notice }, 'edit');
  });

  composer.callbackQuery('adm:bc:preview', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminBroadcastPreview(ctx, {}, 'edit');
  });

  composer.callbackQuery('adm:bc:send', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminBroadcastPreview(ctx, { notice: 'Review the preview, then confirm the send.' }, 'edit');
  });

  composer.callbackQuery('adm:bc:confirm', async (ctx) => {
    await ctx.answerCallbackQuery();
    const result = await sendAdminBroadcast({ operatorTelegramUserId: ctx.from.id, operatorTelegramUsername: ctx.from.username || null }).catch((error) => ({ persistenceEnabled: true, sent: false, reason: String(error?.message || error) }));
    const notice = result.sent
      ? (result.failedCount > 0 ? `✅ Broadcast sent with some failures. Delivered ${result.deliveredCount}, failed ${result.failedCount}.` : `✅ Broadcast sent to ${result.deliveredCount} recipients.`)
      : `⚠️ ${formatUserFacingError(result.reason, 'Could not send this broadcast right now.')}`;
    await renderAdminBroadcast(ctx, { notice }, 'edit');
  });

  composer.callbackQuery('adm:bc:clear', async (ctx) => {
    await ctx.answerCallbackQuery();
    const result = await clearAdminBroadcastDraftState().catch((error) => ({ persistenceEnabled: true, cleared: false, reason: String(error?.message || error) }));
    const notice = result.cleared ? '✅ Broadcast draft cleared.' : `⚠️ ${formatUserFacingError(result.reason, 'Could not clear this draft right now.')}`;
    await renderAdminBroadcast(ctx, { notice }, 'edit');
  });

  composer.callbackQuery('adm:outbox', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminOutbox(ctx, {}, 'edit');
  });

  composer.callbackQuery(/^adm:outbox:open:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminOutboxRecord(ctx, { outboxId: parsePositiveInt(ctx.match?.[1]) }, 'edit');
  });
  composer.callbackQuery('adm:retry', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderOperatorDiagnostics(ctx, {}, 'edit');
  });

  composer.callbackQuery('ops:diag', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderOperatorDiagnostics(ctx, {}, 'edit');
  });

  composer.callbackQuery(/^ops:b:(all|due|fal|exh)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const code = ctx.match?.[1];
    const bucket = code === 'due' ? 'retry_due' : code === 'fal' ? 'failed' : code === 'exh' ? 'exhausted' : null;
    await renderOperatorDiagnostics(ctx, bucket ? { bucket } : {}, 'edit');
  });

  return composer;
}
