import { createSurfaceBuilders } from '../src/bot/surfaces/appSurfaces.js';

const ctx = { from: { id: 1, username: 'tester' } };
const builders = createSurfaceBuilders({ appBaseUrl: 'https://example.com' });

if (typeof builders.buildHelpSurface !== 'function') {
  throw new Error('buildHelpSurface missing');
}

const surface = await builders.buildHelpSurface(ctx);
if (!surface || typeof surface.text !== 'string' || !surface.text.includes('Help')) {
  throw new Error('help surface text missing');
}
if (!surface.reply_markup?.inline_keyboard?.length) {
  throw new Error('help surface keyboard missing');
}

console.log('OK: help surface render compat');
