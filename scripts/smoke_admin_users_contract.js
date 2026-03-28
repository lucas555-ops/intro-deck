import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP029' });
const surface = await surfaces.buildAdminUsersSurface({
  state: {
    persistenceEnabled: true,
    segmentKey: 'all',
    page: 0,
    pageSize: 8,
    totalCount: 1,
    hasPrev: false,
    hasNext: false,
    counts: {
      connected: 1,
      incomplete: 0,
      readyNotListed: 1,
      listed: 0,
      pendingIntros: 0
    },
    users: [{
      userId: 7,
      telegramUserId: 42,
      telegramUsername: 'rustam',
      hasLinkedIn: true,
      displayName: 'Rustam Lukmanov',
      headlineUser: 'Founder',
      visibilityStatus: 'hidden',
      profileState: 'active',
      introSentCount: 0,
      introReceivedCount: 0,
      pendingIntroCount: 0,
      hasNote: true
    }]
  }
});

if (!surface.text.includes('👥 Users')) {
  throw new Error('Users surface must expose the Users title');
}
if (!surface.text.includes('Connected 1')) {
  throw new Error('Users surface must include the connected count summary');
}

const keyboard = JSON.stringify(surface.reply_markup.inline_keyboard);
for (const callback of ['adm:usr:seg:all', 'adm:usr:seg:conn', 'adm:usr:open:7:all:0', 'adm:ops']) {
  if (!keyboard.includes(callback)) {
    throw new Error(`Users keyboard missing ${callback}`);
  }
}

const operatorComposerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const fragment of ['adm:usr:list', 'adm:usr:seg', 'adm:usr:page', 'adm:usr:open']) {
  if (!operatorComposerSource.includes(fragment)) {
    throw new Error(`Operator composer missing ${fragment} users routing`);
  }
}

console.log('OK: admin users contract');
