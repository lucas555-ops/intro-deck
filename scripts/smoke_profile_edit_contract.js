import { computeProfileCompletion, normalizeProfileFieldValue, getProfileFieldMeta } from '../src/lib/profile/contract.js';

const meta = getProfileFieldMeta('hl');
if (!meta || meta.label !== 'Headline') {
  throw new Error('Headline field metadata missing');
}

const normalized = normalizeProfileFieldValue('hl', '  Founder   |   Partnerships  ');
if (normalized !== 'Founder | Partnerships') {
  throw new Error('normalizeProfileFieldValue must collapse repeated spaces for single-line fields');
}

const about = normalizeProfileFieldValue('ab', ' Line one\n\n\nLine two ');
if (!about.includes('Line one') || about.includes('\n\n\n')) {
  throw new Error('normalizeProfileFieldValue must normalize multiline fields');
}

const notReady = computeProfileCompletion({
  linkedin_sub: 'linkedin-sub-1',
  display_name: 'Rustam',
  headline_user: 'Founder',
  company_user: 'Collabka PR',
  city_user: 'Miami',
  industry_user: 'Creator economy',
  about_user: 'I build Telegram-first products.',
  skills: []
});

if (notReady.isReady) {
  throw new Error('computeProfileCompletion must require at least one skill for readiness');
}

const completion = computeProfileCompletion({
  linkedin_sub: 'linkedin-sub-1',
  display_name: 'Rustam',
  headline_user: 'Founder',
  company_user: 'Collabka PR',
  city_user: 'Miami',
  industry_user: 'Creator economy',
  about_user: 'I build Telegram-first products.',
  skills: [{ skill_slug: 'founder', skill_label: 'Founder' }]
});

if (!completion.isReady) {
  throw new Error('computeProfileCompletion must mark profile ready when all required fields and at least one skill are present');
}
if (!completion.hasRequiredSkills || completion.skillsCount !== 1) {
  throw new Error('skill counters must be exposed in completion metadata');
}

console.log('OK: profile edit contract baseline');
