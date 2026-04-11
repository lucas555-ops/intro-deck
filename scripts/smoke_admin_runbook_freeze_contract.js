import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP043' });

const system = await surfaces.buildAdminSystemSurface({
  summary: {
    retryDue: 1,
    exhausted: 2,
    recentAuditEvents: 3,
    failedDeliveries: 4,
    failures24h: 1,
    failures7d: 5,
    delivered24h: 8,
    delivered7d: 21,
    operatorActions24h: 9,
    operatorActions7d: 17,
    listingChanges7d: 2,
    relinks7d: 1
  }
});
const systemKeyboard = JSON.stringify(system.reply_markup.inline_keyboard);
for (const callback of ['adm:runbook', 'adm:freeze', 'adm:health']) {
  if (!systemKeyboard.includes(callback)) {
    throw new Error(`System hub missing ${callback}`);
  }
}

const runbook = await surfaces.buildAdminRunbookSurface();
if (!runbook.text.includes('🧭 Регламент запуска') || !runbook.text.includes('Проверка перед уведомлением или рассылкой')) {
  throw new Error('Runbook surface missing launch ops copy');
}

const freeze = await surfaces.buildAdminFreezeSurface();
if (!freeze.text.includes('🧊 Заморозка') || !freeze.text.includes('Что замораживаем:') || !freeze.text.includes('Выход из заморозки только после ручного прохода проверки.')) {
  throw new Error('Freeze surface missing freeze policy copy');
}

const composerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const fragment of ["composer.callbackQuery('adm:runbook'", "composer.callbackQuery('adm:freeze'", "renderAdminSurface(ctx, 'runbook'", "renderAdminSurface(ctx, 'freeze'"]) {
  if (!composerSource.includes(fragment)) {
    throw new Error(`Operator composer missing runbook/freeze route fragment: ${fragment}`);
  }
}

console.log('OK: admin runbook/freeze contract');
