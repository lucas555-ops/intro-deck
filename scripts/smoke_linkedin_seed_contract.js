import { strict as assert } from 'node:assert';
import {
  buildConnectedSummary,
  buildIdentityImportSummary,
  buildManualProfileFieldsReminder,
  pickLinkedInIdentityClaims
} from '../src/lib/linkedin/profile.js';

const identity = pickLinkedInIdentityClaims({
  idTokenClaims: {
    sub: 'linkedin-sub-1',
    name: 'Rustam Lukmanov',
    given_name: 'Rustam',
    family_name: 'Lukmanov',
    picture: 'https://example.com/pic.jpg',
    locale: { language: 'en', country: 'US' }
  },
  userInfo: {}
});

assert.equal(identity.linkedinSub, 'linkedin-sub-1');
assert.equal(identity.name, 'Rustam Lukmanov');
assert.equal(identity.givenName, 'Rustam');
assert.equal(identity.familyName, 'Lukmanov');
assert.equal(identity.pictureUrl, 'https://example.com/pic.jpg');
assert.equal(identity.locale, 'en_US');
assert.match(buildConnectedSummary(identity), /photo=imported/);
assert.match(buildIdentityImportSummary(identity), /name/);
assert.match(buildManualProfileFieldsReminder(), /Headline, company, city, industry, about, skills, and public LinkedIn URL/);

console.log('OK: linkedin identity auto-seed contract');
