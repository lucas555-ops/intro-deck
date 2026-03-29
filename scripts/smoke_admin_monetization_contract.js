import { readFileSync } from 'node:fs';

const repoSource = readFileSync(new URL('../src/db/monetizationRepo.js', import.meta.url), 'utf8');
for (const fragment of ['getAdminMonetizationSummary', 'purchase_receipts', 'member_subscriptions', 'contact_unlock_requests', 'member_dm_threads']) {
  if (!repoSource.includes(fragment)) {
    throw new Error(`Monetization repo missing ${fragment}`);
  }
}

const storeSource = readFileSync(new URL('../src/lib/storage/adminStore.js', import.meta.url), 'utf8');
for (const fragment of ['loadAdminMonetizationState', 'getAdminMonetizationSummary', 'listRecentPurchaseReceipts']) {
  if (!storeSource.includes(fragment)) {
    throw new Error(`Admin monetization store missing ${fragment}`);
  }
}

const surfaceSource = readFileSync(new URL('../src/bot/surfaces/adminSurfaces.js', import.meta.url), 'utf8');
for (const fragment of ['buildAdminMonetizationText', 'buildAdminMonetizationKeyboard', 'buildAdminMonetizationSurface', '💳 Монетизация']) {
  if (!surfaceSource.includes(fragment)) {
    throw new Error(`Admin monetization surface missing ${fragment}`);
  }
}

const operatorSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
for (const fragment of ['loadAdminMonetizationState', 'buildAdminMonetizationSurface', "'adm:money'", "'money'"]) {
  if (!operatorSource.includes(fragment)) {
    throw new Error(`Operator monetization wiring missing ${fragment}`);
  }
}

console.log('OK: admin monetization contract');
