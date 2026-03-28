import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP029' });
const listedCard = await surfaces.buildAdminUserCardSurface({
  card: {
    user_id: 7,
    telegram_user_id: 42,
    telegram_username: 'rustam',
    display_name: 'Rustam Lukmanov',
    linkedin_name: 'Rustam Lukmanov',
    linkedin_sub: 'sub',
    profile_id: 11,
    profile_state: 'active',
    visibility_status: 'listed',
    headline_user: 'Founder',
    skills: [{ skill_label: 'Founder' }],
    intro_sent_count: 1,
    intro_received_count: 2,
    pending_intro_count: 1,
    last_seen_at: '2026-03-28T00:00:00Z',
    operator_note_text: 'High-signal founder'
  },
  segmentKey: 'listd',
  page: 1,
  notice: '✅ Listing updated.'
});

if (!listedCard.text.includes('🪪 User Card')) {
  throw new Error('User card surface must expose the User Card title');
}
if (!listedCard.text.includes('Operator note: High-signal founder')) {
  throw new Error('User card surface must include the operator note summary');
}
if (!listedCard.text.includes('Intros: sent 1 • received 2 • pending 1')) {
  throw new Error('User card surface must include intro counts');
}

const listedKeyboard = JSON.stringify(listedCard.reply_markup.inline_keyboard);
for (const callback of ['adm:card:view:7:listd:1', 'adm:card:hide:7:listd:1', 'adm:card:note:7:listd:1', 'adm:card:msg:7:listd:1']) {
  if (!listedKeyboard.includes(callback)) {
    throw new Error(`User card keyboard missing ${callback}`);
  }
}

const notePrompt = await surfaces.buildAdminUserNotePromptSurface({
  card: { user_id: 7, display_name: 'Rustam Lukmanov', operator_note_text: 'Current note' },
  segmentKey: 'all',
  page: 0
});
if (!JSON.stringify(notePrompt.reply_markup.inline_keyboard).includes('adm:card:cancelnote:7:all:0')) {
  throw new Error('Note prompt must offer a cancel path back to the user card');
}

const operatorComposerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const fragment of ['adm:card:view', 'adm:card:(hide|unhide)', 'adm:card:note', 'adm:card:cancelnote', 'adm:card:msg']) {
  if (!operatorComposerSource.includes(fragment)) {
    throw new Error(`Operator composer missing ${fragment} card routing`);
  }
}

const textComposerSource = readFileSync(new URL('../src/bot/composers/textComposer.js', import.meta.url), 'utf8');
if (!textComposerSource.includes('applyAdminUserNoteInput')) {
  throw new Error('Text composer must consume operator note input');
}

console.log('OK: admin user card contract');
