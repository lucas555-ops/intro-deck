import { renderIntroInboxKeyboard, renderIntroInboxText } from '../src/lib/telegram/render.js';

const inboxState = {
  counts: { receivedPending: 0, receivedTotal: 2, sentPending: 0, sentTotal: 1 },
  received: [
    { intro_request_id: 41, profile_id: 101, display_name: 'Alice Founder', headline_user: 'Founder', status: 'accepted', created_at: '2026-03-26T12:00:00.000Z', updated_at: '2026-03-26T13:00:00.000Z', role: 'received' },
    { intro_request_id: 42, profile_id: 102, display_name: 'Bob Operator', headline_user: 'Ops', status: 'declined', created_at: '2026-03-26T10:00:00.000Z', updated_at: '2026-03-26T11:00:00.000Z', role: 'received' }
  ],
  sent: [
    { intro_request_id: 44, profile_id: 201, display_name: 'Dana Recruiter', headline_user: 'Recruiter', status: 'accepted', created_at: '2026-03-26T09:00:00.000Z', updated_at: '2026-03-26T12:30:00.000Z', role: 'sent' }
  ]
};

const text = renderIntroInboxText({ persistenceEnabled: true, inboxState });
if (!text.includes('STEP020 baseline')) {
  throw new Error('Intro inbox text must state the STEP020 baseline');
}
if (!text.includes('Received recent decisions:')) {
  throw new Error('Intro inbox text must expose processed decision rows');
}
if (!text.includes('accepted') || !text.includes('declined')) {
  throw new Error('Intro inbox text must show accepted and declined states');
}

const keyboard = renderIntroInboxKeyboard({ inboxState });
const flattened = keyboard.inline_keyboard.flat();
if (flattened.some((button) => button.callback_data === 'intro:acc:41' || button.callback_data === 'intro:dec:41')) {
  throw new Error('Processed received rows must not expose accept/decline actions');
}
if (!flattened.some((button) => button.callback_data === 'intro:open:101')) {
  throw new Error('Processed received rows must still allow opening related profile');
}

console.log('OK: intro decision persistence baseline');
