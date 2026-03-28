import { readFileSync } from 'node:fs';
import { ADMIN_BROADCAST_AUDIENCES, ADMIN_INTRO_SEGMENTS, ADMIN_USER_SEGMENTS } from '../src/db/adminRepo.js';

for (const key of ['noprof', 'noskills', 'listact', 'listinact', 'nointro', 'relink']) {
  if (!ADMIN_USER_SEGMENTS[key]) {
    throw new Error(`Missing refined admin user segment: ${key}`);
  }
}

for (const key of ['p24', 'p72', 'arec', 'drec', 'dprob']) {
  if (!ADMIN_INTRO_SEGMENTS[key]) {
    throw new Error(`Missing refined admin intro segment: ${key}`);
  }
}

for (const key of ['LISTED_INACTIVE', 'CONNECTED_NO_PROFILE', 'COMPLETE_NO_SKILLS', 'RECENT_PENDING_INTROS']) {
  if (!ADMIN_BROADCAST_AUDIENCES[key]) {
    throw new Error(`Missing refined broadcast audience: ${key}`);
  }
}

const repoSource = readFileSync(new URL('../src/db/adminRepo.js', import.meta.url), 'utf8');
for (const needle of [
  "case 'noprof'",
  "case 'noskills'",
  "case 'listact'",
  "case 'listinact'",
  "case 'nointro'",
  "case 'relink'",
  "case 'p24'",
  "case 'p72'",
  "case 'arec'",
  "case 'drec'",
  "case 'dprob'",
  "case 'LISTED_INACTIVE'",
  "case 'CONNECTED_NO_PROFILE'",
  "case 'COMPLETE_NO_SKILLS'",
  "case 'RECENT_PENDING_INTROS'"
]) {
  if (!repoSource.includes(needle)) {
    throw new Error(`Admin repo missing segmentation clause: ${needle}`);
  }
}

console.log('OK: admin segmentation contract');
