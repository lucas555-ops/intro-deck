import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const repoSource = readFileSync(new URL('../src/db/adminRepo.js', import.meta.url), 'utf8');
for (const fragment of [
  'CONNECTED_NO_PROFILE',
  'COMPLETE_NO_SKILLS',
  'LISTED_INACTIVE',
  'LISTED_ACTIVE',
  'estimateAdminNoticeAudienceCount'
]) {
  if (!repoSource.includes(fragment)) {
    throw new Error(`Notice targeting repo missing fragment: ${fragment}`);
  }
}

const appSource = readFileSync(new URL('../src/bot/surfaces/appSurfaces.js', import.meta.url), 'utf8');
for (const fragment of [
  "case 'CONNECTED_NO_PROFILE'",
  "case 'COMPLETE_NO_SKILLS'",
  "case 'LISTED_INACTIVE'"
]) {
  if (!appSource.includes(fragment)) {
    throw new Error(`Notice matcher missing fragment: ${fragment}`);
  }
}

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP038' });
const surface = await surfaces.buildAdminNoticeSurface({
  state: {
    notice: {
      body: 'Your profile is connected but still missing its core card details.',
      audienceKey: 'CONNECTED_NO_PROFILE',
      isActive: false,
      updatedAt: new Date().toISOString()
    },
    estimate: 14
  }
});

for (const fragment of ['📣 Notice', 'Connected, no profile', 'Estimated visibility: 14']) {
  if (!surface.text.includes(fragment)) {
    throw new Error(`Notice surface missing targeting fragment: ${fragment}`);
  }
}
for (const callback of ['adm:not:tpl', 'adm:not:aud', 'adm:not:preview']) {
  if (!JSON.stringify(surface.reply_markup.inline_keyboard).includes(callback)) {
    throw new Error(`Notice keyboard missing callback: ${callback}`);
  }
}

console.log('OK: notice targeting contract');
