import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const operatorComposerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
if (!operatorComposerSource.includes('isOperatorTelegramUser')) {
  throw new Error('Operator composer must guard admin shell with allowlist checks');
}
if (!operatorComposerSource.includes('buildOperatorOnlySurface')) {
  throw new Error('Operator composer must render a safe operator-only denial surface');
}
if (!operatorComposerSource.includes("composer.command('ops'")) {
  throw new Error('Operator composer must keep /ops as the operator entrypoint');
}

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP028' });
const denied = await surfaces.buildOperatorOnlySurface();
if (!denied.text.includes('only available to the operator account')) {
  throw new Error('Operator-only denial surface must use product-safe copy');
}
if (!JSON.stringify(denied.reply_markup.inline_keyboard).includes('home:root')) {
  throw new Error('Operator-only denial surface must offer a Home escape path');
}

console.log('OK: admin allowlist gate contract');
