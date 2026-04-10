import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP051.7' });
const surface = await surfaces.buildAdminBroadcastSurface({
  state: {
    persistenceEnabled: true,
    draft: {
      body: 'Your profile is ready. List it in the directory to receive intros.',
      audienceKey: 'READY_NOT_LISTED',
      mediaRef: 'https://example.com/invite.jpg',
      buttonText: 'Open Intro Deck',
      buttonUrl: 'https://intro-deck.vercel.app',
      updatedAt: new Date().toISOString()
    },
    estimate: 12
  }
});

if (!surface.text.includes('📬 Рассылка')) {
  throw new Error('Broadcast surface must expose the Russian broadcast title');
}
for (const callback of ['adm:bc:edit', 'adm:bc:aud', 'adm:bc:preview', 'adm:bc:media', 'adm:bc:btn', 'adm:bc:send', 'adm:bc:clear']) {
  if (!JSON.stringify(surface.reply_markup.inline_keyboard).includes(callback)) {
    throw new Error(`Broadcast keyboard missing ${callback}`);
  }
}

const preview = await surfaces.buildAdminBroadcastPreviewSurface({
  state: {
    persistenceEnabled: true,
    draft: {
      body: 'Caption text',
      audienceKey: 'ALL_CONNECTED',
      mediaRef: 'AgACAgQAAxk...',
      buttonText: 'Open',
      buttonUrl: 'https://intro-deck.vercel.app'
    },
    estimate: 5
  }
});
if (!preview.text.includes('Кнопка: Open')) {
  throw new Error('Broadcast preview must show button state');
}

const source = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const fragment of ['adm:bc:media', 'adm:bc:media:clear', 'adm:bc:btn', 'adm:bc:btn:text', 'adm:bc:btn:url', 'adm:bc:btn:clear']) {
  if (!source.includes(fragment)) {
    throw new Error(`Operator composer missing ${fragment} broadcast routing`);
  }
}

console.log('OK: broadcast composer uplift contract');
