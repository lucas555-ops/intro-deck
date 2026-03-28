import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP030' });
const surface = await surfaces.buildAdminOutboxSurface({
  records: [{
    id: 4,
    event_type: 'broadcast',
    status: 'sent',
    body: 'Warm intros are live. Complete your profile.',
    created_at: new Date().toISOString(),
    sent_at: new Date().toISOString()
  }]
});

if (!surface.text.includes('📤 Outbox')) {
  throw new Error('Outbox surface must expose the Outbox title');
}
if (!JSON.stringify(surface.reply_markup.inline_keyboard).includes('adm:outbox:open:4')) {
  throw new Error('Outbox keyboard must expose record drilldown');
}

const source = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const fragment of ['adm:outbox', 'adm:outbox:open']) {
  if (!source.includes(fragment)) {
    throw new Error(`Operator composer missing ${fragment} outbox routing`);
  }
}

console.log('OK: outbox contract');
