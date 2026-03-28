import { readFileSync } from 'node:fs';
import { createAdminSurfaceBuilders } from '../src/bot/surfaces/adminSurfaces.js';

const surfaces = createAdminSurfaceBuilders({ currentStep: 'STEP035' });

const home = await surfaces.buildAdminHomeSurface({
  summary: {
    totalUsers: 128,
    listedUsers: 42,
    pendingIntros: 7,
    failedDeliveries: 3,
    activeNotice: true,
    latestBroadcastStatus: 'sent_with_failures'
  }
});
for (const fragment of ['Users: 128', 'Listed: 42', 'Pending intros: 7', 'Failed deliveries: 3', 'Notice: active', 'Broadcast: sent with failures']) {
  if (!home.text.includes(fragment)) {
    throw new Error(`Admin home missing polished counter fragment: ${fragment}`);
  }
}

const ops = await surfaces.buildAdminOperationsSurface({
  summary: {
    totalUsers: 128,
    readyNotListed: 11,
    listedIncomplete: 2,
    pendingIntros: 7,
    staleIntros: 1,
    deliveryIssues: 4
  }
});
for (const fragment of ['Users: 128', 'Ready not listed: 11', 'Listed incomplete: 2', 'Delivery issues: 4']) {
  if (!ops.text.includes(fragment)) {
    throw new Error(`Operations hub missing summary fragment: ${fragment}`);
  }
}

const comms = await surfaces.buildAdminCommunicationsSurface({
  state: {
    notice: { isActive: true, audienceKey: 'READY_NOT_LISTED' },
    broadcastDraft: { body: 'Ship it' },
    latestBroadcastStatus: 'sending',
    recentDirectMessages: 5,
    recentOutboxFailures: 1,
    outboxCount: 9
  }
});
for (const fragment of ['Latest broadcast: sending', 'Recent direct sends: 5', 'Recent outbox failures: 1', 'Outbox records: 9']) {
  if (!comms.text.includes(fragment)) {
    throw new Error(`Communications hub missing polished summary fragment: ${fragment}`);
  }
}

const source = readFileSync(new URL('../src/bot/surfaces/adminSurfaces.js', import.meta.url), 'utf8');
for (const fragment of ['No users match this segment right now.', 'No profiles match this quality bucket right now.', 'No audit events for this segment yet.']) {
  if (!source.includes(fragment)) {
    throw new Error(`Admin surfaces missing polish empty-state copy: ${fragment}`);
  }
}

console.log('OK: admin polish contract');
