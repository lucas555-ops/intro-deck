import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP032' });
const audit = await surfaces.buildAdminAuditSurface({
  state: {
    persistenceEnabled: true,
    segmentKey: 'all',
    page: 0,
    pageSize: 10,
    totalCount: 1,
    records: [{ id: 12, event_type: 'admin_listing_hidden', summary: 'Listing hidden.', created_at: new Date().toISOString(), target_user_id: 9 }]
  }
});
const auditKeyboard = JSON.stringify(audit.reply_markup.inline_keyboard);
for (const callback of ['adm:audit:seg:all', 'adm:audit:seg:user', 'adm:sys']) {
  if (!auditKeyboard.includes(callback)) throw new Error(`Audit keyboard missing ${callback}`);
}
const detail = await surfaces.buildAdminAuditRecordSurface({
  record: { id: 12, event_type: 'admin_listing_hidden', summary: 'Listing hidden.', created_at: new Date().toISOString(), target_user_id: 9, detail: { previousVisibilityStatus: 'listed', nextVisibilityStatus: 'hidden' } },
  backCallback: 'adm:audit:page:all:0'
});
if (!JSON.stringify(detail.reply_markup.inline_keyboard).includes('adm:audit:page:all:0')) throw new Error('Audit detail must link back to paged audit list');
const composerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const needle of ['renderAdminAudit', 'renderAdminAuditRecord', "composer.callbackQuery('adm:audit'", 'adm:audit:open:']) {
  if (!composerSource.includes(needle)) throw new Error(`Operator composer missing ${needle}`);
}
const storeSource = readFileSync(new URL('../src/lib/storage/adminStore.js', import.meta.url), 'utf8');
for (const needle of ['loadAdminAuditPage', 'loadAdminAuditRecord']) {
  if (!storeSource.includes(needle)) throw new Error(`Admin store missing ${needle}`);
}
console.log('OK: audit detail contract');
