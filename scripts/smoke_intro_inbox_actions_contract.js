import { renderIntroInboxKeyboard, renderIntroInboxText } from '../src/lib/telegram/render.js';

const inboxState = {
  counts: { receivedPending: 1, receivedTotal: 1, sentPending: 1, sentTotal: 1 },
  received: [
    { intro_request_id: 11, profile_id: 101, display_name: 'Alice Founder', headline_user: 'Founder', linkedin_public_url: 'https://www.linkedin.com/in/alice-founder', status: 'pending', created_at: '2026-03-26T12:00:00.000Z', role: 'received' },
    { intro_request_id: 13, profile_id: 103, display_name: 'Cara Builder', headline_user: 'Builder', status: 'accepted', created_at: '2026-03-26T11:00:00.000Z', updated_at: '2026-03-26T14:00:00.000Z', role: 'received' }
  ],
  sent: [
    { intro_request_id: 12, profile_id: 202, display_name: 'Bob Operator', headline_user: 'Ops', linkedin_public_url: null, status: 'pending', created_at: '2026-03-26T13:00:00.000Z', role: 'sent' }
  ]
};

const text = renderIntroInboxText({ persistenceEnabled: true, inboxState });
if (!text.includes('STEP020 baseline')) {
  throw new Error('Intro inbox text must state the STEP020 baseline');
}
if (!text.includes('Received pending actions:') || !text.includes('Sent recent requests:')) {
  throw new Error('Intro inbox text must expose received and sent row sections');
}
if (!text.includes('Received recent decisions:')) {
  throw new Error('Intro inbox text must expose processed received rows once decisions exist');
}

const keyboard = renderIntroInboxKeyboard({ inboxState });
const flattened = keyboard.inline_keyboard.flat();
if (!flattened.some((button) => button.callback_data === 'intro:open:101')) {
  throw new Error('Intro inbox keyboard must allow opening requester profile from received row');
}
if (!flattened.some((button) => button.callback_data === 'intro:acc:11')) {
  throw new Error('Intro inbox keyboard must expose accept placeholder callback');
}
if (!flattened.some((button) => button.callback_data === 'intro:dec:11')) {
  throw new Error('Intro inbox keyboard must expose decline placeholder callback');
}
if (!flattened.some((button) => button.callback_data === 'intro:open:202')) {
  throw new Error('Intro inbox keyboard must allow opening target profile from sent row');
}

if (!flattened.some((button) => button.url === 'https://www.linkedin.com/in/alice-founder')) {
  throw new Error('Received rows with a sender URL must expose review-link button');
}
if (flattened.some((button) => button.callback_data === 'intro:acc:12' || button.callback_data === 'intro:dec:12')) {
  throw new Error('Sent rows must not expose accept/decline actions');
}

console.log('OK: intro inbox actions baseline');
