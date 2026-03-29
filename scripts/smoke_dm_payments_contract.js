import fs from 'node:fs';

const storeSource = fs.readFileSync(new URL('../src/lib/storage/dmStore.js', import.meta.url), 'utf8');
const composerSource = fs.readFileSync(new URL('../src/bot/composers/dmComposer.js', import.meta.url), 'utf8');
const envSource = fs.readFileSync(new URL('../src/config/env.js', import.meta.url), 'utf8');

for (const fragment of [
  'buildDmInvoicePayload',
  'parseDmInvoicePayload',
  'confirmDmPaymentForTelegramUser',
  'message:successful_payment',
  'pre_checkout_query',
  'DM_OPEN_PRICE_STARS',
  'dmOpenPriceStars'
]) {
  if (!(storeSource + composerSource + envSource).includes(fragment)) {
    throw new Error(`DM payment contract missing ${fragment}`);
  }
}

console.log('OK: dm payment contract');
