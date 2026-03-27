import { DIRECTORY_SKILLS, getSkillMeta, normalizeSkills } from '../src/lib/profile/contract.js';

if (DIRECTORY_SKILLS.length < 6) {
  throw new Error('Expected curated skills catalog for directory selection');
}

const founder = getSkillMeta('founder');
if (!founder || founder.label !== 'Founder') {
  throw new Error('getSkillMeta must resolve curated skill metadata');
}

const normalized = normalizeSkills([
  { skill_slug: 'crypto', skill_label: 'ignored' },
  { skill_slug: 'founder', skill_label: 'ignored' },
  { skill_slug: 'unknown', skill_label: 'Unknown' }
]);

if (normalized.length !== 2) {
  throw new Error('normalizeSkills must filter unknown skills');
}
if (normalized[0].skill_label !== 'Crypto' && normalized[1].skill_label !== 'Founder') {
  throw new Error('normalizeSkills must preserve curated labels');
}

console.log('OK: skills selection contract baseline');
