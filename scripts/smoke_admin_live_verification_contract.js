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
for (const callback of ['adm:verify', 'adm:rehearse']) {
  if (!systemKeyboard.includes(callback)) {
    throw new Error(`System hub missing ${callback}`);
  }
}

const verify = await surfaces.buildAdminLiveVerificationSurface();
if (!verify.text.includes('✅ Live verification') || !verify.text.includes('/api/health?full=1') || !verify.text.includes('go / no-go')) {
  throw new Error('Live verification surface missing verification copy');
}

const rehearse = await surfaces.buildAdminLaunchRehearsalSurface();
if (!rehearse.text.includes('🎭 Репетиция запуска') || !rehearse.text.includes('direct message') || !rehearse.text.includes('freeze сохраняется')) {
  throw new Error('Launch rehearsal surface missing rehearsal copy');
}

const composerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const fragment of ["composer.callbackQuery('adm:verify'", "composer.callbackQuery('adm:rehearse'", "renderAdminSurface(ctx, 'verify'", "renderAdminSurface(ctx, 'rehearse'"]) {
  if (!composerSource.includes(fragment)) {
    throw new Error(`Operator composer missing verification/rehearsal route fragment: ${fragment}`);
  }
}

console.log('OK: admin live verification / rehearsal contract');
