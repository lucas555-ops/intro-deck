import { readFileSync } from 'node:fs';

const schemaCompat = readFileSync(new URL('../src/db/schemaCompat.js', import.meta.url), 'utf8');
const profileRepo = readFileSync(new URL('../src/db/profileRepo.js', import.meta.url), 'utf8');
const directoryRepo = readFileSync(new URL('../src/db/directoryRepo.js', import.meta.url), 'utf8');
const contactUnlockRepo = readFileSync(new URL('../src/db/contactUnlockRepo.js', import.meta.url), 'utf8');
const handoff = readFileSync(new URL('../doc/15_NEW_CHAT_HANDOFF.md', import.meta.url), 'utf8');
const currentState = readFileSync(new URL('../doc/00_CURRENT_STATE.md', import.meta.url), 'utf8');

for (const fragment of ['member_profiles_has_hidden_telegram_username', 'has_contact_unlock_requests_table']) {
  if (!schemaCompat.includes(fragment)) {
    throw new Error(`schemaCompat helper missing ${fragment}`);
  }
}

for (const [name, source] of [['profileRepo', profileRepo], ['directoryRepo', directoryRepo], ['contactUnlockRepo', contactUnlockRepo]]) {
  if (!source.includes('getSchemaCompat') || !source.includes('selectHiddenTelegramUsername')) {
    throw new Error(`${name} must use schema compat helpers`);
  }
}

if (!contactUnlockRepo.includes('contact_unlock_requires_migrations')) {
  throw new Error('contact unlock repo must return explicit migration-required reason when schema is missing');
}

for (const doc of [handoff, currentState]) {
  if (!doc.includes('STEP050J') || !doc.includes('019_contact_unlock_requests.sql')) {
    throw new Error('docs must mention STEP050J migration-required schema compat decision');
  }
}
