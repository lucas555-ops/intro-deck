import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP030' });
const surface = await surfaces.buildAdminNoticeSurface({
  state: {
    persistenceEnabled: true,
    notice: {
      body: 'Complete your profile to start receiving warm intros.',
      audienceKey: 'READY_NOT_LISTED',
      isActive: true,
      updatedAt: new Date().toISOString()
    }
  }
});

if (!surface.text.includes('📣 Notice')) {
  throw new Error('Notice surface must expose the Notice title');
}
for (const callback of ['adm:not:edit', 'adm:not:aud', 'adm:not:preview']) {
  if (!JSON.stringify(surface.reply_markup.inline_keyboard).includes(callback)) {
    throw new Error(`Notice keyboard missing ${callback}`);
  }
}

const source = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const fragment of ['adm:not:edit', 'adm:not:aud:', 'adm:not:preview', 'adm:not:on', 'adm:not:off']) {
  if (!source.includes(fragment)) {
    throw new Error(`Operator composer missing ${fragment} notice routing`);
  }
}

console.log('OK: notice contract');
