import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const repoSource = readFileSync(new URL('../src/db/adminRepo.js', import.meta.url), 'utf8');
for (const needle of ['ADMIN_SEARCH_SCOPES', 'searchAdminUsersPage', 'searchAdminIntrosPage', 'searchAdminDeliveryPage', 'searchAdminOutboxPage', 'searchAdminAuditPage']) {
  if (!repoSource.includes(needle)) {
    throw new Error(`Admin repo missing search contract: ${needle}`);
  }
}

const composerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const needle of ['adm:search:(users|intros|delivery|outbox|audit)', 'beginAdminScopedSearchPrompt', 'loadAdminSearchResults']) {
  if (!composerSource.includes(needle)) {
    throw new Error(`Operator composer missing search route: ${needle}`);
  }
}

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP039' });
const home = await surfaces.buildAdminHomeSurface({ summary: {} });
const homeKeyboard = JSON.stringify(home.reply_markup.inline_keyboard);
for (const callback of ['adm:search:users', 'adm:search:intros', 'adm:search:delivery', 'adm:search:audit']) {
  if (!homeKeyboard.includes(callback)) {
    throw new Error(`Admin home missing search shortcut: ${callback}`);
  }
}

console.log('OK: admin search contract');
