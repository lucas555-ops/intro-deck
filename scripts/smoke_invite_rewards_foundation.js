import { readFileSync, existsSync } from 'node:fs';

const migrationPath = new URL('../migrations/024_invite_rewards_foundation.sql', import.meta.url);
const inviteRepoPath = new URL('../src/db/inviteRepo.js', import.meta.url);
const inviteStorePath = new URL('../src/lib/storage/inviteStore.js', import.meta.url);
const linkedinStorePath = new URL('../src/lib/storage/linkedinIdentityStore.js', import.meta.url);
const profileEditStorePath = new URL('../src/lib/storage/profileEditStore.js', import.meta.url);
const currentStatePath = new URL('../doc/00_CURRENT_STATE.md', import.meta.url);
const specPath = new URL('../doc/spec/STEP052.3_INVITE_REWARDS_FOUNDATION.md', import.meta.url);

if (!existsSync(migrationPath)) {
  throw new Error('Missing STEP052.3 migration file');
}

const migration = readFileSync(migrationPath, 'utf8');
for (const token of [
  'create table if not exists invite_program_settings',
  'create table if not exists invite_reward_events',
  'create table if not exists invite_reward_ledger',
  'create table if not exists invite_reward_redemptions',
  'invite_rewards_mode',
  'activationPoints',
  'activationConfirmHours'
]) {
  if (!migration.includes(token)) {
    throw new Error(`Migration missing token: ${token}`);
  }
}

const inviteRepo = readFileSync(inviteRepoPath, 'utf8');
for (const token of [
  'ensureInviteRewardsDefaults',
  'getInviteRewardsMode',
  'getInviteRewardsConfig',
  'getInviteRewardActivationStateByInvitedUserId',
  'createPendingInviteActivationReward',
  'getInviteRewardSummaryByUserId',
  'listPendingInviteRewardConfirmationCandidates'
]) {
  if (!inviteRepo.includes(`export async function ${token}`)) {
    throw new Error(`Invite repo missing export: ${token}`);
  }
}

const inviteStore = readFileSync(inviteStorePath, 'utf8');
for (const token of [
  'maybeCreatePendingInviteRewardForActivationWithClient',
  'recordInviteRewardableActivationForUserId',
  'loadInviteRewardsSummaryState',
  "['earn_only', 'live'].includes(mode)",
  'the invited member connected LinkedIn and reached listed-ready state'
]) {
  if (!inviteStore.includes(token)) {
    throw new Error(`Invite store missing foundation token: ${token}`);
  }
}

const linkedinStore = readFileSync(linkedinStorePath, 'utf8');
if (!linkedinStore.includes('maybeCreatePendingInviteRewardForActivationWithClient')) {
  throw new Error('LinkedIn identity store is not wired to rewards foundation hook');
}

const profileEditStore = readFileSync(profileEditStorePath, 'utf8');
if (!profileEditStore.includes('inviteRewardResult')) {
  throw new Error('Profile edit store is not carrying inviteRewardResult through the activation paths');
}

const currentState = readFileSync(currentStatePath, 'utf8');
if (!currentState.includes('STEP052.3 — Invite Rewards Foundation')) {
  throw new Error('Current state doc must be updated to STEP052.3');
}

if (!existsSync(specPath)) {
  throw new Error('Missing STEP052.3 spec doc');
}
