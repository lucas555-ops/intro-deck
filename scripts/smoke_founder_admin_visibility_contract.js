import { readFileSync } from 'node:fs';

process.env.ADMIN_CHAT_ID = '611377976';
process.env.TG_OPERATOR_IDS = '700000001,700000002';
process.env.OPERATOR_TELEGRAM_USER_IDS = '';

const { isOperatorTelegramUser } = await import('../src/config/env.js');
const { renderHomeKeyboard } = await import('../src/lib/telegram/render.js');

if (!isOperatorTelegramUser(611377976)) {
  throw new Error('ADMIN_CHAT_ID founder must be treated as an operator');
}
if (!isOperatorTelegramUser(700000001)) {
  throw new Error('TG_OPERATOR_IDS users must be treated as operators');
}
if (isOperatorTelegramUser(900000009)) {
  throw new Error('Regular users must not pass founder/operator allowlist checks');
}

const founderKeyboard = JSON.stringify(renderHomeKeyboard({
  appBaseUrl: 'https://example.com',
  telegramUserId: 611377976,
  profileSnapshot: { linkedin_sub: 'sub_123', completion: { isReady: true } },
  persistenceEnabled: true,
  isOperator: true
}).inline_keyboard);
if (!founderKeyboard.includes('👑 Админка') || !founderKeyboard.includes('adm:home')) {
  throw new Error('Founder/operator home keyboard must expose the Admin entrypoint');
}

const regularKeyboard = JSON.stringify(renderHomeKeyboard({
  appBaseUrl: 'https://example.com',
  telegramUserId: 900000009,
  profileSnapshot: { linkedin_sub: 'sub_456', completion: { isReady: true } },
  persistenceEnabled: true,
  isOperator: false
}).inline_keyboard);
if (regularKeyboard.includes('👑 Админка') || regularKeyboard.includes('adm:home')) {
  throw new Error('Regular user home keyboard must not expose the Admin entrypoint');
}

const operatorComposerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
if (!operatorComposerSource.includes("composer.command('admin'")) {
  throw new Error('Operator composer must keep /admin as a founder/operator fallback');
}
if (!operatorComposerSource.includes("composer.command('ops'")) {
  throw new Error('Operator composer must keep /ops as the main operator entrypoint');
}

console.log('OK: founder-only admin entry visibility contract');
