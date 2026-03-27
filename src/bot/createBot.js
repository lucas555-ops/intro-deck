import { Bot } from 'grammy';
import { getAppConfig, getTelegramConfig } from '../config/env.js';
import { createDirectoryComposer } from './composers/directoryComposer.js';
import { createHomeComposer } from './composers/homeComposer.js';
import { createIntroComposer } from './composers/introComposer.js';
import { createOperatorComposer } from './composers/operatorComposer.js';
import { createProfileComposer } from './composers/profileComposer.js';
import { createTextComposer } from './composers/textComposer.js';
import { createSurfaceBuilders } from './surfaces/appSurfaces.js';
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

  bot.use(createHomeComposer({
    appBaseUrl,
    clearAllPendingInputs,
    buildHomeSurface: surfaces.buildHomeSurface
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
    buildDirectoryFiltersSurface: surfaces.buildDirectoryFiltersSurface
  }));

  bot.use(createOperatorComposer({
    clearAllPendingInputs,
    buildOperatorDiagnosticsSurface: surfaces.buildOperatorDiagnosticsSurface
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
 
