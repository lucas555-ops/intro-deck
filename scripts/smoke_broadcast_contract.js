import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP030' });
const surface = await surfaces.buildAdminBroadcastSurface({
  state: {
    persistenceEnabled: true,
    draft: {
      body: 'Your profile is ready. List it in the directory to receive intros.',
      audienceKey: 'READY_NOT_LISTED',
      updatedAt: new Date().toISOString()
    },
    estimate: 12
  }
});

if (!surface.text.includes('📬 Broadcast')) {
  throw new Error('Broadcast surface must expose the Broadcast title');
}
for (const callback of ['adm:bc:edit', 'adm:bc:aud', 'adm:bc:preview', 'adm:bc:send', 'adm:bc:clear']) {
  if (!JSON.stringify(surface.reply_markup.inline_keyboard).includes(callback)) {
    throw new Error(`Broadcast keyboard missing ${callback}`);
  }
}

const source = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const fragment of ['adm:bc:edit', 'adm:bc:aud:', 'adm:bc:preview', 'adm:bc:confirm', 'adm:bc:clear']) {
  if (!source.includes(fragment)) {
    throw new Error(`Operator composer missing ${fragment} broadcast routing`);
  }
}

console.log('OK: broadcast contract');
