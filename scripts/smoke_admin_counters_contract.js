import { readFileSync } from 'node:fs';
import { loadAdminDashboardSummary, loadAdminCommunicationsState } from '../src/lib/storage/adminStore.js';

const storeSource = readFileSync(new URL('../src/lib/storage/adminStore.js', import.meta.url), 'utf8');
for (const fragment of ['export async function loadAdminDashboardSummary()', 'getAdminDashboardSummary(client)', 'latestBroadcastStatus', 'recentDirectMessages', 'recentOutboxFailures']) {
  if (!storeSource.includes(fragment)) {
    throw new Error(`Admin store missing dashboard summary fragment: ${fragment}`);
  }
}

const repoSource = readFileSync(new URL('../src/db/adminRepo.js', import.meta.url), 'utf8');
if (!repoSource.includes('export async function getAdminDashboardSummary(client)')) {
  throw new Error('Admin repo must expose getAdminDashboardSummary');
}
for (const fragment of ['failed_deliveries', 'recent_direct_messages', 'recent_outbox_failures', 'recent_audit_events']) {
  if (!repoSource.includes(fragment)) {
    throw new Error(`Admin dashboard summary query missing: ${fragment}`);
  }
}

const operatorComposerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
if (!operatorComposerSource.includes('loadAdminDashboardSummary')) {
  throw new Error('Operator composer must load dashboard summary for polished hubs');
}
for (const fragment of ['buildAdminHomeSurface({ summary: dashboard?.summary?.home || null })', 'buildAdminOperationsSurface({ summary: dashboard?.summary?.operations || null })', 'buildAdminSystemSurface({ summary: dashboard?.summary?.system || null })']) {
  if (!operatorComposerSource.includes(fragment)) {
    throw new Error(`Operator composer missing summary wiring: ${fragment}`);
  }
}

const createBotSource = readFileSync(new URL('../src/bot/createBot.js', import.meta.url), 'utf8');
if (!createBotSource.includes('buildAdminBroadcastFailuresSurface: adminSurfaces.buildAdminBroadcastFailuresSurface')) {
  throw new Error('Bot factory must wire buildAdminBroadcastFailuresSurface');
}

console.log('OK: admin counters contract');
