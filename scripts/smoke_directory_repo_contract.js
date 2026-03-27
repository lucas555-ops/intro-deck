import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const profileRepoPath = path.join(repoRoot, 'src', 'db', 'profileRepo.js');
const directoryRepoPath = path.join(repoRoot, 'src', 'db', 'directoryRepo.js');
const directoryStorePath = path.join(repoRoot, 'src', 'lib', 'storage', 'directoryStore.js');

const profileSource = fs.readFileSync(profileRepoPath, 'utf8');
const directorySource = fs.readFileSync(directoryRepoPath, 'utf8');
const storeSource = fs.readFileSync(directoryStorePath, 'utf8');

if (!fs.existsSync(directoryRepoPath)) {
  throw new Error('directoryRepo.js missing after STEP019');
}

if (!directorySource.includes('export async function listListedProfilesPage')) {
  throw new Error('directoryRepo.js must own listListedProfilesPage');
}

if (!directorySource.includes('export async function getListedProfileCardById')) {
  throw new Error('directoryRepo.js must own getListedProfileCardById');
}

if (profileSource.includes('export async function listListedProfilesPage')) {
  throw new Error('profileRepo.js should no longer own listListedProfilesPage');
}

if (profileSource.includes('export async function getListedProfileCardById')) {
  throw new Error('profileRepo.js should no longer own getListedProfileCardById');
}

if (!storeSource.includes("../../db/directoryRepo.js")) {
  throw new Error('directoryStore must import from directoryRepo.js');
}

console.log('OK: directoryRepo extraction baseline');
