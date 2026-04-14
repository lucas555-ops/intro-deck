import { readFileSync, existsSync } from 'node:fs';

const migrationPath = new URL('../migrations/026_invite_rewards_settlement_hardening.sql', import.meta.url);
const inviteRepoPath = new URL('../src/db/inviteRepo.js', import.meta.url);
const inviteStorePath = new URL('../src/lib/storage/inviteStore.js', import.meta.url);
const operatorComposerPath = new URL('../src/bot/composers/operatorComposer.js', import.meta.url);

if (!existsSync(migrationPath)) {
  throw new Error('Missing STEP052.6 settlement migration');
}

const migration = readFileSync(migrationPath, 'utf8');
for (const token of ['invite_reward_settlement_runs', 'settled_at', 'settlement_run_id', 'source_available_entry_id']) {
  if (!migration.includes(token)) {
    throw new Error(`STEP052.6 migration missing token: ${token}`);
  }
}

const inviteRepo = readFileSync(inviteRepoPath, 'utf8');
for (const token of ['confirmInviteRewardEventToAvailable', 'rejectInviteRewardEvent', 'createInviteRewardSettlementRun', 'finalizeInviteRewardSettlementRun']) {
  if (!inviteRepo.includes(`export async function ${token}`)) {
    throw new Error(`Invite repo missing STEP052.6 export: ${token}`);
  }
}

const inviteStore = readFileSync(inviteStorePath, 'utf8');
for (const token of ['settlePendingInviteRewardsBatch', 'settlement_blocked_in_paused', 'invite_rewards_settlement_completed']) {
  if (!inviteStore.includes(token)) {
    throw new Error(`Invite store missing STEP052.6 settlement token: ${token}`);
  }
}

const operatorComposer = readFileSync(operatorComposerPath, 'utf8');
for (const token of ['adm:invite:settlement:run', 'settlePendingInviteRewardsBatch']) {
  if (!operatorComposer.includes(token)) {
    throw new Error(`Operator composer missing STEP052.6 settlement token: ${token}`);
  }
}
