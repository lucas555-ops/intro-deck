import { readFileSync } from 'node:fs';
import { renderHomeKeyboard } from '../src/lib/telegram/render.js';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const operatorHomeKeyboard = JSON.stringify(renderHomeKeyboard({
  appBaseUrl: 'https://example.com',
  telegramUserId: 42,
  profileSnapshot: { linkedin_sub: 'abc' },
  persistenceEnabled: true,
  isOperator: true
}).inline_keyboard);
if (!operatorHomeKeyboard.includes('adm:home')) {
  throw new Error('Operator home keyboard must expose the admin shell entrypoint');
}
if (operatorHomeKeyboard.includes('ops:diag')) {
  throw new Error('Operator home keyboard must not expose the legacy diagnostics callback directly');
}

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP043' });
const adminHome = await surfaces.buildAdminHomeSurface();
if (!adminHome.text.includes('👑 Админка')) {
  throw new Error('Admin home surface must expose the Russian admin title');
}
for (const callback of ['adm:ops', 'adm:comms', 'adm:sys', 'adm:home:funnel:connected', 'adm:home:funnel:ready_not_listed', 'home:root']) {
  if (!JSON.stringify(adminHome.reply_markup.inline_keyboard).includes(callback)) {
    throw new Error(`Admin home keyboard missing ${callback}`);
  }
}

const operatorComposerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const fragment of ['adm:home:funnel:', 'adm:ops:funnel:', 'adm:comms:funnel:', 'adm:sys:funnel:']) {
  if (!operatorComposerSource.includes(fragment)) {
    throw new Error(`Operator composer missing funnel routing fragment: ${fragment}`);
  }
}

const createBotSource = readFileSync(new URL('../src/bot/createBot.js', import.meta.url), 'utf8');
if (!createBotSource.includes("currentStep: 'STEP048'")) {
  throw new Error('Bot factory must wire STEP048 admin surfaces');
}

console.log('OK: admin shell contract');
