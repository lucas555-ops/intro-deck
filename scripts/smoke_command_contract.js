import { readFileSync } from 'node:fs';
import {
  renderHelpKeyboard,
  renderHelpText,
  renderOperatorDiagnosticsText,
  renderProfileMenuKeyboard
} from '../src/lib/telegram/render.js';

const homeComposerSource = readFileSync(new URL('../src/bot/composers/homeComposer.js', import.meta.url), 'utf8');
const profileComposerSource = readFileSync(new URL('../src/bot/composers/profileComposer.js', import.meta.url), 'utf8');
const directoryComposerSource = readFileSync(new URL('../src/bot/composers/directoryComposer.js', import.meta.url), 'utf8');
const introComposerSource = readFileSync(new URL('../src/bot/composers/introComposer.js', import.meta.url), 'utf8');
const operatorComposerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');

for (const [command, source] of [
  ['start', homeComposerSource],
  ['menu', homeComposerSource],
  ['help', homeComposerSource],
  ['profile', profileComposerSource],
  ['browse', directoryComposerSource],
  ['inbox', introComposerSource],
  ['ops', operatorComposerSource]
]) {
  if (!source.includes(`composer.command('${command}'`)) {
    throw new Error(`Missing /${command} command handler`);
  }
}

if (homeComposerSource.includes("composer.command('sent'")) {
  throw new Error('/sent must not be exposed as a supported command');
}

const helpText = renderHelpText();
if (!helpText.includes('Use Intro Deck to connect your LinkedIn identity')) {
  throw new Error('Help surface must explain the product clearly');
}

const helpKeyboard = JSON.stringify(renderHelpKeyboard().inline_keyboard);
for (const callback of ['p:menu', 'dir:list:0', 'intro:inbox', 'home:root']) {
  if (!helpKeyboard.includes(callback)) {
    throw new Error(`Help keyboard missing ${callback}`);
  }
}

const disconnectedProfileKeyboard = JSON.stringify(renderProfileMenuKeyboard({
  appBaseUrl: 'https://example.com',
  telegramUserId: 42,
  profileSnapshot: null,
  persistenceEnabled: true
}).inline_keyboard);
if (!disconnectedProfileKeyboard.includes('Connect LinkedIn')) {
  throw new Error('Disconnected profile surface must expose Connect LinkedIn CTA');
}
if (disconnectedProfileKeyboard.includes('p:ed:dn')) {
  throw new Error('Disconnected profile surface must not expose edit actions');
}

const deniedOpsText = renderOperatorDiagnosticsText({ allowed: false });
if (!deniedOpsText.includes('only available to the operator account')) {
  throw new Error('Unauthorized /ops copy must be product-safe');
}

console.log('OK: command contract cleanup baseline');
