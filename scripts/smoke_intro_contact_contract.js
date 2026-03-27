import { renderIntroInboxKeyboard, renderIntroInboxText } from '../src/lib/telegram/render.js';

const inboxState = {
  counts: { receivedPending: 1, receivedTotal: 2, sentPending: 0, sentTotal: 2 },
  received: [
    {
      intro_request_id: 41,
      profile_id: 101,
      display_name: 'Alice Founder',
      headline_user: 'Founder',
      linkedin_public_url: 'https://www.linkedin.com/in/alice-founder',
      status: 'pending',
      created_at: '2026-03-26T12:00:00.000Z',
      updated_at: '2026-03-26T13:00:00.000Z',
      role: 'received'
    },
    {
      intro_request_id: 42,
      profile_id: 102,
      display_name: 'Bob Operator',
      headline_user: 'Ops',
      linkedin_public_url: null,
      status: 'declined',
      created_at: '2026-03-26T10:00:00.000Z',
      updated_at: '2026-03-26T11:00:00.000Z',
      role: 'received'
    }
  ],
  sent: [
    {
      intro_request_id: 44,
      profile_id: 201,
      display_name: 'Dana Recruiter',
      headline_user: 'Recruiter',
      linkedin_public_url: 'https://www.linkedin.com/in/dana-recruiter',
      status: 'accepted',
      created_at: '2026-03-26T09:00:00.000Z',
      updated_at: '2026-03-26T12:30:00.000Z',
      role: 'sent'
    },
    {
      intro_request_id: 45,
      profile_id: 202,
      display_name: 'Evan Seller',
      headline_user: 'Sales',
      linkedin_public_url: null,
      status: 'accepted',
      created_at: '2026-03-26T09:00:00.000Z',
      updated_at: '2026-03-26T12:30:00.000Z',
      role: 'sent'
    }
  ]
};

const text = renderIntroInboxText({ persistenceEnabled: true, inboxState });
if (!text.includes('STEP020 baseline')) {
  throw new Error('Intro inbox text must state the STEP020 baseline');
}
if (!text.includes('contact unlocked')) {
  throw new Error('Accepted sent rows with a URL must describe unlocked contact');
}
if (!text.includes('sender link available for review')) {
  throw new Error('Received pending rows must describe sender review-link availability');
}

const keyboard = renderIntroInboxKeyboard({ inboxState });
const flattened = keyboard.inline_keyboard.flat();
if (!flattened.some((button) => button.url === 'https://www.linkedin.com/in/alice-founder')) {
  throw new Error('Received rows must expose sender LinkedIn review link when present');
}
if (!flattened.some((button) => button.url === 'https://www.linkedin.com/in/dana-recruiter')) {
  throw new Error('Accepted sent rows must expose unlocked target contact when present');
}
if (flattened.some((button) => button.url === null)) {
  throw new Error('Keyboard must not contain empty URL buttons');
}

console.log('OK: intro contact contract baseline');
