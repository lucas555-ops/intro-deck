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
  loadAdminMonetizationState,
  loadAdminBroadcastFailures,
  loadAdminBroadcastState,
  loadAdminUserSegmentBulkActions,
  loadAdminDeliveryPage,
  loadAdminDeliveryRecord,
  loadAdminDashboardSummary,
  loadAdminDirectMessageState,
  beginAdminScopedSearchPrompt,
  loadAdminSearchResults,
  loadAdminIntroDetail,
  loadAdminIntrosPage,
  loadAdminNoticeState,
  loadAdminQualityPage,
  loadAdminTemplatesLibrary,
  loadAdminUserCard,
  loadAdminUsersPage,
  selectAdminDirectMessageTemplate,
  sendAdminBroadcast,
  sendAdminDirectMessage,
  prepareAdminUserSegmentBulkBroadcast,
  prepareAdminUserSegmentBulkNotice,
  updateAdminBroadcastAudienceSelection,
  updateAdminNoticeAudienceSelection,
  applyAdminNoticeTemplateSelection,
  applyAdminBroadcastTemplateSelection,
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
  buildAdminMonetizationSurface,
  buildAdminSystemSurface,
  buildAdminHealthSurface,
  buildAdminOperatorsSurface,
  buildAdminRunbookSurface,
  buildAdminFreezeSurface,
  buildAdminLiveVerificationSurface,
  buildAdminLaunchRehearsalSurface,
  buildAdminUsersSurface,
  buildAdminBulkActionsSurface,
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
  buildAdminNoticeTemplatePickerSurface,
  buildAdminBroadcastSurface,
  buildAdminBroadcastAudienceSurface,
  buildAdminBroadcastPreviewSurface,
  buildAdminBroadcastTemplatePickerSurface,
  buildAdminTemplatesSurface,
  buildAdminBroadcastFailuresSurface,
  buildAdminOutboxSurface,
  buildAdminOutboxRecordSurface,
  buildAdminSearchPromptSurface,
  buildAdminSearchResultsSurface,
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



  async function renderAdminMonetization(ctx, { notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminMonetizationState().catch((error) => ({
      persistenceEnabled: true,
      summary: null,
      recentReceipts: [],
      pricing: null,
      reason: String(error?.message || error)
    }));

    const surface = await buildAdminMonetizationSurface({ state, notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminBulkActions(ctx, { segmentKey = 'all', page = 0, notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminUserSegmentBulkActions({
      segmentKey
    }).catch((error) => ({
      persistenceEnabled: true,
      segmentKey: normalizeAdminUserSegment(segmentKey),
      segmentLabel: null,
      noticeAction: { supported: false, estimate: 0 },
      broadcastAction: { supported: false, estimate: 0 },
      activeNotice: false,
      reason: String(error?.message || error)
    }));

    const surface = await buildAdminBulkActionsSurface({ state, page: parsePage(page), notice });
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


  async function renderAdminIntros(ctx, { segmentKey = 'all', page = 0, targetUserId = null, notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminIntrosPage({ segmentKey, page, targetUserId }).catch((error) => ({
      persistenceEnabled: true,
      intros: [],
      counts: null,
      segmentKey: normalizeAdminIntroSegment(segmentKey),
      page: 0,
      totalCount: 0,
      hasPrev: false,
      hasNext: false,
      targetUserId,
      reason: String(error?.message || error)
    }));

    const surface = await buildAdminIntrosSurface({ state, notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminIntroDetail(ctx, { introRequestId, segmentKey = 'all', page = 0, targetUserId = null, backCallback = null, notice = null } = {}, method = 'edit') {
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

    const resolvedBackCallback = backCallback || (targetUserId
      ? `adm:intro:user:${targetUserId}:page:${normalizeAdminIntroSegment(segmentKey)}:${parsePage(page)}`
      : `adm:intro:page:${normalizeAdminIntroSegment(segmentKey)}:${parsePage(page)}`);

    const surface = await buildAdminIntroDetailSurface({
      intro: state.intro,
      notificationSummary: state.notificationSummary,
      recentReceipts: state.recentReceipts,
      backCallback: resolvedBackCallback,
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



  async function renderAdminSearchPrompt(ctx, { scopeKey = 'users', notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    await clearAllPendingInputs(ctx.from.id);
    const started = await beginAdminScopedSearchPrompt({
      operatorTelegramUserId: ctx.from.id,
      scopeKey
    }).catch((error) => ({ persistenceEnabled: true, started: false, reason: String(error?.message || error), scopeKey }));

    const surface = await buildAdminSearchPromptSurface({
      scopeKey: started.scopeKey || scopeKey,
      currentQuery: '',
      notice: started.started ? notice : `⚠️ ${formatUserFacingError(started.reason, 'Could not open admin search right now.')}`
    });
    if (method === 'reply') {
      await ctx.reply(surface.text, { reply_markup: surface.reply_markup });
      return;
    }
    await safeEditOrReply(ctx, surface.text, { reply_markup: surface.reply_markup });
  }

  async function renderAdminSearchResults(ctx, { scopeKey = 'users', page = 0, notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminSearchResults({
      operatorTelegramUserId: ctx.from.id,
      scopeKey,
      page
    }).catch((error) => ({
      persistenceEnabled: true,
      scopeKey,
      queryText: '',
      page: 0,
      pageSize: 8,
      totalCount: 0,
      hasPrev: false,
      hasNext: false,
      results: [],
      reason: String(error?.message || error)
    }));

    const surface = await buildAdminSearchResultsSurface({ scopeKey, state, notice });
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

  async function renderAdminAudit(ctx, { segmentKey = 'all', page = 0, targetUserId = null, notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminAuditPage({ segmentKey, page, targetUserId }).catch((error) => ({
      persistenceEnabled: true,
      records: [],
      counts: null,
      segmentKey: normalizeAdminAuditSegment(segmentKey),
      page: 0,
      totalCount: 0,
      hasPrev: false,
      hasNext: false,
      targetUserId,
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
      latestBroadcastStatus: 'none',
      recentDirectMessages: 0,
      recentOutboxFailures: 0,
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
      latestRecord: null,
      audienceOptions: [],
      reason: String(error?.message || error)
    }));
    const surface = await buildAdminBroadcastPreviewSurface({ state, notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminBroadcastFailures(ctx, { outboxId, page = 0, notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }

    const state = await loadAdminBroadcastFailures({ outboxId, page }).catch((error) => ({
      persistenceEnabled: true,
      record: null,
      outboxId,
      page: 0,
      pageSize: 10,
      totalCount: 0,
      hasPrev: false,
      hasNext: false,
      items: [],
      reason: String(error?.message || error)
    }));
    const surface = await buildAdminBroadcastFailuresSurface({ state, notice });
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

    const dashboard = ['home', 'ops', 'sys'].includes(target)
      ? await loadAdminDashboardSummary().catch((error) => ({
        persistenceEnabled: true,
        summary: {
          home: { totalUsers: 0, connectedUsers: 0, profileStartedUsers: 0, readyProfiles: 0, readyNotListed: 0, listedUsers: 0, listedActiveUsers: 0, pendingIntros: 0, noIntroYet: 0, firstIntroUsers: 0, acceptedIntroUsers: 0, failedDeliveries: 0, activeNotice: false, latestBroadcastStatus: 'none', latestBroadcastId: 0, newUsers24h: 0, newUsers7d: 0, connected24h: 0, connected7d: 0, listed24h: 0, listed7d: 0, intros24h: 0, intros7d: 0, accepted7d: 0, declined7d: 0, pendingOlder24h: 0, failures24h: 0, failures7d: 0, exhaustedNow: 0, broadcasts7d: 0, directMessages7d: 0 },
          operations: { totalUsers: 0, connectedUsers: 0, profileStartedUsers: 0, readyProfiles: 0, readyNotListed: 0, listedIncomplete: 0, pendingIntros: 0, staleIntros: 0, deliveryIssues: 0, connectedNoProfile: 0, readyNoSkills: 0, listedActive: 0, listedInactive: 0, noIntroYet: 0, firstIntroUsers: 0, acceptedIntroUsers: 0, recentRelinks7d: 0, newIntros24h: 0, accepted7d: 0, declined7d: 0, pendingOlder24h: 0 },
          communications: { activeNotice: false, draftBroadcastReady: false, latestBroadcastStatus: 'none', latestBroadcastId: 0, recentDirectMessages: 0, recentOutboxFailures: 0, directMessages24h: 0, directMessages7d: 0, broadcasts7d: 0, broadcastDeliveredRecipients7d: 0, broadcastFailedRecipients7d: 0, outboxFailures24h: 0, outboxFailures7d: 0, noticeVisibilityEstimate: 0, latestBroadcastAudienceKey: null, latestBroadcastRecipients: 0, latestBroadcastDelivered: 0, latestBroadcastFailed: 0 },
          system: { retryDue: 0, exhausted: 0, recentAuditEvents: 0, failedDeliveries: 0, failures24h: 0, failures7d: 0, delivered24h: 0, delivered7d: 0, operatorActions24h: 0, operatorActions7d: 0, listingChanges7d: 0, relinks7d: 0 }
        },
        reason: String(error?.message || error)
      }))
      : null;

    let surface;
    switch (target) {
      case 'home':
        surface = await buildAdminHomeSurface({ summary: dashboard?.summary?.home || null });
        break;
      case 'ops':
        surface = await buildAdminOperationsSurface({ summary: dashboard?.summary?.operations || null });
        break;
      case 'comms':
        await renderAdminCommunications(ctx, {}, method);
        return;
      case 'sys':
        surface = await buildAdminSystemSurface({ summary: dashboard?.summary?.system || null });
        break;
      case 'money':
        await renderAdminMonetization(ctx, {}, method);
        return;
      case 'health':
        surface = await buildAdminHealthSurface();
        break;
      case 'opscope':
        surface = await buildAdminOperatorsSurface({ summary: dashboard?.summary?.system || null });
        break;
      case 'runbook':
        surface = await buildAdminRunbookSurface();
        break;
      case 'freeze':
        surface = await buildAdminFreezeSurface();
        break;
      case 'verify':
        surface = await buildAdminLiveVerificationSurface();
        break;
      case 'rehearse':
        surface = await buildAdminLaunchRehearsalSurface();
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
      case 'templates': {
        const state = await loadAdminTemplatesLibrary().catch(() => ({ persistenceEnabled: true, noticeTemplates: [], broadcastTemplates: [], directTemplates: [] }));
        surface = await buildAdminTemplatesSurface({ state });
        break;
      }
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

  const renderOperatorEntry = async (ctx) => {
    const introRequestId = parseOpsIntroRequestId(ctx.message?.text || '');
    if (introRequestId) {
      await renderOperatorDiagnostics(ctx, { introRequestId }, 'reply');
      return;
    }

    await renderAdminSurface(ctx, 'home', 'reply');
  };

  composer.command('ops', async (ctx) => {
    await renderOperatorEntry(ctx);
  });

  composer.command('admin', async (ctx) => {
    await renderOperatorEntry(ctx);
  });


  composer.callbackQuery(/^adm:home:funnel:(connected|noprofile|ready_not_listed|listed|nointro|firstintro|accepted|dlv_fail)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    switch (ctx.match?.[1]) {
      case 'connected':
        await renderAdminUsers(ctx, { segmentKey: 'conn', page: 0 }, 'edit');
        return;
      case 'noprofile':
        await renderAdminUsers(ctx, { segmentKey: 'noprof', page: 0 }, 'edit');
        return;
      case 'ready_not_listed':
        await renderAdminUsers(ctx, { segmentKey: 'ready', page: 0 }, 'edit');
        return;
      case 'listed':
        await renderAdminUsers(ctx, { segmentKey: 'listd', page: 0 }, 'edit');
        return;
      case 'nointro':
        await renderAdminUsers(ctx, { segmentKey: 'nointro', page: 0 }, 'edit');
        return;
      case 'firstintro':
        await renderAdminIntros(ctx, { segmentKey: 'all', page: 0, notice: 'Показываю список интро для проверки первого касания.' }, 'edit');
        return;
      case 'accepted':
        await renderAdminIntros(ctx, { segmentKey: 'arec', page: 0 }, 'edit');
        return;
      case 'dlv_fail':
        await renderAdminDelivery(ctx, { segmentKey: 'fail', page: 0 }, 'edit');
        return;
      default:
        await renderAdminSurface(ctx, 'home', 'edit');
    }
  });

  composer.callbackQuery(/^adm:ops:funnel:(conn_noprofile|ready_no_skills|listed_active|listed_inactive|no_intro|intro_p24|intro_p72|delivery_issue|retry_due|exhausted)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    switch (ctx.match?.[1]) {
      case 'conn_noprofile':
        await renderAdminUsers(ctx, { segmentKey: 'noprof', page: 0 }, 'edit');
        return;
      case 'ready_no_skills':
        await renderAdminUsers(ctx, { segmentKey: 'noskills', page: 0 }, 'edit');
        return;
      case 'listed_active':
        await renderAdminUsers(ctx, { segmentKey: 'listact', page: 0 }, 'edit');
        return;
      case 'listed_inactive':
        await renderAdminUsers(ctx, { segmentKey: 'listinact', page: 0 }, 'edit');
        return;
      case 'no_intro':
        await renderAdminUsers(ctx, { segmentKey: 'nointro', page: 0 }, 'edit');
        return;
      case 'intro_p24':
        await renderAdminIntros(ctx, { segmentKey: 'p24', page: 0 }, 'edit');
        return;
      case 'intro_p72':
        await renderAdminIntros(ctx, { segmentKey: 'p72', page: 0 }, 'edit');
        return;
      case 'delivery_issue':
        await renderAdminDelivery(ctx, { segmentKey: 'fail', page: 0 }, 'edit');
        return;
      case 'retry_due':
        await renderAdminDelivery(ctx, { segmentKey: 'due', page: 0 }, 'edit');
        return;
      case 'exhausted':
        await renderAdminDelivery(ctx, { segmentKey: 'exh', page: 0 }, 'edit');
        return;
      default:
        await renderAdminSurface(ctx, 'ops', 'edit');
    }
  });

  composer.callbackQuery(/^adm:comms:funnel:(notice_visibility|last_bc|outbox_fail|direct_recent)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    switch (ctx.match?.[1]) {
      case 'notice_visibility':
        await renderAdminNotice(ctx, {}, 'edit');
        return;
      case 'last_bc':
        await renderAdminOutbox(ctx, { notice: 'Открываю outbox для последнего broadcast.' }, 'edit');
        return;
      case 'outbox_fail':
        await renderAdminOutbox(ctx, { notice: 'Открываю outbox с recent failures.' }, 'edit');
        return;
      case 'direct_recent':
        await renderAdminOutbox(ctx, { notice: 'Открываю outbox для recent direct messages.' }, 'edit');
        return;
      default:
        await renderAdminSurface(ctx, 'comms', 'edit');
    }
  });

  composer.callbackQuery(/^adm:sys:funnel:(retry_due|exhausted|audit_recent|listing_changes|relinks)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    switch (ctx.match?.[1]) {
      case 'retry_due':
        await renderAdminDelivery(ctx, { segmentKey: 'due', page: 0 }, 'edit');
        return;
      case 'exhausted':
        await renderAdminDelivery(ctx, { segmentKey: 'exh', page: 0 }, 'edit');
        return;
      case 'audit_recent':
        await renderAdminAudit(ctx, { segmentKey: 'all', page: 0 }, 'edit');
        return;
      case 'listing_changes':
        await renderAdminAudit(ctx, { segmentKey: 'user', page: 0, notice: 'Показываю аудит пользовательских действий; listing changes помечены внутри событий.' }, 'edit');
        return;
      case 'relinks':
        await renderAdminAudit(ctx, { segmentKey: 'relink', page: 0 }, 'edit');
        return;
      default:
        await renderAdminSurface(ctx, 'sys', 'edit');
    }
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

  composer.callbackQuery('adm:money', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminSurface(ctx, 'money', 'edit');
  });

  composer.callbackQuery('adm:health', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminSurface(ctx, 'health', 'edit');
  });

  composer.callbackQuery('adm:opscope', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminSurface(ctx, 'opscope', 'edit');
  });

  composer.callbackQuery('adm:runbook', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminSurface(ctx, 'runbook', 'edit');
  });

  composer.callbackQuery('adm:freeze', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminSurface(ctx, 'freeze', 'edit');
  });

  composer.callbackQuery('adm:verify', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminSurface(ctx, 'verify', 'edit');
  });

  composer.callbackQuery('adm:rehearse', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminSurface(ctx, 'rehearse', 'edit');
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

  composer.callbackQuery(/^adm:audit:user:(\d+):open:(\d+):(all|not|bc|user|relink):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetUserId = parsePositiveInt(ctx.match?.[1]);
    const segmentKey = ctx.match?.[3] || 'all';
    const page = parsePage(ctx.match?.[4]);
    await renderAdminAuditRecord(ctx, { auditId: parsePositiveInt(ctx.match?.[2]), backCallback: `adm:audit:user:${targetUserId}:page:${segmentKey}:${page}` }, 'edit');
  });

  composer.callbackQuery('adm:usr:list', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminUsers(ctx, { segmentKey: 'all', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:usr:seg:(all|conn|noprof|inc|noskills|ready|listd|listact|listinact|nointro|pend|relink)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminUsers(ctx, { segmentKey: ctx.match?.[1] || 'all', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:usr:page:(all|conn|noprof|inc|noskills|ready|listd|listact|listinact|nointro|pend|relink):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminUsers(ctx, {
      segmentKey: ctx.match?.[1] || 'all',
      page: parsePage(ctx.match?.[2])
    }, 'edit');
  });


  composer.callbackQuery(/^adm:bulk:user:(all|conn|noprof|inc|noskills|ready|listd|listact|listinact|nointro|pend|relink):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminBulkActions(ctx, {
      segmentKey: ctx.match?.[1] || 'all',
      page: parsePage(ctx.match?.[2])
    }, 'edit');
  });

  composer.callbackQuery(/^adm:bulk:user:(all|conn|noprof|inc|noskills|ready|listd|listact|listinact|nointro|pend|relink):(\d+):(not|bc)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const segmentKey = ctx.match?.[1] || 'all';
    const page = parsePage(ctx.match?.[2]);
    const action = ctx.match?.[3] || 'bc';

    if (action === 'not') {
      const result = await prepareAdminUserSegmentBulkNotice({
        operatorTelegramUserId: ctx.from.id,
        operatorTelegramUsername: ctx.from.username || null,
        segmentKey
      }).catch((error) => ({ persistenceEnabled: true, prepared: false, blocked: true, reason: String(error?.message || error) }));

      if (!result.prepared) {
        const warning = result.reason === 'admin_bulk_notice_blocked_active_notice'
          ? '⚠️ Активный notice сначала нужно выключить вручную.'
          : `⚠️ ${formatUserFacingError(result.reason, 'Could not prepare safe bulk notice right now.')}`;
        await renderAdminBulkActions(ctx, { segmentKey, page, notice: warning }, 'edit');
        return;
      }

      const state = await loadAdminNoticeState().catch(() => ({ persistenceEnabled: true, notice: result.notice, estimate: result.estimate }));
      const surface = await buildAdminNoticePreviewSurface({
        state,
        notice: `✅ Notice prepared for segment ${segmentKey}. Проверь превью и включи вручную.`
      });
      await renderSurface(ctx, surface, 'edit');
      return;
    }

    const result = await prepareAdminUserSegmentBulkBroadcast({
      operatorTelegramUserId: ctx.from.id,
      operatorTelegramUsername: ctx.from.username || null,
      segmentKey
    }).catch((error) => ({ persistenceEnabled: true, prepared: false, blocked: true, reason: String(error?.message || error) }));

    if (!result.prepared) {
      await renderAdminBulkActions(ctx, {
        segmentKey,
        page,
        notice: `⚠️ ${formatUserFacingError(result.reason, 'Could not prepare safe bulk broadcast right now.')}`
      }, 'edit');
      return;
    }

    const state = await loadAdminBroadcastState().catch(() => ({ persistenceEnabled: true, draft: result.draft, estimate: result.estimate, latestRecord: null }));
    const surface = await buildAdminBroadcastPreviewSurface({
      state,
      notice: `✅ Broadcast prepared for segment ${segmentKey}. Проверь превью и подтверди отправку.`
    });
    await renderSurface(ctx, surface, 'edit');
  });

  composer.callbackQuery(/^adm:usr:open:(\d+):(all|conn|noprof|inc|noskills|ready|listd|listact|listinact|nointro|pend|relink):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminUserCard(ctx, {
      targetUserId: parsePositiveInt(ctx.match?.[1]),
      segmentKey: ctx.match?.[2] || 'all',
      page: parsePage(ctx.match?.[3])
    }, 'edit');
  });

  composer.callbackQuery(/^adm:card:view:(\d+):(all|conn|noprof|inc|noskills|ready|listd|listact|listinact|nointro|pend|relink):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const targetUserId = parsePositiveInt(ctx.match?.[1]);
    const segmentKey = ctx.match?.[2] || 'all';
    const page = parsePage(ctx.match?.[3]);
    const state = await loadAdminUserCard({ targetUserId }).catch(() => ({ persistenceEnabled: true, card: null }));
    const surface = await buildAdminUserPublicCardSurface({ card: state.card, segmentKey, page });
    await renderSurface(ctx, surface, 'edit');
  });

  composer.callbackQuery(/^adm:card:(hide|unhide):(\d+):(all|conn|noprof|inc|noskills|ready|listd|listact|listinact|nointro|pend|relink):(\d+)$/, async (ctx) => {
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

  composer.callbackQuery(/^adm:card:note:(\d+):(all|conn|noprof|inc|noskills|ready|listd|listact|listinact|nointro|pend|relink):(\d+)$/, async (ctx) => {
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

  composer.callbackQuery(/^adm:card:cancelnote:(\d+):(all|conn|noprof|inc|noskills|ready|listd|listact|listinact|nointro|pend|relink):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await cancelAdminUserNoteEdit({ operatorTelegramUserId: ctx.from.id }).catch(() => null);
    await renderAdminUserCard(ctx, {
      targetUserId: parsePositiveInt(ctx.match?.[1]),
      segmentKey: ctx.match?.[2] || 'all',
      page: parsePage(ctx.match?.[3])
    }, 'edit');
  });

  composer.callbackQuery(/^adm:card:intros:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminIntros(ctx, { targetUserId: parsePositiveInt(ctx.match?.[1]), segmentKey: 'all', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:card:audit:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminAudit(ctx, { targetUserId: parsePositiveInt(ctx.match?.[1]), segmentKey: 'all', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:intro:user:(\d+):seg:(all|pend|p24|p72|acc|arec|dec|drec|stale|fail|dprob)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminIntros(ctx, { targetUserId: parsePositiveInt(ctx.match?.[1]), segmentKey: ctx.match?.[2] || 'all', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:intro:user:(\d+):page:(all|pend|p24|p72|acc|arec|dec|drec|stale|fail|dprob):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminIntros(ctx, { targetUserId: parsePositiveInt(ctx.match?.[1]), segmentKey: ctx.match?.[2] || 'all', page: parsePage(ctx.match?.[3]) }, 'edit');
  });

  composer.callbackQuery(/^adm:audit:user:(\d+):seg:(all|not|bc|user|relink)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminAudit(ctx, { targetUserId: parsePositiveInt(ctx.match?.[1]), segmentKey: ctx.match?.[2] || 'all', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:audit:user:(\d+):page:(all|not|bc|user|relink):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminAudit(ctx, { targetUserId: parsePositiveInt(ctx.match?.[1]), segmentKey: ctx.match?.[2] || 'all', page: parsePage(ctx.match?.[3]) }, 'edit');
  });

  composer.callbackQuery(/^adm:card:msg:(\d+):(all|conn|noprof|inc|noskills|ready|listd|listact|listinact|nointro|pend|relink):(\d+)$/, async (ctx) => {
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

  composer.callbackQuery(/^adm:msg:tpl:(\d+):(all|conn|noprof|inc|noskills|ready|listd|listact|listinact|nointro|pend|relink):(\d+)$/, async (ctx) => {
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

  composer.callbackQuery(/^adm:msg:tplset:(\d+):(all|conn|noprof|inc|noskills|ready|listd|listact|listinact|nointro|pend|relink):(\d+):([a-z]+)$/, async (ctx) => {
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

  composer.callbackQuery(/^adm:msg:edit:(\d+):(all|conn|noprof|inc|noskills|ready|listd|listact|listinact|nointro|pend|relink):(\d+)$/, async (ctx) => {
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

  composer.callbackQuery(/^adm:msg:preview:(\d+):(all|conn|noprof|inc|noskills|ready|listd|listact|listinact|nointro|pend|relink):(\d+)$/, async (ctx) => {
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

  composer.callbackQuery(/^adm:msg:confirm:(\d+):(all|conn|noprof|inc|noskills|ready|listd|listact|listinact|nointro|pend|relink):(\d+)$/, async (ctx) => {
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

  composer.callbackQuery(/^adm:msg:clear:(\d+):(all|conn|noprof|inc|noskills|ready|listd|listact|listinact|nointro|pend|relink):(\d+)$/, async (ctx) => {
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

  composer.callbackQuery(/^adm:intro:seg:(all|pend|p24|p72|acc|arec|dec|drec|stale|fail|dprob)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminIntros(ctx, { segmentKey: ctx.match?.[1] || 'all', page: 0 }, 'edit');
  });

  composer.callbackQuery(/^adm:intro:page:(all|pend|p24|p72|acc|arec|dec|drec|stale|fail|dprob):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminIntros(ctx, { segmentKey: ctx.match?.[1] || 'all', page: parsePage(ctx.match?.[2]) }, 'edit');
  });

  composer.callbackQuery(/^adm:intro:open:(\d+):(all|pend|p24|p72|acc|arec|dec|drec|stale|fail|dprob):(\d+)$/, async (ctx) => {
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

  async function renderAdminTemplates(ctx, { notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }
    const state = await loadAdminTemplatesLibrary().catch(() => ({ persistenceEnabled: true, noticeTemplates: [], broadcastTemplates: [], directTemplates: [] }));
    const surface = await buildAdminTemplatesSurface({ state, notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminNoticeTemplatePicker(ctx, { notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }
    const [state, templates] = await Promise.all([
      loadAdminNoticeState().catch(() => ({ persistenceEnabled: true, notice: { body: '', audienceKey: 'ALL', isActive: false }, estimate: 0, templateOptions: [] })),
      loadAdminTemplatesLibrary().catch(() => ({ persistenceEnabled: true, noticeTemplates: [] }))
    ]);
    const surface = await buildAdminNoticeTemplatePickerSurface({ state, templates: templates.noticeTemplates || [], notice });
    await renderSurface(ctx, surface, method);
  }

  async function renderAdminBroadcastTemplatePicker(ctx, { notice = null } = {}, method = 'edit') {
    if (!isOperatorTelegramUser(ctx.from.id)) {
      await renderOperatorOnly(ctx, method);
      return;
    }
    const [state, templates] = await Promise.all([
      loadAdminBroadcastState().catch(() => ({ persistenceEnabled: true, draft: { body: '', audienceKey: 'ALL_CONNECTED' }, estimate: 0, latestRecord: null, templateOptions: [] })),
      loadAdminTemplatesLibrary().catch(() => ({ persistenceEnabled: true, broadcastTemplates: [] }))
    ]);
    const surface = await buildAdminBroadcastTemplatePickerSurface({ state, templates: templates.broadcastTemplates || [], notice });
    await renderSurface(ctx, surface, method);
  }

  composer.callbackQuery('adm:tpl', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminTemplates(ctx, {}, 'edit');
  });

  composer.callbackQuery('adm:tpl:not', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminNoticeTemplatePicker(ctx, {}, 'edit');
  });

  composer.callbackQuery('adm:tpl:bc', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminBroadcastTemplatePicker(ctx, {}, 'edit');
  });

  composer.callbackQuery('adm:tpl:direct', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminTemplates(ctx, { notice: 'Direct message templates are available inside User Card → Message.' }, 'edit');
  });



  composer.callbackQuery(/^adm:search:(users|intros|delivery|outbox|audit)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminSearchPrompt(ctx, { scopeKey: ctx.match?.[1] || 'users' }, 'edit');
  });

  composer.callbackQuery(/^adm:search:(users|intros|delivery|outbox|audit):page:(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminSearchResults(ctx, {
      scopeKey: ctx.match?.[1] || 'users',
      page: parsePage(ctx.match?.[2])
    }, 'edit');
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

  composer.callbackQuery('adm:not:tpl', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminNoticeTemplatePicker(ctx, {}, 'edit');
  });

  composer.callbackQuery(/^adm:not:tpl:([a-z_]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const result = await applyAdminNoticeTemplateSelection({
      operatorTelegramUserId: ctx.from.id,
      operatorTelegramUsername: ctx.from.username || null,
      templateKey: ctx.match?.[1] || 'complete_profile'
    }).catch((error) => ({ persistenceEnabled: true, notice: null, estimate: 0, reason: String(error?.message || error) }));
    const notice = result.notice
      ? `✅ Template applied. Audience: ${result.notice.audienceKey}. Estimated visibility: ${result.estimate || 0}.`
      : `⚠️ ${formatUserFacingError(result.reason, 'Could not apply this notice template right now.')}`;
    await renderAdminNotice(ctx, { notice }, 'edit');
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

  composer.callbackQuery('adm:bc:tpl', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminBroadcastTemplatePicker(ctx, {}, 'edit');
  });

  composer.callbackQuery(/^adm:bc:tpl:([a-z_]+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const result = await applyAdminBroadcastTemplateSelection({
      operatorTelegramUserId: ctx.from.id,
      operatorTelegramUsername: ctx.from.username || null,
      templateKey: ctx.match?.[1] || 'complete_profile'
    }).catch((error) => ({ persistenceEnabled: true, draft: null, estimate: 0, reason: String(error?.message || error) }));
    const notice = result.draft
      ? `✅ Template applied. Audience: ${result.draft.audienceKey}. Estimated recipients: ${result.estimate || 0}.`
      : `⚠️ ${formatUserFacingError(result.reason, 'Could not apply this broadcast template right now.')}`;
    await renderAdminBroadcast(ctx, { notice }, 'edit');
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

  composer.callbackQuery('adm:bc:refresh', async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminBroadcast(ctx, { notice: '🔄 Broadcast status refreshed.' }, 'edit');
  });

  composer.callbackQuery(/^adm:bc:fail:(\d+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    await renderAdminBroadcastFailures(ctx, {
      outboxId: parsePositiveInt(ctx.match?.[1]),
      page: parsePage(ctx.match?.[2])
    }, 'edit');
  });

  composer.callbackQuery('adm:bc:confirm', async (ctx) => {
    await ctx.answerCallbackQuery();
    const result = await sendAdminBroadcast({ operatorTelegramUserId: ctx.from.id, operatorTelegramUsername: ctx.from.username || null }).catch((error) => ({ persistenceEnabled: true, sent: false, reason: String(error?.message || error) }));
    const notice = result.sent
      ? (result.failedCount > 0
          ? `✅ Broadcast completed with failures. Delivered ${result.deliveredCount}, failed ${result.failedCount}. Open Failures for the recipient trail.`
          : `✅ Broadcast sent to ${result.deliveredCount} recipients in batches.`)
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
