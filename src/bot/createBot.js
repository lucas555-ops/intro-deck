import { Bot } from 'grammy';
import { getAppConfig, getTelegramConfig } from '../config/env.js';
import { createContactUnlockComposer } from './composers/contactUnlockComposer.js';
import { createDirectoryComposer } from './composers/directoryComposer.js';
import { createDmComposer } from './composers/dmComposer.js';
import { createHomeComposer } from './composers/homeComposer.js';
import { createIntroComposer } from './composers/introComposer.js';
import { createOperatorComposer } from './composers/operatorComposer.js';
import { createProfileComposer } from './composers/profileComposer.js';
import { createTextComposer } from './composers/textComposer.js';
import { createSurfaceBuilders } from './surfaces/appSurfaces.js';
import { createAdminSurfaceBuilders } from './surfaces/adminSurfaces.js';
import { formatIntroDecisionReason, formatIntroRequestReason } from './utils/notices.js';
import { clearAllPendingInputs } from './utils/pendingInputs.js';

let botSingleton = null;
let botInitPromise = null;

export async function createBot() {
  if (botSingleton) {
    if (botInitPromise) {
      await botInitPromise;
    }
    return botSingleton;
  }

  const { botToken } = getTelegramConfig();
  const { appBaseUrl } = getAppConfig();
  const bot = new Bot(botToken);

  const surfaces = createSurfaceBuilders({ appBaseUrl });
  const adminSurfaces = createAdminSurfaceBuilders({ currentStep: 'STEP047' });

  bot.use(createHomeComposer({
    appBaseUrl,
    clearAllPendingInputs,
    buildHomeSurface: surfaces.buildHomeSurface,
    buildHelpSurface: surfaces.buildHelpSurface
  }));


  bot.use(createContactUnlockComposer({
    clearAllPendingInputs,
    buildContactUnlockDetailSurface: surfaces.buildContactUnlockDetailSurface,
    buildIntroInboxSurface: surfaces.buildIntroInboxSurface
  }));

  bot.use(createDmComposer({
    clearAllPendingInputs,
    buildDmInboxSurface: surfaces.buildDmInboxSurface,
    buildDmThreadSurface: surfaces.buildDmThreadSurface
  }));

  bot.use(createIntroComposer({
    clearAllPendingInputs,
    buildIntroInboxSurface: surfaces.buildIntroInboxSurface,
    buildIntroDetailSurface: surfaces.buildIntroDetailSurface,
    buildDirectoryCardSurface: surfaces.buildDirectoryCardSurface,
    formatIntroDecisionReason
  }));

  bot.use(createProfileComposer({
    clearAllPendingInputs,
    buildProfileMenuSurface: surfaces.buildProfileMenuSurface,
    buildProfilePreviewSurface: surfaces.buildProfilePreviewSurface,
    buildProfileSkillsSurface: surfaces.buildProfileSkillsSurface
  }));

  bot.use(createDirectoryComposer({
    clearAllPendingInputs,
    buildDirectoryListSurface: surfaces.buildDirectoryListSurface,
    buildDirectoryCardSurface: surfaces.buildDirectoryCardSurface,
    buildDirectoryFiltersSurface: surfaces.buildDirectoryFiltersSurface,
    buildIntroInboxSurface: surfaces.buildIntroInboxSurface,
    formatIntroRequestReason
  }));

  bot.use(createTextComposer({
    buildDirectoryFiltersSurface: surfaces.buildDirectoryFiltersSurface,
    buildAdminUserCardSurface: adminSurfaces.buildAdminUserCardSurface,
    buildAdminUserMessageSurface: adminSurfaces.buildAdminUserMessageSurface,
    buildAdminNoticeSurface: adminSurfaces.buildAdminNoticeSurface,
    buildAdminBroadcastSurface: adminSurfaces.buildAdminBroadcastSurface,
    buildAdminSearchResultsSurface: adminSurfaces.buildAdminSearchResultsSurface,
    buildDmThreadSurface: surfaces.buildDmThreadSurface
  }));

  bot.use(createOperatorComposer({
    clearAllPendingInputs,
    buildOperatorDiagnosticsSurface: surfaces.buildOperatorDiagnosticsSurface,
    buildAdminHomeSurface: adminSurfaces.buildAdminHomeSurface,
    buildAdminOperationsSurface: adminSurfaces.buildAdminOperationsSurface,
    buildAdminCommunicationsSurface: adminSurfaces.buildAdminCommunicationsSurface,
    buildAdminSystemSurface: adminSurfaces.buildAdminSystemSurface,
    buildAdminHealthSurface: adminSurfaces.buildAdminHealthSurface,
    buildAdminOperatorsSurface: adminSurfaces.buildAdminOperatorsSurface,
    buildAdminRunbookSurface: adminSurfaces.buildAdminRunbookSurface,
    buildAdminFreezeSurface: adminSurfaces.buildAdminFreezeSurface,
    buildAdminLiveVerificationSurface: adminSurfaces.buildAdminLiveVerificationSurface,
    buildAdminLaunchRehearsalSurface: adminSurfaces.buildAdminLaunchRehearsalSurface,
    buildAdminUsersSurface: adminSurfaces.buildAdminUsersSurface,
    buildAdminBulkActionsSurface: adminSurfaces.buildAdminBulkActionsSurface,
    buildAdminUserCardSurface: adminSurfaces.buildAdminUserCardSurface,
    buildAdminUserPublicCardSurface: adminSurfaces.buildAdminUserPublicCardSurface,
    buildAdminUserMessageSurface: adminSurfaces.buildAdminUserMessageSurface,
    buildAdminDirectTemplatePickerSurface: adminSurfaces.buildAdminDirectTemplatePickerSurface,
    buildAdminDirectPreviewSurface: adminSurfaces.buildAdminDirectPreviewSurface,
    buildAdminUserNotePromptSurface: adminSurfaces.buildAdminUserNotePromptSurface,
    buildAdminIntrosSurface: adminSurfaces.buildAdminIntrosSurface,
    buildAdminIntroDetailSurface: adminSurfaces.buildAdminIntroDetailSurface,
    buildAdminDeliverySurface: adminSurfaces.buildAdminDeliverySurface,
    buildAdminDeliveryRecordSurface: adminSurfaces.buildAdminDeliveryRecordSurface,
    buildAdminQualitySurface: adminSurfaces.buildAdminQualitySurface,
    buildAdminAuditSurface: adminSurfaces.buildAdminAuditSurface,
    buildAdminAuditRecordSurface: adminSurfaces.buildAdminAuditRecordSurface,
    buildAdminNoticeSurface: adminSurfaces.buildAdminNoticeSurface,
    buildAdminNoticeAudienceSurface: adminSurfaces.buildAdminNoticeAudienceSurface,
    buildAdminNoticePreviewSurface: adminSurfaces.buildAdminNoticePreviewSurface,
    buildAdminNoticeTemplatePickerSurface: adminSurfaces.buildAdminNoticeTemplatePickerSurface,
    buildAdminBroadcastSurface: adminSurfaces.buildAdminBroadcastSurface,
    buildAdminBroadcastAudienceSurface: adminSurfaces.buildAdminBroadcastAudienceSurface,
    buildAdminBroadcastPreviewSurface: adminSurfaces.buildAdminBroadcastPreviewSurface,
    buildAdminBroadcastTemplatePickerSurface: adminSurfaces.buildAdminBroadcastTemplatePickerSurface,
    buildAdminTemplatesSurface: adminSurfaces.buildAdminTemplatesSurface,
    buildAdminBroadcastFailuresSurface: adminSurfaces.buildAdminBroadcastFailuresSurface,
    buildAdminOutboxSurface: adminSurfaces.buildAdminOutboxSurface,
    buildAdminOutboxRecordSurface: adminSurfaces.buildAdminOutboxRecordSurface,
    buildAdminSearchPromptSurface: adminSurfaces.buildAdminSearchPromptSurface,
    buildAdminSearchResultsSurface: adminSurfaces.buildAdminSearchResultsSurface,
    buildAdminCommsEditPromptSurface: adminSurfaces.buildAdminCommsEditPromptSurface,
    buildAdminPlaceholderSurface: adminSurfaces.buildAdminPlaceholderSurface,
    buildOperatorOnlySurface: adminSurfaces.buildOperatorOnlySurface
  }));

  bot.catch((error) => {
    console.error('[bot.catch]', error.error);
  });

  botSingleton = bot;
  botInitPromise = bot.init().catch((error) => {
    botSingleton = null;
    botInitPromise = null;
    throw error;
  });

  await botInitPromise;
  return botSingleton;
}
 
