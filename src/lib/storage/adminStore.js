import {
  ADMIN_AUDIT_SEGMENTS,
  ADMIN_BROADCAST_AUDIENCES,
  ADMIN_DELIVERY_SEGMENTS,
  ADMIN_DIRECT_MESSAGE_TEMPLATES,
  ADMIN_INTRO_SEGMENTS,
  ADMIN_NOTICE_AUDIENCES,
  ADMIN_QUALITY_SEGMENTS,
  activateAdminNotice,
  beginAdminCommsInputSession,
  beginAdminUserNoteSession,
  cancelAdminCommsInputSession,
  cancelAdminUserNoteSession,
  clearAdminBroadcastDraft,
  clearAdminDirectMessageDraft,
  createAdminAuditEvent,
  createAdminCommOutboxRecord,
  disableAdminNotice,
  estimateAdminBroadcastAudienceCount,
  getAdminAuditRecordById,
  getAdminBroadcastDraft,
  getAdminCommOutboxRecordById,
  getAdminDeliveryRecordById,
  getAdminDirectMessageDraft,
  getAdminIntroDetailById,
  getAdminNoticeState,
  getAdminUserCardById,
  listAdminAuditPage,
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
  saveAdminUserNoteFromSession,
  setAdminUserListingVisibility,
  updateAdminBroadcastAudience,
  updateAdminCommOutboxRecord,
  updateAdminNoticeAudience,
  upsertAdminDirectMessageDraft
} from '../../db/adminRepo.js';
import { getTelegramConfig } from '../../config/env.js';
import { isDatabaseConfigured, withDbClient, withDbTransaction } from '../../db/pool.js';
import { sendTelegramMessage } from '../telegram/botApi.js';
import { upsertTelegramUser } from '../../db/usersRepo.js';
import { getIntroNotificationReceiptSummary, listRecentNotificationReceipts } from '../../db/notificationRepo.js';

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
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const [notice, broadcastDraft, outboxRows] = await Promise.all([
      getAdminNoticeState(client),
      getAdminBroadcastDraft(client),
      listAdminCommOutbox(client, { limit: 1 })
    ]);

    return {
      persistenceEnabled: true,
      notice,
      broadcastDraft,
      outboxCount: outboxRows.length,
      reason: 'admin_communications_loaded'
    };
  });
}

export async function loadAdminNoticeState() {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      notice: { body: '', audienceKey: 'ALL', isActive: false },
      audienceOptions: Object.values(ADMIN_NOTICE_AUDIENCES),
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => ({
    persistenceEnabled: true,
    notice: await getAdminNoticeState(client),
    audienceOptions: Object.values(ADMIN_NOTICE_AUDIENCES),
    reason: 'admin_notice_loaded'
  }));
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
      audienceOptions: Object.values(ADMIN_BROADCAST_AUDIENCES),
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const draft = await getAdminBroadcastDraft(client);
    const estimate = draft.body && draft.audienceKey
      ? await estimateAdminBroadcastAudienceCount(client, { audienceKey: draft.audienceKey })
      : 0;
    return {
      persistenceEnabled: true,
      draft,
      estimate,
      audienceOptions: Object.values(ADMIN_BROADCAST_AUDIENCES),
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
    const draft = await updateAdminBroadcastAudience(client, {
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
      status: 'sending',
      estimatedRecipientCount: recipients.length,
      deliveredCount: 0,
      failedCount: 0,
      createdByUserId: operatorUser.id
    });

    return { draft, recipients, outboxId, operatorUserId: operatorUser.id };
  });

  const { botToken } = getTelegramConfig();
  let deliveredCount = 0;
  let failedCount = 0;

  for (const recipient of prep.recipients) {
    try {
      await sendTelegramMessage({
        botToken,
        chatId: recipient.telegramUserId,
        text: prep.draft.body,
        replyMarkup: null
      });
      deliveredCount += 1;
    } catch (error) {
      console.warn('[admin broadcast] send failed', recipient.telegramUserId, error?.message || error);
      failedCount += 1;
    }
  }

  const finalStatus = failedCount > 0
    ? (deliveredCount > 0 ? 'sent_with_failures' : 'failed')
    : 'sent';

  await withDbTransaction(async (client) => {
    await updateAdminCommOutboxRecord(client, {
      outboxId: prep.outboxId,
      status: finalStatus,
      estimatedRecipientCount: prep.recipients.length,
      deliveredCount,
      failedCount
    });
    await createAdminAuditEvent(client, {
      eventType: finalStatus === 'failed' ? 'admin_broadcast_failed' : 'admin_broadcast_sent',
      actorUserId: prep.operatorUserId,
      summary: finalStatus === 'failed' ? 'Broadcast failed.' : 'Broadcast sent.',
      detail: {
        audienceKey: prep.draft.audienceKey,
        estimatedRecipientCount: prep.recipients.length,
        deliveredCount,
        failedCount,
        outboxId: prep.outboxId,
        status: finalStatus,
        body: prep.draft.body
      }
    });
    await clearAdminBroadcastDraft(client);
  });

  return {
    persistenceEnabled: true,
    sent: finalStatus === 'sent' || finalStatus === 'sent_with_failures',
    status: finalStatus,
    deliveredCount,
    failedCount,
    estimatedRecipientCount: prep.recipients.length,
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


export async function loadAdminIntrosPage({ segmentKey = 'all', page = 0 } = {}) {
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
    const pageState = await listAdminIntrosPage(client, { segmentKey, page });
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

export async function loadAdminAuditPage({ segmentKey = 'all', page = 0 } = {}) {
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
    const pageState = await listAdminAuditPage(client, { segmentKey, page });
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
