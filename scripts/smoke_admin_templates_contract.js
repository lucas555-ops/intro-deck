import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const repoSource = readFileSync(new URL('../src/db/adminRepo.js', import.meta.url), 'utf8');
for (const fragment of [
  'ADMIN_NOTICE_TEMPLATES',
  'ADMIN_BROADCAST_TEMPLATES',
  'applyAdminNoticeTemplate',
  'applyAdminBroadcastTemplate'
]) {
  if (!repoSource.includes(fragment)) {
    throw new Error(`Template repo missing fragment: ${fragment}`);
  }
}

const operatorSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const fragment of [
  'adm:tpl:not',
  'adm:tpl:bc',
  'adm:not:tpl',
  'adm:bc:tpl',
  'applyAdminNoticeTemplateSelection',
  'applyAdminBroadcastTemplateSelection'
]) {
  if (!operatorSource.includes(fragment)) {
    throw new Error(`Operator composer missing template routing fragment: ${fragment}`);
  }
}

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP038' });
const hub = await surfaces.buildAdminTemplatesSurface({
  state: {
    noticeTemplates: [{ key: 'complete_profile', label: 'Complete profile', audienceKey: 'PROFILE_INCOMPLETE' }],
    broadcastTemplates: [{ key: 'list_profile', label: 'List ready profiles', audienceKey: 'READY_NOT_LISTED' }],
    directTemplates: [{ key: 'complete', label: 'Complete profile' }]
  }
});
for (const fragment of ['📌 Templates', 'Notice templates: 1', 'Broadcast templates: 1']) {
  if (!hub.text.includes(fragment)) {
    throw new Error(`Templates hub missing fragment: ${fragment}`);
  }
}
for (const callback of ['adm:tpl:not', 'adm:tpl:bc', 'adm:tpl:direct']) {
  if (!JSON.stringify(hub.reply_markup.inline_keyboard).includes(callback)) {
    throw new Error(`Templates hub missing callback: ${callback}`);
  }
}

const noticePicker = await surfaces.buildAdminNoticeTemplatePickerSurface({
  state: { notice: { audienceKey: 'ALL' }, estimate: 5 },
  templates: [{ key: 'complete_profile', label: 'Complete profile', audienceKey: 'PROFILE_INCOMPLETE' }]
});
if (!noticePicker.text.includes('Complete profile → Profile incomplete')) {
  throw new Error('Notice template picker missing template line');
}
if (!JSON.stringify(noticePicker.reply_markup.inline_keyboard).includes('adm:not:tpl:complete_profile')) {
  throw new Error('Notice template picker missing apply callback');
}

const broadcastPicker = await surfaces.buildAdminBroadcastTemplatePickerSurface({
  state: { draft: { audienceKey: 'ALL_CONNECTED' }, estimate: 9 },
  templates: [{ key: 'list_profile', label: 'List ready profiles', audienceKey: 'READY_NOT_LISTED' }]
});
if (!broadcastPicker.text.includes('List ready profiles → Ready not listed')) {
  throw new Error('Broadcast template picker missing template line');
}
if (!JSON.stringify(broadcastPicker.reply_markup.inline_keyboard).includes('adm:bc:tpl:list_profile')) {
  throw new Error('Broadcast template picker missing apply callback');
}

console.log('OK: admin templates contract');
