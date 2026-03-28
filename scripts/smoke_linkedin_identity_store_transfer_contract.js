import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/lib/storage/linkedinIdentityStore.js', import.meta.url), 'utf8');

const required = [
  "transferMode = 'detect'",
  "reason: 'LINKEDIN_TRANSFER_REQUIRED'",
  "transferRequired: true",
  "transferMode !== 'confirm'",
  "hideProfileListingByUserId",
  "deleteLinkedInAccountByUserId",
  "transferred: true"
];

for (const token of required) {
  if (!source.includes(token)) {
    throw new Error(`Missing LinkedIn identity store transfer contract token: ${token}`);
  }
}

console.log('OK: linkedin identity store transfer contract');
