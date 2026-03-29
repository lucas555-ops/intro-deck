import {
  ADMIN_AUDIT_SEGMENTS,
  ADMIN_BROADCAST_AUDIENCES,
  ADMIN_BROADCAST_TEMPLATES,
  ADMIN_DELIVERY_SEGMENTS,
  ADMIN_DIRECT_MESSAGE_TEMPLATES,
  ADMIN_INTRO_SEGMENTS,
  ADMIN_NOTICE_AUDIENCES,
  ADMIN_NOTICE_TEMPLATES,
  ADMIN_QUALITY_SEGMENTS,
  ADMIN_USER_SEGMENTS,
  activateAdminNotice,
  applyAdminBroadcastTemplate,
  applyAdminNoticeTemplate,
  beginAdminCommsInputSession,
  beginAdminUserNoteSession,
  cancelAdminCommsInputSession,
  cancelAdminUserNoteSession,
  clearAdminBroadcastDraft,
  clearAdminDirectMessageDraft,
  completeAdminBroadcastDeliveryItem,
  createAdminAuditEvent,
  createAdminBroadcastDeliveryItems,
  createAdminCommOutboxRecord,
  disableAdminNotice,
  estimateAdminBroadcastAudienceCount,
  estimateAdminNoticeAudienceCount,
  getAdminAuditRecordById,
  getAdminBroadcastDraft,
  getAdminCommOutboxRecordById,
  getAdminDeliveryRecordById,
  getAdminDirectMessageDraft,
  getAdminDashboardSummary,
  getAdminIntroDetailById,
  getAdminNoticeState,
  getAdminUserCardById,
  listAdminAuditPage,
  listAdminBroadcastFailurePage,
  listAdminBroadcastDeliveryBatch,
  listAdminBroadcastRecipients,
  listAdminCommOutbox,
  listAdminDeliveryPage,
  listAdminIntrosPage,
  listAdminQualityPage,
  listAdminUsersPage,
  normalizeAdminAuditSegment,
  normalizeAdminBroadcastAudience,
  normalizeAdminDeliverySegment,
  normalizeAdminIntroSegment,
  normalizeAdminNoticeAudience,
  normalizeAdminQualitySegment,
  normalizeAdminUserSegment,
  saveAdminCommsTextFromSession,
  summarizeAdminBroadcastDelivery,
  saveAdminUserNoteFromSession,
  setAdminUserListingVisibility,
  updateAdminBroadcastDraftAudience,
  updateAdminCommOutboxRecord,
  markAdminBroadcastDeliveryItemSending,
  updateAdminNoticeAudience,
  upsertAdminDirectMessageDraft,
  normalizeAdminSearchScope,
  upsertAdminSearchState,
  getAdminSearchState,
  searchAdminUsersPage,
  searchAdminIntrosPage,
  searchAdminDeliveryPage,
  searchAdminOutboxPage,
  searchAdminAuditPage
} from '../../db/adminRepo.js';
import { getPricingConfig, getTelegramConfig } from '../../config/env.js';
import { isDatabaseConfigured, withDbClient, withDbTransaction } from '../../db/pool.js';
import { sendTelegramMessage } from '../telegram/botApi.js';
import { upsertTelegramUser } from '../../db/usersRepo.js';
import { getIntroNotificationReceiptSummary, listRecentNotificationReceipts } from '../../db/notificationRepo.js';
import { getAdminMonetizationSummary, listRecentPurchaseReceipts } from '../../db/monetizationRepo.js';


export async function loadAdminDashboardSummary() {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      summary: {
        home: { totalUsers: 0, connectedUsers: 0, profileStartedUsers: 0, readyProfiles: 0, listedUsers: 0, listedActiveUsers: 0, pendingIntros: 0, noIntroYet: 0, firstIntroUsers: 0, acceptedIntroUsers: 0, failedDeliveries: 0, activeNotice: false, latestBroadcastStatus: 'none', latestBroadcastId: 0, newUsers24h: 0, newUsers7d: 0, connected24h: 0, connected7d: 0, listed24h: 0, listed7d: 0, intros24h: 0, intros7d: 0, accepted7d: 0, declined7d: 0, pendingOlder24h: 0, failures24h: 0, failures7d: 0, exhaustedNow: 0, broadcasts7d: 0, directMessages7d: 0 },
        operations: { totalUsers: 0, connectedUsers: 0, profileStartedUsers: 0, readyProfiles: 0, readyNotListed: 0, listedIncomplete: 0, pendingIntros: 0, staleIntros: 0, deliveryIssues: 0, connectedNoProfile: 0, readyNoSkills: 0, listedActive: 0, listedInactive: 0, noIntroYet: 0, firstIntroUsers: 0, acceptedIntroUsers: 0, recentRelinks7d: 0, newIntros24h: 0, accepted7d: 0, declined7d: 0, pendingOlder24h: 0 },
        communications: { activeNotice: false, draftBroadcastReady: false, latestBroadcastStatus: 'none', latestBroadcastId: 0, recentDirectMessages: 0, recentOutboxFailures: 0, directMessages24h: 0, directMessages7d: 0, broadcasts7d: 0, broadcastDeliveredRecipients7d: 0, broadcastFailedRecipients7d: 0, outboxFailures24h: 0, outboxFailures7d: 0, noticeVisibilityEstimate: 0, latestBroadcastAudienceKey: null, latestBroadcastRecipients: 0, latestBroadcastDelivered: 0, latestBroadcastFailed: 0 },
        system: { retryDue: 0, exhausted: 0, recentAuditEvents: 0, failedDeliveries: 0, failures24h: 0, failures7d: 0, delivered24h: 0, delivered7d: 0, operatorActions24h: 0, operatorActions7d: 0, listingChanges7d: 0, relinks7d: 0 }
      },
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => ({
    persistenceEnabled: true,
    summary: await getAdminDashboardSummary(client),
    reason: 'admin_dashboard_summary_loaded'
  }));
}


const ADMIN_USER_SEGMENT_BULK_PRESETS = {
  noprof: {
    notice: { templateKey: 'connect_profile', audienceKey: 'CONNECTED_NO_PROFILE' },
    broadcast: { templateKey: 'connect_profile', audienceKey: 'CONNECTED_NO_PROFILE' }
  },
  inc: {
    notice: { templateKey: 'complete_profile', audienceKey: 'PROFILE_INCOMPLETE' },
    broadcast: { templateKey: 'complete_profile', audienceKey: 'PROFILE_INCOMPLETE' }
  },
  noskills: {
    notice: { templateKey: 'add_skills', audienceKey: 'COMPLETE_NO_SKILLS' },
    broadcast: { templateKey: 'add_skills', audienceKey: 'COMPLETE_NO_SKILLS' }
  },
  ready: {
    notice: { templateKey: 'list_profile', audienceKey: 'READY_NOT_LISTED' },
    broadcast: { templateKey: 'list_profile', audienceKey: 'READY_NOT_LISTED' }
  },
  listinact: {
    notice: { templateKey: 'reengage_listed', audienceKey: 'LISTED_INACTIVE' },
    broadcast: { templateKey: 'revive_listed', audienceKey: 'LISTED_INACTIVE' }
  },
  nointro: {
    notice: null,
    broadcast: { templateKey: 'first_intro', audienceKey: 'LISTED_NO_INTROS_YET' }
  },
  relink: {
    notice: null,
    broadcast: { templateKey: 'recent_relinks', audienceKey: 'RECENT_RELINKS' }
  }
};

function getAdminUserSegmentBulkPreset(segmentKey) {
  return ADMIN_USER_SEGMENT_BULK_PRESETS[normalizeAdminUserSegment(segmentKey)] || { notice: null, broadcast: null };
}

function hydrateBulkAction(action = null, type = 'broadcast') {
  if (!action) {
    return {
      supported: false,
      templateKey: null,
      templateLabel: null,
      audienceKey: null,
      audienceLabel: null,
      estimate: 0
    };
  }

  const templateMap = type === 'notice' ? ADMIN_NOTICE_TEMPLATES : ADMIN_BROADCAST_TEMPLATES;
  const audienceMap = type === 'notice' ? ADMIN_NOTICE_AUDIENCES : ADMIN_BROADCAST_AUDIENCES;
  const template = templateMap[action.templateKey] || null;
  const audience = audienceMap[action.audienceKey] || null;
  return {
    supported: Boolean(template && audience),
    templateKey: action.templateKey,
    templateLabel: template?.label || null,
    audienceKey: action.audienceKey,
    audienceLabel: audience?.label || null,
    estimate: 0
  };
}

export async function loadAdminUserSegmentBulkActions({ segmentKey = 'all' } = {}) {
  const normalizedSegmentKey = normalizeAdminUserSegment(segmentKey);
  const preset = getAdminUserSegmentBulkPreset(normalizedSegmentKey);

  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      segmentKey: normalizedSegmentKey,
      segmentLabel: ADMIN_USER_SEGMENTS[normalizedSegmentKey]?.label || 'Сегмент',
      noticeAction: hydrateBulkAction(preset.notice, 'notice'),
      broadcastAction: hydrateBulkAction(preset.broadcast, 'broadcast'),
      activeNotice: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const noticeState = await getAdminNoticeState(client);
    const noticeAction = hydrateBulkAction(preset.notice, 'notice');
    const broadcastAction = hydrateBulkAction(preset.broadcast, 'broadcast');

    if (noticeAction.supported && noticeAction.audienceKey) {
      noticeAction.estimate = await estimateAdminNoticeAudienceCount(client, { audienceKey: noticeAction.audienceKey });
    }
    if (broadcastAction.supported && broadcastAction.audienceKey) {
      broadcastAction.estimate = await estimateAdminBroadcastAudienceCount(client, { audienceKey: broadcastAction.audienceKey });
    }

    return {
      persistenceEnabled: true,
      segmentKey: normalizedSegmentKey,
      segmentLabel: ADMIN_USER_SEGMENTS[normalizedSegmentKey]?.label || 'Сегмент',
      noticeAction,
      broadcastAction,
      activeNotice: Boolean(noticeState?.isActive),
      activeNoticeAudienceKey: noticeState?.audienceKey || null,
      activeNoticeBody: noticeState?.body || '',
      reason: 'admin_user_segment_bulk_actions_loaded'
    };
  });
}

export async function prepareAdminUserSegmentBulkNotice({ operatorTelegramUserId, operatorTelegramUsername = null, segmentKey = 'all' } = {}) {
  const normalizedSegmentKey = normalizeAdminUserSegment(segmentKey);
  const preset = getAdminUserSegmentBulkPreset(normalizedSegmentKey);
  if (!preset.notice) {
    return { persistenceEnabled: isDatabaseConfigured(), prepared: false, blocked: true, reason: 'admin_bulk_notice_not_supported', segmentKey: normalizedSegmentKey };
  }
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, prepared: false, blocked: true, reason: 'DATABASE_URL is not configured', segmentKey: normalizedSegmentKey };
  }

  return withDbTransaction(async (client) => {
    const noticeState = await getAdminNoticeState(client);
    if (noticeState?.isActive) {
      return {
        persistenceEnabled: true,
        prepared: false,
        blocked: true,
        segmentKey: normalizedSegmentKey,
        reason: 'admin_bulk_notice_blocked_active_notice',
        notice: noticeState
      };
    }

    const operatorUser = await upsertTelegramUser(client, {
      telegramUserId: operatorTelegramUserId,
      telegramUsername: operatorTelegramUsername || null
    });

    let notice = await applyAdminNoticeTemplate(client, {
      operatorUserId: operatorUser.id,
      templateKey: preset.notice.templateKey
    });

    if (normalizeAdminNoticeAudience(notice?.audienceKey) !== preset.notice.audienceKey) {
      notice = await updateAdminNoticeAudience(client, {
        operatorUserId: operatorUser.id,
        audienceKey: preset.notice.audienceKey
      });
    }

    const estimate = await estimateAdminNoticeAudienceCount(client, { audienceKey: preset.notice.audienceKey });
    await createAdminAuditEvent(client, {
      eventType: 'admin_bulk_notice_prepared',
      actorUserId: operatorUser.id,
      summary: 'Bulk notice prepared from user segment.',
      detail: {
        segmentKey: normalizedSegmentKey,
        templateKey: preset.notice.templateKey,
        audienceKey: preset.notice.audienceKey,
        estimate
      }
    });

    return {
      persistenceEnabled: true,
      prepared: true,
      blocked: false,
      segmentKey: normalizedSegmentKey,
      notice,
      estimate,
      reason: 'admin_bulk_notice_prepared'
    };
  });
}

export async function prepareAdminUserSegmentBulkBroadcast({ operatorTelegramUserId, operatorTelegramUsername = null, segmentKey = 'all' } = {}) {
  const normalizedSegmentKey = normalizeAdminUserSegment(segmentKey);
  const preset = getAdminUserSegmentBulkPreset(normalizedSegmentKey);
  if (!preset.broadcast) {
    return { persistenceEnabled: isDatabaseConfigured(), prepared: false, blocked: true, reason: 'admin_bulk_broadcast_not_supported', segmentKey: normalizedSegmentKey };
  }
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, prepared: false, blocked: true, reason: 'DATABASE_URL is not configured', segmentKey: normalizedSegmentKey };
  }

  return withDbTransaction(async (client) => {
    const operatorUser = await upsertTelegramUser(client, {
      telegramUserId: operatorTelegramUserId,
      telegramUsername: operatorTelegramUsername || null
    });

    let draft = await applyAdminBroadcastTemplate(client, {
      operatorUserId: operatorUser.id,
      templateKey: preset.broadcast.templateKey
    });

    if (normalizeAdminBroadcastAudience(draft?.audienceKey) !== preset.broadcast.audienceKey) {
      draft = await updateAdminBroadcastDraftAudience(client, {
        operatorUserId: operatorUser.id,
        audienceKey: preset.broadcast.audienceKey
      });
    }

    const estimate = await estimateAdminBroadcastAudienceCount(client, { audienceKey: preset.broadcast.audienceKey });
    await createAdminAuditEvent(client, {
      eventType: 'admin_bulk_broadcast_prepared',
      actorUserId: operatorUser.id,
      summary: 'Bulk broadcast prepared from user segment.',
      detail: {
        segmentKey: normalizedSegmentKey,
        templateKey: preset.broadcast.templateKey,
        audienceKey: preset.broadcast.audienceKey,
        estimate
      }
    });

    return {
      persistenceEnabled: true,
      prepared: true,
      blocked: false,
      segmentKey: normalizedSegmentKey,
      draft,
      estimate,
      reason: 'admin_bulk_broadcast_prepared'
    };
  });
}

export async function loadAdminUsersPage({ segmentKey = 'all', page = 0 } = {}) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      users: [],
      counts: null,
      segmentKey: normalizeAdminUserSegment(segmentKey),
      page: 0,
      totalCount: 0,
      hasPrev: false,
      hasNext: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const pageState = await listAdminUsersPage(client, { segmentKey, page });
    return {
      persistenceEnabled: true,
      ...pageState,
      reason: 'admin_users_loaded'
    };
  });
}

export async function loadAdminUserCard({ targetUserId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      card: null,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const card = await getAdminUserCardById(client, { targetUserId });
    return {
      persistenceEnabled: true,
      card,
      reason: card ? 'admin_user_card_loaded' : 'admin_user_missing'
    };
  });
}

export async function updateAdminUserListingVisibility({
  operatorTelegramUserId,
  operatorTelegramUsername = null,
  targetUserId,
  nextVisibility
}) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      changed: false,
      blocked: true,
      card: null,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const operatorUser = await upsertTelegramUser(client, {
      telegramUserId: operatorTelegramUserId,
      telegramUsername: operatorTelegramUsername || null
    });
    const result = await setAdminUserListingVisibility(client, {
      targetUserId,
      nextVisibility,
      actorUserId: operatorUser.id
    });
    return {
      persistenceEnabled: true,
      changed: result.changed,
      blocked: result.blocked,
      reason: result.reason,
      card: await getAdminUserCardById(client, { targetUserId })
    };
  });
}

export async function beginAdminUserNoteEdit({ operatorTelegramUserId, targetUserId, segmentKey = 'all', page = 0 }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      started: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const session = await beginAdminUserNoteSession(client, {
      operatorTelegramUserId,
      targetUserId,
      segmentKey,
      page
    });
    return {
      persistenceEnabled: true,
      started: true,
      reason: 'admin_user_note_session_started',
      session
    };
  });
}

export async function cancelAdminUserNoteEdit({ operatorTelegramUserId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      cancelled: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    await cancelAdminUserNoteSession(client, operatorTelegramUserId);
    return {
      persistenceEnabled: true,
      cancelled: true,
      reason: 'admin_user_note_session_cancelled'
    };
  });
}

export async function applyAdminUserNoteInput({ operatorTelegramUserId, operatorTelegramUsername = null, text }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      consumed: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const result = await saveAdminUserNoteFromSession(client, {
      operatorTelegramUserId,
      operatorTelegramUsername,
      noteText: text
    });

    return {
      persistenceEnabled: true,
      ...result
    };
  });
}

export async function loadAdminCommunicationsState() {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      notice: { body: '', audienceKey: 'ALL', isActive: false },
      broadcastDraft: { body: '', audienceKey: 'ALL_CONNECTED' },
      outboxCount: 0,
      latestBroadcastStatus: 'none',
      latestBroadcastId: 0,
      recentDirectMessages: 0,
      recentOutboxFailures: 0,
      directMessages24h: 0,
      directMessages7d: 0,
      broadcasts7d: 0,
      broadcastDeliveredRecipients7d: 0,
      broadcastFailedRecipients7d: 0,
      outboxFailures24h: 0,
      outboxFailures7d: 0,
      noticeVisibilityEstimate: 0,
      latestBroadcastAudienceKey: null,
      latestBroadcastRecipients: 0,
      latestBroadcastDelivered: 0,
      latestBroadcastFailed: 0,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const [notice, broadcastDraft, outboxRows, summary] = await Promise.all([
      getAdminNoticeState(client),
      getAdminBroadcastDraft(client),
      listAdminCommOutbox(client, { limit: 1 }),
      getAdminDashboardSummary(client)
    ]);

    return {
      persistenceEnabled: true,
      notice,
      broadcastDraft,
      outboxCount: outboxRows.length,
      latestBroadcastStatus: summary.communications.latestBroadcastStatus,
      recentDirectMessages: summary.communications.recentDirectMessages,
      recentOutboxFailures: summary.communications.recentOutboxFailures,
      directMessages24h: summary.communications.directMessages24h,
      directMessages7d: summary.communications.directMessages7d,
      broadcasts7d: summary.communications.broadcasts7d,
      broadcastDeliveredRecipients7d: summary.communications.broadcastDeliveredRecipients7d,
      broadcastFailedRecipients7d: summary.communications.broadcastFailedRecipients7d,
      outboxFailures24h: summary.communications.outboxFailures24h,
      outboxFailures7d: summary.communications.outboxFailures7d,
      latestBroadcastId: summary.communications.latestBroadcastId,
      noticeVisibilityEstimate: summary.communications.noticeVisibilityEstimate,
      latestBroadcastAudienceKey: summary.communications.latestBroadcastAudienceKey,
      latestBroadcastRecipients: summary.communications.latestBroadcastRecipients,
      latestBroadcastDelivered: summary.communications.latestBroadcastDelivered,
      latestBroadcastFailed: summary.communications.latestBroadcastFailed,
      reason: 'admin_communications_loaded'
    };
  });
}


export async function loadAdminMonetizationState() {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      summary: {
        activePro: 0,
        expiredPro: 0,
        revenue7dStars: 0,
        revenue30dStars: 0,
        proPurchases7d: 0,
        contactRequests7d: 0,
        contactPaid7d: 0,
        contactRevealed7d: 0,
        contactDeclined7d: 0,
        dmCreated7d: 0,
        dmPaid7d: 0,
        dmDelivered7d: 0,
        dmAccepted7d: 0,
        dmBlocked7d: 0,
        dmReported7d: 0,
        dmActiveNow: 0
      },
      recentReceipts: [],
      pricing: getPricingConfig(),
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => ({
    persistenceEnabled: true,
    summary: await getAdminMonetizationSummary(client),
    recentReceipts: await listRecentPurchaseReceipts(client, { limit: 8 }),
    pricing: getPricingConfig(),
    reason: 'admin_monetization_loaded'
  }));
}

export async function loadAdminTemplatesLibrary() {
  return {
    persistenceEnabled: isDatabaseConfigured(),
    noticeTemplates: Object.values(ADMIN_NOTICE_TEMPLATES),
    broadcastTemplates: Object.values(ADMIN_BROADCAST_TEMPLATES),
    directTemplates: Object.values(ADMIN_DIRECT_MESSAGE_TEMPLATES),
    reason: 'admin_templates_loaded'
  };
}

export async function loadAdminNoticeState() {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      notice: { body: '', audienceKey: 'ALL', isActive: false },
      estimate: 0,
      audienceOptions: Object.values(ADMIN_NOTICE_AUDIENCES),
      templateOptions: Object.values(ADMIN_NOTICE_TEMPLATES),
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const notice = await getAdminNoticeState(client);
    const estimate = notice.body && notice.audienceKey
      ? await estimateAdminNoticeAudienceCount(client, { audienceKey: notice.audienceKey })
      : 0;
    return {
      persistenceEnabled: true,
      notice,
      estimate,
      audienceOptions: Object.values(ADMIN_NOTICE_AUDIENCES),
      templateOptions: Object.values(ADMIN_NOTICE_TEMPLATES),
      reason: 'admin_notice_loaded'
    };
  });
}

export async function updateAdminNoticeAudienceSelection({ operatorTelegramUserId, operatorTelegramUsername = null, audienceKey }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      notice: { body: '', audienceKey: normalizeAdminNoticeAudience(audienceKey), isActive: false },
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const operatorUser = await upsertTelegramUser(client, {
      telegramUserId: operatorTelegramUserId,
      telegramUsername: operatorTelegramUsername || null
    });
    const notice = await updateAdminNoticeAudience(client, {
      operatorUserId: operatorUser.id,
      audienceKey
    });
    return {
      persistenceEnabled: true,
      notice,
      reason: 'admin_notice_audience_updated'
    };
  });
}

export async function applyAdminNoticeTemplateSelection({ operatorTelegramUserId, operatorTelegramUsername = null, templateKey }) {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, notice: null, reason: 'DATABASE_URL is not configured' };
  }

  return withDbTransaction(async (client) => {
    const operatorUser = await upsertTelegramUser(client, {
      telegramUserId: operatorTelegramUserId,
      telegramUsername: operatorTelegramUsername || null
    });
    const notice = await applyAdminNoticeTemplate(client, { operatorUserId: operatorUser.id, templateKey });
    const estimate = notice.body && notice.audienceKey
      ? await estimateAdminNoticeAudienceCount(client, { audienceKey: notice.audienceKey })
      : 0;
    return {
      persistenceEnabled: true,
      notice,
      estimate,
      reason: 'admin_notice_template_applied'
    };
  });
}

export async function beginAdminNoticeEdit({ operatorTelegramUserId }) {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, started: false, reason: 'DATABASE_URL is not configured' };
  }

  return withDbTransaction(async (client) => ({
    persistenceEnabled: true,
    started: true,
    session: await beginAdminCommsInputSession(client, { operatorTelegramUserId, inputKind: 'notice_body' }),
    reason: 'admin_notice_edit_started'
  }));
}

export async function activateAdminNoticeState({ operatorTelegramUserId, operatorTelegramUsername = null }) {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, activated: false, reason: 'DATABASE_URL is not configured', notice: null };
  }

  return withDbTransaction(async (client) => {
    const operatorUser = await upsertTelegramUser(client, {
      telegramUserId: operatorTelegramUserId,
      telegramUsername: operatorTelegramUsername || null
    });
    const result = await activateAdminNotice(client, { operatorUserId: operatorUser.id });
    return {
      persistenceEnabled: true,
      activated: true,
      notice: result.state,
      outboxId: result.outboxId,
      reason: 'admin_notice_activated'
    };
  });
}

export async function disableAdminNoticeState({ operatorTelegramUserId, operatorTelegramUsername = null }) {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, disabled: false, reason: 'DATABASE_URL is not configured', notice: null };
  }

  return withDbTransaction(async (client) => {
    const operatorUser = await upsertTelegramUser(client, {
      telegramUserId: operatorTelegramUserId,
      telegramUsername: operatorTelegramUsername || null
    });
    const result = await disableAdminNotice(client, { operatorUserId: operatorUser.id });
    return {
      persistenceEnabled: true,
      disabled: true,
      notice: result.state,
      outboxId: result.outboxId,
      reason: 'admin_notice_disabled'
    };
  });
}

export async function loadAdminBroadcastState() {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      draft: { body: '', audienceKey: 'ALL_CONNECTED' },
      estimate: 0,
      latestRecord: null,
      audienceOptions: Object.values(ADMIN_BROADCAST_AUDIENCES),
      templateOptions: Object.values(ADMIN_BROADCAST_TEMPLATES),
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const draft = await getAdminBroadcastDraft(client);
    const estimate = draft.body && draft.audienceKey
      ? await estimateAdminBroadcastAudienceCount(client, { audienceKey: draft.audienceKey })
      : 0;
    const latestRecords = await listAdminCommOutbox(client, { limit: 1, eventType: 'broadcast' });
    return {
      persistenceEnabled: true,
      draft,
      estimate,
      latestRecord: latestRecords[0] || null,
      audienceOptions: Object.values(ADMIN_BROADCAST_AUDIENCES),
      templateOptions: Object.values(ADMIN_BROADCAST_TEMPLATES),
      reason: 'admin_broadcast_loaded'
    };
  });
}

export async function updateAdminBroadcastAudienceSelection({ operatorTelegramUserId, operatorTelegramUsername = null, audienceKey }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      draft: { body: '', audienceKey: normalizeAdminBroadcastAudience(audienceKey) },
      estimate: 0,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const operatorUser = await upsertTelegramUser(client, {
      telegramUserId: operatorTelegramUserId,
      telegramUsername: operatorTelegramUsername || null
    });
    const draft = await updateAdminBroadcastDraftAudience(client, {
      operatorUserId: operatorUser.id,
      audienceKey
    });
    const estimate = draft.body && draft.audienceKey
      ? await estimateAdminBroadcastAudienceCount(client, { audienceKey: draft.audienceKey })
      : 0;
    return {
      persistenceEnabled: true,
      draft,
      estimate,
      reason: 'admin_broadcast_audience_updated'
    };
  });
}

export async function applyAdminBroadcastTemplateSelection({ operatorTelegramUserId, operatorTelegramUsername = null, templateKey }) {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, draft: null, estimate: 0, reason: 'DATABASE_URL is not configured' };
  }

  return withDbTransaction(async (client) => {
    const operatorUser = await upsertTelegramUser(client, {
      telegramUserId: operatorTelegramUserId,
      telegramUsername: operatorTelegramUsername || null
    });
    const draft = await applyAdminBroadcastTemplate(client, { operatorUserId: operatorUser.id, templateKey });
    const estimate = draft.body && draft.audienceKey
      ? await estimateAdminBroadcastAudienceCount(client, { audienceKey: draft.audienceKey })
      : 0;
    return {
      persistenceEnabled: true,
      draft,
      estimate,
      reason: 'admin_broadcast_template_applied'
    };
  });
}

export async function beginAdminBroadcastEdit({ operatorTelegramUserId }) {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, started: false, reason: 'DATABASE_URL is not configured' };
  }

  return withDbTransaction(async (client) => ({
    persistenceEnabled: true,
    started: true,
    session: await beginAdminCommsInputSession(client, { operatorTelegramUserId, inputKind: 'broadcast_body' }),
    reason: 'admin_broadcast_edit_started'
  }));
}

export async function clearAdminBroadcastDraftState() {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, cleared: false, reason: 'DATABASE_URL is not configured' };
  }

  return withDbTransaction(async (client) => {
    await clearAdminBroadcastDraft(client);
    return { persistenceEnabled: true, cleared: true, reason: 'admin_broadcast_cleared' };
  });
}


export async function loadAdminBroadcastFailures({ outboxId, page = 0 } = {}) {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, outboxId, page: 0, items: [], totalCount: 0, hasPrev: false, hasNext: false, record: null, reason: 'DATABASE_URL is not configured' };
  }

  return withDbClient(async (client) => {
    const [record, pageState] = await Promise.all([
      getAdminCommOutboxRecordById(client, { outboxId }),
      listAdminBroadcastFailurePage(client, { outboxId, page })
    ]);
    return {
      persistenceEnabled: true,
      record,
      ...pageState,
      reason: 'admin_broadcast_failures_loaded'
    };
  });
}

export async function loadAdminCommOutbox({ limit = 12 } = {}) {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, records: [], reason: 'DATABASE_URL is not configured' };
  }

  return withDbClient(async (client) => ({
    persistenceEnabled: true,
    records: await listAdminCommOutbox(client, { limit }),
    reason: 'admin_outbox_loaded'
  }));
}

export async function loadAdminCommOutboxRecord({ outboxId }) {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, record: null, reason: 'DATABASE_URL is not configured' };
  }

  return withDbClient(async (client) => ({
    persistenceEnabled: true,
    record: await getAdminCommOutboxRecordById(client, { outboxId }),
    reason: 'admin_outbox_record_loaded'
  }));
}

export async function cancelAdminCommsEdit({ operatorTelegramUserId }) {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, cancelled: false, reason: 'DATABASE_URL is not configured' };
  }

  return withDbTransaction(async (client) => {
    await cancelAdminCommsInputSession(client, operatorTelegramUserId);
    return { persistenceEnabled: true, cancelled: true, reason: 'admin_comms_edit_cancelled' };
  });
}

export async function applyAdminCommsTextInput({ operatorTelegramUserId, operatorTelegramUsername = null, text }) {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, consumed: false, reason: 'DATABASE_URL is not configured' };
  }

  return withDbTransaction(async (client) => {
    const result = await saveAdminCommsTextFromSession(client, {
      operatorTelegramUserId,
      operatorTelegramUsername,
      text
    });
    return { persistenceEnabled: true, ...result };
  });
}



export async function beginAdminScopedSearchPrompt({ operatorTelegramUserId, scopeKey }) {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, started: false, reason: 'DATABASE_URL is not configured' };
  }
  const normalizedScopeKey = normalizeAdminSearchScope(scopeKey);
  return withDbTransaction(async (client) => ({
    persistenceEnabled: true,
    started: true,
    scopeKey: normalizedScopeKey,
    session: await beginAdminCommsInputSession(client, {
      operatorTelegramUserId,
      inputKind: `search_${normalizedScopeKey}`
    }),
    reason: 'admin_search_prompt_started'
  }));
}

export async function loadAdminSearchResults({ operatorTelegramUserId, scopeKey, page = null } = {}) {
  const normalizedScopeKey = normalizeAdminSearchScope(scopeKey);
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      scopeKey: normalizedScopeKey,
      queryText: '',
      page: 0,
      pageSize: 8,
      totalCount: 0,
      hasPrev: false,
      hasNext: false,
      results: [],
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const saved = await getAdminSearchState(client, { operatorTelegramUserId, scopeKey: normalizedScopeKey });
    const queryText = saved?.queryText || '';
    const resolvedPage = Number.isFinite(page) && page >= 0 ? page : (saved?.page || 0);
    if (!queryText) {
      return {
        persistenceEnabled: true,
        scopeKey: normalizedScopeKey,
        queryText: '',
        page: 0,
        pageSize: 8,
        totalCount: 0,
        hasPrev: false,
        hasNext: false,
        results: [],
        reason: 'admin_search_missing_query'
      };
    }

    let state;
    if (normalizedScopeKey === 'users') {
      state = await searchAdminUsersPage(client, { queryText, page: resolvedPage });
    } else if (normalizedScopeKey === 'intros') {
      state = await searchAdminIntrosPage(client, { queryText, page: resolvedPage });
    } else if (normalizedScopeKey === 'delivery') {
      state = await searchAdminDeliveryPage(client, { queryText, page: resolvedPage });
    } else if (normalizedScopeKey === 'outbox') {
      state = await searchAdminOutboxPage(client, { queryText, page: resolvedPage });
    } else {
      state = await searchAdminAuditPage(client, { queryText, page: resolvedPage });
    }

    await upsertAdminSearchState(client, { operatorTelegramUserId, scopeKey: normalizedScopeKey, queryText, page: state.page || 0 });
    return {
      persistenceEnabled: true,
      ...state,
      reason: 'admin_search_loaded'
    };
  });
}

export async function loadAdminDirectMessageState({ operatorTelegramUserId, targetUserId, segmentKey = 'all', page = 0 } = {}) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      draft: {
        operatorTelegramUserId,
        targetUserId,
        body: '',
        templateKey: 'blank',
        segmentKey: normalizeAdminUserSegment(segmentKey),
        page: page || 0
      },
      templates: Object.values(ADMIN_DIRECT_MESSAGE_TEMPLATES),
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => ({
    persistenceEnabled: true,
    draft: await getAdminDirectMessageDraft(client, { operatorTelegramUserId, targetUserId, segmentKey, page }),
    templates: Object.values(ADMIN_DIRECT_MESSAGE_TEMPLATES),
    reason: 'admin_direct_message_loaded'
  }));
}

export async function beginAdminDirectMessageEdit({ operatorTelegramUserId, targetUserId, segmentKey = 'all', page = 0 }) {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, started: false, reason: 'DATABASE_URL is not configured' };
  }

  return withDbTransaction(async (client) => ({
    persistenceEnabled: true,
    started: true,
    session: await beginAdminCommsInputSession(client, {
      operatorTelegramUserId,
      inputKind: 'direct_body',
      targetUserId,
      segmentKey,
      page
    }),
    reason: 'admin_direct_message_edit_started'
  }));
}

export async function selectAdminDirectMessageTemplate({ operatorTelegramUserId, operatorTelegramUsername = null, targetUserId, templateKey, segmentKey = 'all', page = 0 }) {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, draft: null, reason: 'DATABASE_URL is not configured' };
  }

  return withDbTransaction(async (client) => {
    const operatorUser = await upsertTelegramUser(client, {
      telegramUserId: operatorTelegramUserId,
      telegramUsername: operatorTelegramUsername || null
    });
    const template = ADMIN_DIRECT_MESSAGE_TEMPLATES[templateKey] || ADMIN_DIRECT_MESSAGE_TEMPLATES.blank;
    const draft = await upsertAdminDirectMessageDraft(client, {
      operatorTelegramUserId,
      operatorUserId: operatorUser.id,
      targetUserId,
      body: template.body,
      templateKey: template.key,
      segmentKey,
      page
    });
    return { persistenceEnabled: true, draft, reason: 'admin_direct_message_template_selected' };
  });
}

export async function clearAdminDirectMessageDraftState({ operatorTelegramUserId }) {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, cleared: false, reason: 'DATABASE_URL is not configured' };
  }

  return withDbTransaction(async (client) => {
    await clearAdminDirectMessageDraft(client, { operatorTelegramUserId });
    return { persistenceEnabled: true, cleared: true, reason: 'admin_direct_message_cleared' };
  });
}

export async function sendAdminDirectMessage({ operatorTelegramUserId, operatorTelegramUsername = null, targetUserId }) {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, sent: false, reason: 'DATABASE_URL is not configured' };
  }

  const prep = await withDbTransaction(async (client) => {
    const operatorUser = await upsertTelegramUser(client, {
      telegramUserId: operatorTelegramUserId,
      telegramUsername: operatorTelegramUsername || null
    });
    const draft = await getAdminDirectMessageDraft(client, { operatorTelegramUserId, targetUserId });
    if (!draft?.targetUserId || Number(draft.targetUserId) !== Number(targetUserId)) {
      throw new Error('Direct message draft is missing');
    }
    if (!draft.body) {
      throw new Error('Direct message text cannot be empty');
    }
    if (!draft.targetTelegramUserId) {
      throw new Error('Target Telegram account is not available');
    }

    const outboxId = await createAdminCommOutboxRecord(client, {
      eventType: 'direct',
      body: draft.body,
      targetUserId: draft.targetUserId,
      status: 'sending',
      estimatedRecipientCount: 1,
      deliveredCount: 0,
      failedCount: 0,
      createdByUserId: operatorUser.id
    });

    return { draft, operatorUserId: operatorUser.id, outboxId };
  });

  const { botToken } = getTelegramConfig();
  let deliveredCount = 0;
  let failedCount = 0;

  try {
    await sendTelegramMessage({
      botToken,
      chatId: prep.draft.targetTelegramUserId,
      text: prep.draft.body,
      replyMarkup: null
    });
    deliveredCount = 1;
  } catch (error) {
    console.warn('[admin direct] send failed', prep.draft.targetTelegramUserId, error?.message || error);
    failedCount = 1;
  }

  const finalStatus = failedCount > 0 ? 'failed' : 'sent';

  await withDbTransaction(async (client) => {
    await updateAdminCommOutboxRecord(client, {
      outboxId: prep.outboxId,
      status: finalStatus,
      estimatedRecipientCount: 1,
      deliveredCount,
      failedCount
    });
    await createAdminAuditEvent(client, {
      eventType: finalStatus === 'failed' ? 'admin_direct_message_failed' : 'admin_direct_message_sent',
      actorUserId: prep.operatorUserId,
      targetUserId: prep.draft.targetUserId,
      summary: finalStatus === 'failed' ? 'Direct operator message failed.' : 'Direct operator message sent.',
      detail: {
        outboxId: prep.outboxId,
        status: finalStatus,
        body: prep.draft.body,
        targetTelegramUserId: prep.draft.targetTelegramUserId
      }
    });
    await clearAdminDirectMessageDraft(client, { operatorTelegramUserId });
  });

  return {
    persistenceEnabled: true,
    sent: finalStatus === 'sent',
    status: finalStatus,
    deliveredCount,
    failedCount,
    outboxId: prep.outboxId,
    reason: 'admin_direct_message_sent'
  };
}

export async function sendAdminBroadcast({ operatorTelegramUserId, operatorTelegramUsername = null }) {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, sent: false, reason: 'DATABASE_URL is not configured' };
  }

  const batchSize = 25;
  const prep = await withDbTransaction(async (client) => {
    const operatorUser = await upsertTelegramUser(client, {
      telegramUserId: operatorTelegramUserId,
      telegramUsername: operatorTelegramUsername || null
    });
    const draft = await getAdminBroadcastDraft(client);
    if (!draft.body) {
      throw new Error('Broadcast text cannot be empty');
    }
    if (!draft.audienceKey) {
      throw new Error('Broadcast audience is required');
    }

    const recipients = await listAdminBroadcastRecipients(client, { audienceKey: draft.audienceKey });
    const outboxId = await createAdminCommOutboxRecord(client, {
      eventType: 'broadcast',
      body: draft.body,
      audienceKey: draft.audienceKey,
      status: 'queued',
      estimatedRecipientCount: recipients.length,
      deliveredCount: 0,
      failedCount: 0,
      createdByUserId: operatorUser.id,
      batchSize,
      cursor: 0
    });

    await createAdminBroadcastDeliveryItems(client, { outboxId, recipients });
    await clearAdminBroadcastDraft(client);
    await updateAdminCommOutboxRecord(client, {
      outboxId,
      status: recipients.length > 0 ? 'sending' : 'sent',
      estimatedRecipientCount: recipients.length,
      deliveredCount: 0,
      failedCount: 0,
      batchSize,
      cursor: 0,
      startedAt: new Date().toISOString(),
      finishedAt: recipients.length > 0 ? null : new Date().toISOString()
    });

    return { draft, recipients, outboxId, operatorUserId: operatorUser.id, batchSize };
  });

  const { botToken } = getTelegramConfig();
  let lastError = null;

  while (true) {
    const batch = await withDbClient(async (client) => listAdminBroadcastDeliveryBatch(client, { outboxId: prep.outboxId, limit: prep.batchSize }));
    if (!batch.length) {
      break;
    }

    for (const item of batch) {
      await withDbTransaction(async (client) => {
        await markAdminBroadcastDeliveryItemSending(client, { itemId: item.id });
      });

      try {
        await sendTelegramMessage({
          botToken,
          chatId: item.target_telegram_user_id,
          text: prep.draft.body,
          replyMarkup: null
        });
        await withDbTransaction(async (client) => {
          await completeAdminBroadcastDeliveryItem(client, { itemId: item.id, status: 'sent' });
        });
      } catch (error) {
        const message = String(error?.message || error);
        lastError = message;
        console.warn('[admin broadcast] send failed', item.target_telegram_user_id, message);
        await withDbTransaction(async (client) => {
          await completeAdminBroadcastDeliveryItem(client, { itemId: item.id, status: 'failed', errorMessage: message });
        });
      }
    }

    const summary = await withDbClient(async (client) => summarizeAdminBroadcastDelivery(client, { outboxId: prep.outboxId }));
    const processedCount = (summary?.sent_count || 0) + (summary?.failed_count || 0);
    await withDbTransaction(async (client) => {
      await updateAdminCommOutboxRecord(client, {
        outboxId: prep.outboxId,
        status: summary?.pending_count > 0 ? 'sending' : ((summary?.failed_count || 0) > 0 ? ((summary?.sent_count || 0) > 0 ? 'sent_with_failures' : 'failed') : 'sent'),
        estimatedRecipientCount: summary?.total_count || prep.recipients.length,
        deliveredCount: summary?.sent_count || 0,
        failedCount: summary?.failed_count || 0,
        batchSize: prep.batchSize,
        cursor: processedCount,
        lastError: lastError || summary?.last_error || null,
        finishedAt: summary?.pending_count > 0 ? null : new Date().toISOString()
      });
    });
  }

  const finalRecord = await withDbClient(async (client) => getAdminCommOutboxRecordById(client, { outboxId: prep.outboxId }));
  const finalStatus = finalRecord?.status || 'failed';

  await withDbTransaction(async (client) => {
    await createAdminAuditEvent(client, {
      eventType: finalStatus === 'failed' ? 'admin_broadcast_failed' : 'admin_broadcast_sent',
      actorUserId: prep.operatorUserId,
      summary: finalStatus === 'failed' ? 'Broadcast failed.' : 'Broadcast sent.',
      detail: {
        audienceKey: prep.draft.audienceKey,
        estimatedRecipientCount: finalRecord?.estimated_recipient_count || prep.recipients.length,
        deliveredCount: finalRecord?.delivered_count || 0,
        failedCount: finalRecord?.failed_count || 0,
        outboxId: prep.outboxId,
        status: finalStatus,
        body: prep.draft.body,
        batchSize: finalRecord?.batch_size || prep.batchSize
      }
    });
  });

  return {
    persistenceEnabled: true,
    sent: finalStatus === 'sent' || finalStatus === 'sent_with_failures',
    status: finalStatus,
    deliveredCount: finalRecord?.delivered_count || 0,
    failedCount: finalRecord?.failed_count || 0,
    estimatedRecipientCount: finalRecord?.estimated_recipient_count || prep.recipients.length,
    outboxId: prep.outboxId,
    reason: 'admin_broadcast_sent'
  };
}

export async function loadActiveAdminNotice() {
  if (!isDatabaseConfigured()) {
    return { persistenceEnabled: false, notice: null, reason: 'DATABASE_URL is not configured' };
  }

  return withDbClient(async (client) => {
    const notice = await getAdminNoticeState(client);
    return {
      persistenceEnabled: true,
      notice: notice.isActive ? notice : null,
      reason: notice.isActive ? 'admin_notice_active' : 'admin_notice_inactive'
    };
  });
}


export async function loadAdminIntrosPage({ segmentKey = 'all', page = 0, targetUserId = null } = {}) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      intros: [],
      counts: null,
      segmentKey: normalizeAdminIntroSegment(segmentKey),
      page: 0,
      totalCount: 0,
      hasPrev: false,
      hasNext: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const pageState = await listAdminIntrosPage(client, { segmentKey, page, targetUserId });
    return {
      persistenceEnabled: true,
      ...pageState,
      segmentOptions: Object.values(ADMIN_INTRO_SEGMENTS),
      reason: 'admin_intros_loaded'
    };
  });
}

export async function loadAdminIntroDetail({ introRequestId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      intro: null,
      notificationSummary: null,
      recentReceipts: [],
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const intro = await getAdminIntroDetailById(client, { introRequestId });
    const [notificationSummary, recentReceipts] = intro
      ? await Promise.all([
          getIntroNotificationReceiptSummary(client, { introRequestId }),
          listRecentNotificationReceipts(client, { introRequestId, limit: 6 })
        ])
      : [null, []];

    return {
      persistenceEnabled: true,
      intro,
      notificationSummary,
      recentReceipts,
      reason: intro ? 'admin_intro_detail_loaded' : 'admin_intro_missing'
    };
  });
}

export async function loadAdminDeliveryPage({ segmentKey = 'all', page = 0, introRequestId = null } = {}) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      records: [],
      counts: null,
      segmentKey: normalizeAdminDeliverySegment(segmentKey),
      page: 0,
      totalCount: 0,
      hasPrev: false,
      hasNext: false,
      introRequestId: introRequestId || null,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const pageState = await listAdminDeliveryPage(client, { segmentKey, page, introRequestId });
    return {
      persistenceEnabled: true,
      ...pageState,
      segmentOptions: Object.values(ADMIN_DELIVERY_SEGMENTS),
      reason: 'admin_delivery_loaded'
    };
  });
}

export async function loadAdminDeliveryRecord({ notificationReceiptId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      record: null,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => ({
    persistenceEnabled: true,
    record: await getAdminDeliveryRecordById(client, { notificationReceiptId }),
    reason: 'admin_delivery_record_loaded'
  }));
}


export async function loadAdminQualityPage({ segmentKey = 'listinc', page = 0 } = {}) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      users: [],
      counts: null,
      segmentKey: normalizeAdminQualitySegment(segmentKey),
      page: 0,
      totalCount: 0,
      hasPrev: false,
      hasNext: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const pageState = await listAdminQualityPage(client, { segmentKey, page });
    return {
      persistenceEnabled: true,
      ...pageState,
      segmentOptions: Object.values(ADMIN_QUALITY_SEGMENTS),
      reason: 'admin_quality_loaded'
    };
  });
}

export async function loadAdminAuditPage({ segmentKey = 'all', page = 0, targetUserId = null } = {}) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      records: [],
      counts: null,
      segmentKey: normalizeAdminAuditSegment(segmentKey),
      page: 0,
      totalCount: 0,
      hasPrev: false,
      hasNext: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const pageState = await listAdminAuditPage(client, { segmentKey, page, targetUserId });
    return {
      persistenceEnabled: true,
      ...pageState,
      segmentOptions: Object.values(ADMIN_AUDIT_SEGMENTS),
      reason: 'admin_audit_loaded'
    };
  });
}

export async function loadAdminAuditRecord({ auditId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      record: null,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => ({
    persistenceEnabled: true,
    record: await getAdminAuditRecordById(client, { auditId }),
    reason: 'admin_audit_record_loaded'
  }));
}
