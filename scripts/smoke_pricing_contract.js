import { readFileSync } from 'node:fs';

const envSource = readFileSync(new URL('../src/config/env.js', import.meta.url), 'utf8');
for (const fragment of ['PRO_MONTHLY_PRICE_STARS', 'PRO_MONTHLY_DURATION_DAYS', 'getPricingConfig', 'getSubscriptionConfig', 'pricingConfigured']) {
  if (!envSource.includes(fragment)) {
    throw new Error(`Env pricing contract missing ${fragment}`);
  }
}

const monetizationStoreSource = readFileSync(new URL('../src/lib/storage/monetizationStore.js', import.meta.url), 'utf8');
for (const fragment of ['buildProInvoicePayload', 'parseProInvoicePayload', 'confirmProSubscriptionPaymentForTelegramUser', 'getProSubscriptionInvoiceForTelegramUser']) {
  if (!monetizationStoreSource.includes(fragment)) {
    throw new Error(`Monetization store missing ${fragment}`);
  }
}

const composerSource = readFileSync(new URL('../src/bot/composers/monetizationComposer.js', import.meta.url), 'utf8');
for (const fragment of ['command(\'plans\'', 'plans:buy:pro', 'pre_checkout_query', 'message:successful_payment']) {
  if (!composerSource.includes(fragment)) {
    throw new Error(`Monetization composer missing ${fragment}`);
  }
}

const renderSource = readFileSync(new URL('../src/lib/telegram/render.js', import.meta.url), 'utf8');
for (const fragment of ['renderPricingText', 'renderPricingKeyboard', '⭐ Intro Deck Pro']) {
  if (!renderSource.includes(fragment)) {
    throw new Error(`Render pricing contract missing ${fragment}`);
  }
}

console.log('OK: pricing contract');
