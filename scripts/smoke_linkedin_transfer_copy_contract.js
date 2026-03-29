import fs from 'node:fs';

const source = fs.readFileSync(new URL('../api/oauth/callback/linkedin.js', import.meta.url), 'utf8');

const requiredTokens = [
  '🔗 LinkedIn import',
  '💾 Saved in Intro Deck',
  '✍️ Still editable in Telegram',
  '➡️ Next',
  'What changed',
  'parseMode: null',
  '<h2>LinkedIn import</h2>',
  '<h2>Saved in Intro Deck</h2>',
  '<h2>Still editable in Telegram</h2>',
  '<h2>Next</h2>'
];

for (const token of requiredTokens) {
  if (!source.includes(token)) {
    throw new Error(`Missing LinkedIn transfer copy token: ${token}`);
  }
}

console.log('OK: linkedin transfer copy contract');
