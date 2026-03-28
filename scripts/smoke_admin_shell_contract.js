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

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP028' });
const adminHome = await surfaces.buildAdminHomeSurface();
if (!adminHome.text.includes('👑 Admin')) {
  throw new Error('Admin home surface must expose the Admin title');
}
for (const callback of ['adm:ops', 'adm:comms', 'adm:sys', 'home:root']) {
  if (!JSON.stringify(adminHome.reply_markup.inline_keyboard).includes(callback)) {
    throw new Error(`Admin home keyboard missing ${callback}`);
  }
}

const operatorComposerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const callback of ['adm:home', 'adm:ops', 'adm:comms', 'adm:sys', 'adm:health', 'adm:retry', 'adm:opscope']) {
  if (!operatorComposerSource.includes(`composer.callbackQuery('${callback}'`)) {
    throw new Error(`Operator composer missing ${callback} callback handler`);
  }
}

const createBotSource = readFileSync(new URL('../src/bot/createBot.js', import.meta.url), 'utf8');
if (!createBotSource.includes('createAdminSurfaceBuilders')) {
  throw new Error('Bot factory must wire admin surface builders');
}

console.log('OK: admin shell contract');
