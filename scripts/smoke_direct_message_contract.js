import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP033' });
const compose = await surfaces.buildAdminUserMessageSurface({
  card: {
    user_id: 7,
    telegram_user_id: 42,
    telegram_username: 'rustam',
    display_name: 'Rustam Lukmanov',
    linkedin_name: 'Rustam Lukmanov'
  },
  state: {
    draft: {
      targetUserId: 7,
      templateKey: 'connect',
      body: 'Quick nudge: connect your LinkedIn in Intro Deck.',
      updatedAt: new Date().toISOString()
    }
  },
  segmentKey: 'all',
  page: 0
});

if (!compose.text.includes('✉️ Direct message')) {
  throw new Error('Direct message compose surface must expose the Direct message title');
}
for (const callback of ['adm:msg:tpl:7:all:0', 'adm:msg:edit:7:all:0', 'adm:msg:preview:7:all:0', 'adm:msg:clear:7:all:0']) {
  if (!JSON.stringify(compose.reply_markup.inline_keyboard).includes(callback)) {
    throw new Error(`Direct message compose keyboard missing ${callback}`);
  }
}

const picker = await surfaces.buildAdminDirectTemplatePickerSurface({
  card: { user_id: 7, display_name: 'Rustam Lukmanov' },
  state: { draft: { targetUserId: 7, templateKey: 'connect' } },
  segmentKey: 'all',
  page: 0
});
if (!JSON.stringify(picker.reply_markup.inline_keyboard).includes('adm:msg:tplset:7:all:0:connect')) {
  throw new Error('Direct template picker must expose template selection callbacks');
}

const preview = await surfaces.buildAdminDirectPreviewSurface({
  card: { user_id: 7, display_name: 'Rustam Lukmanov' },
  state: { draft: { targetUserId: 7, templateKey: 'connect', body: 'Hello there.' } },
  segmentKey: 'all',
  page: 0
});
if (!JSON.stringify(preview.reply_markup.inline_keyboard).includes('adm:msg:confirm:7:all:0')) {
  throw new Error('Direct preview must expose confirm send callback');
}

const operatorComposerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const fragment of ['adm:msg:tpl', 'adm:msg:tplset', 'adm:msg:edit', 'adm:msg:preview', 'adm:msg:confirm', 'adm:msg:clear']) {
  if (!operatorComposerSource.includes(fragment)) {
    throw new Error(`Operator composer missing ${fragment} direct messaging routing`);
  }
}

const textComposerSource = readFileSync(new URL('../src/bot/composers/textComposer.js', import.meta.url), 'utf8');
if (!textComposerSource.includes("session?.inputKind === 'direct_body'")) {
  throw new Error('Text composer must consume direct-body admin input sessions');
}

console.log('OK: direct message contract');
