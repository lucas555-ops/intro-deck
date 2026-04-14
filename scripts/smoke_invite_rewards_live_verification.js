import { readFileSync, existsSync } from 'node:fs';

const currentStatePath = new URL('../doc/00_CURRENT_STATE.md', import.meta.url);
const checklistPath = new URL('../doc/76A_INVITE_REWARDS_LIVE_VERIFICATION_CHECKLIST.md', import.meta.url);
const inviteStorePath = new URL('../src/lib/storage/inviteStore.js', import.meta.url);

if (!existsSync(checklistPath)) {
  throw new Error('Missing live verification checklist doc for STEP052.6');
}

const currentState = readFileSync(currentStatePath, 'utf8');
if (!currentState.includes('STEP052.6 — Invite Rewards Settlement + Live Verification Hardening')) {
  throw new Error('Current state doc not updated to STEP052.6');
}

const inviteStore = readFileSync(inviteStorePath, 'utf8');
for (const token of ['loadFounderInviteRewardsLiveVerificationState', 'loadInviteRewardsReconciliationState', 'invite_rewards_live_verification_loaded']) {
  if (!inviteStore.includes(token)) {
    throw new Error(`Invite store missing live verification token: ${token}`);
  }
}
