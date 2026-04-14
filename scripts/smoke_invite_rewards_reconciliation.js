import { readFileSync } from 'node:fs';

const inviteRepoPath = new URL('../src/db/inviteRepo.js', import.meta.url);
const adminSurfacePath = new URL('../src/bot/surfaces/adminSurfaces.js', import.meta.url);

const inviteRepo = readFileSync(inviteRepoPath, 'utf8');
for (const token of ['getInviteRewardReconciliationSnapshot', 'listInviteRewardLedgerMismatches', 'completed_missing_subscription']) {
  if (!inviteRepo.includes(token)) {
    throw new Error(`Invite repo missing reconciliation token: ${token}`);
  }
}

const adminSurface = readFileSync(adminSurfacePath, 'utf8');
for (const token of ['Reconciliation:', 'Warnings:', 'adm:invite:settlement:reconcile']) {
  if (!adminSurface.includes(token)) {
    throw new Error(`Admin invite surface missing reconciliation token: ${token}`);
  }
}
