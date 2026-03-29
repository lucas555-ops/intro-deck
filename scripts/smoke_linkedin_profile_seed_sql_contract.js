import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const profileRepoSource = readFileSync(new URL('../src/db/profileRepo.js', import.meta.url), 'utf8');
const identityStoreSource = readFileSync(new URL('../src/lib/storage/linkedinIdentityStore.js', import.meta.url), 'utf8');

assert.match(profileRepoSource, /nullif\(btrim\(member_profiles\.display_name\), ''\) is null then excluded\.display_name/);
assert.match(identityStoreSource, /profileSeed/);
assert.match(identityStoreSource, /displayNameSeeded/);
assert.match(identityStoreSource, /identityImportedFields/);

console.log('OK: linkedin profile seed SQL contract');
