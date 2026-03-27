import { renderIntroDetailText, renderIntroInboxText } from '../src/lib/telegram/render.js';

const archivedReceived = {
  intro_request_id: 51,
  profile_id: null,
  display_name: 'Archived Sender',
  headline_user: 'Former founder',
  linkedin_public_url: 'https://www.linkedin.com/in/archived-sender',
  status: 'accepted',
  created_at: '2026-03-26T09:00:00.000Z',
  updated_at: '2026-03-26T12:00:00.000Z',
  archived_snapshot_only: true,
  role: 'received'
};

const inboxText = renderIntroInboxText({
  persistenceEnabled: true,
  inboxState: {
    counts: { receivedPending: 0, receivedTotal: 1, sentPending: 0, sentTotal: 0 },
    received: [archivedReceived],
    sent: []
  }
});

if (!inboxText.includes('STEP020 baseline')) {
  throw new Error('Intro inbox text must state the STEP020 baseline');
}
if (!inboxText.includes('archived snapshot')) {
  throw new Error('Intro inbox text must describe archived snapshot rows');
}

const detailText = renderIntroDetailText({ persistenceEnabled: true, introRequest: archivedReceived });
if (!detailText.includes('archived snapshot preserved')) {
  throw new Error('Intro detail must preserve archived snapshot notice when live profile is gone');
}
if (!detailText.includes('History safety: live profile is gone')) {
  throw new Error('Intro detail must explain history safety fallback');
}

console.log('OK: intro retention / history safety baseline');
