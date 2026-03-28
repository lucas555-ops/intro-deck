import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const repoSource = readFileSync(new URL('../src/db/adminRepo.js', import.meta.url), 'utf8');
for (const fragment of [
  'new_users_24h',
  'connected_7d',
  'intros_24h',
  'broadcast_delivered_7d',
  'operator_actions_24h'
]) {
  if (!repoSource.includes(fragment)) {
    throw new Error(`Admin trends query missing fragment: ${fragment}`);
  }
}

const storeSource = readFileSync(new URL('../src/lib/storage/adminStore.js', import.meta.url), 'utf8');
for (const fragment of [
  'directMessages24h',
  'broadcastDeliveredRecipients7d',
  'operatorActions24h'
]) {
  if (!storeSource.includes(fragment)) {
    throw new Error(`Admin store missing trends fragment: ${fragment}`);
  }
}

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP037' });

const home = await surfaces.buildAdminHomeSurface({
  summary: {
    totalUsers: 120,
    listedUsers: 44,
    pendingIntros: 8,
    failedDeliveries: 2,
    activeNotice: true,
    latestBroadcastStatus: 'sent',
    newUsers24h: 6,
    newUsers7d: 19,
    connected24h: 4,
    connected7d: 11,
    listed24h: 2,
    listed7d: 7,
    intros24h: 9,
    intros7d: 31,
    accepted7d: 5,
    declined7d: 2,
    pendingOlder24h: 3,
    failures24h: 1,
    failures7d: 4,
    broadcasts7d: 2,
    directMessages7d: 7
  }
});
for (const fragment of [
  'Trends:',
  'Users +6/24h • +19/7d',
  'Connected +4/24h • +11/7d',
  'Broadcasts 2/7d • Direct 7/7d'
]) {
  if (!home.text.includes(fragment)) {
    throw new Error(`Admin home missing trend fragment: ${fragment}`);
  }
}

const comms = await surfaces.buildAdminCommunicationsSurface({
  state: {
    notice: { isActive: true, audienceKey: 'ALL' },
    broadcastDraft: { body: 'Ready' },
    latestBroadcastStatus: 'sent_with_failures',
    recentDirectMessages: 3,
    recentOutboxFailures: 1,
    outboxCount: 14,
    directMessages24h: 1,
    directMessages7d: 6,
    broadcasts7d: 2,
    broadcastDeliveredRecipients7d: 18,
    broadcastFailedRecipients7d: 2,
    outboxFailures24h: 1,
    outboxFailures7d: 3,
    latestBroadcastRecipients: 12,
    latestBroadcastDelivered: 10,
    latestBroadcastFailed: 2
  }
});
for (const fragment of [
  'Comms trends:',
  'Broadcasts: 2/7d',
  'Broadcast delivery: 18 ok • 2 failed',
  'Direct messages: 1/24h • 6/7d'
]) {
  if (!comms.text.includes(fragment)) {
    throw new Error(`Communications hub missing trend fragment: ${fragment}`);
  }
}

const system = await surfaces.buildAdminSystemSurface({
  summary: {
    retryDue: 2,
    exhausted: 1,
    failedDeliveries: 3,
    recentAuditEvents: 12,
    failures24h: 1,
    failures7d: 4,
    delivered24h: 9,
    delivered7d: 32,
    operatorActions24h: 5,
    operatorActions7d: 15,
    listingChanges7d: 4,
    relinks7d: 1
  }
});
for (const fragment of [
  'Runtime trends:',
  'Failures 1/24h • 4/7d',
  'Operator actions 5/24h • 15/7d',
  'Listing changes 4/7d • relinks 1/7d'
]) {
  if (!system.text.includes(fragment)) {
    throw new Error(`System hub missing trend fragment: ${fragment}`);
  }
}

console.log('OK: admin trends contract');
