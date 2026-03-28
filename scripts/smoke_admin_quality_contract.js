import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP032' });
const quality = await surfaces.buildAdminQualitySurface({
  state: {
    persistenceEnabled: true,
    segmentKey: 'listinc',
    page: 0,
    pageSize: 8,
    totalCount: 1,
    counts: { listedIncomplete: 1, readyNotListed: 2, missingCritical: 3, duplicateLike: 0, relink: 0 },
    users: [{ userId: 7, telegramUserId: 77, displayName: 'Alice Example', headlineUser: 'Founder', skillsCount: 1, listedIncomplete: true }]
  }
});
const keyboard = JSON.stringify(quality.reply_markup.inline_keyboard);
for (const callback of ['adm:qual:seg:listinc', 'adm:qual:seg:ready', 'adm:qual:seg:miss', 'adm:ops']) {
  if (!keyboard.includes(callback)) throw new Error(`Quality keyboard missing ${callback}`);
}
const composerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const needle of ['renderAdminQuality', "composer.callbackQuery('adm:qual'", 'adm:qual:seg:', 'adm:qual:page:']) {
  if (!composerSource.includes(needle)) throw new Error(`Operator composer missing ${needle}`);
}
const repoSource = readFileSync(new URL('../src/db/adminRepo.js', import.meta.url), 'utf8');
for (const needle of ['ADMIN_QUALITY_SEGMENTS', 'listAdminQualityPage', 'admin_audit_events']) {
  if (!repoSource.includes(needle)) throw new Error(`Admin repo missing ${needle}`);
}
console.log('OK: admin quality contract');
