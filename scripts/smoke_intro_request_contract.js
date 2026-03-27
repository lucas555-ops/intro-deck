import { renderHomeKeyboard, renderIntroInboxKeyboard, renderIntroInboxText } from '../src/lib/telegram/render.js';

const homeKeyboard = renderHomeKeyboard({
  appBaseUrl: 'https://example.com',
  telegramUserId: 123,
  persistenceEnabled: true,
  profileSnapshot: { linkedin_sub: 'abc123' }
});

if (!homeKeyboard.inline_keyboard.flat().some((button) => button.callback_data === 'intro:inbox')) {
  throw new Error('Home keyboard must expose intro inbox entrypoint for connected users');
}

const inboxText = renderIntroInboxText({
  persistenceEnabled: true,
  inboxState: {
    counts: { receivedPending: 2, receivedTotal: 3, sentPending: 1, sentTotal: 1 },
    received: [
      { display_name: 'Alice Founder', headline_user: 'Founder', status: 'pending', created_at: '2026-03-26T12:00:00.000Z' }
    ],
    sent: [
      { display_name: 'Bob Recruiter', headline_user: 'Recruiting lead', status: 'pending', created_at: '2026-03-26T13:00:00.000Z' }
    ]
  }
});

if (!inboxText.includes('STEP020 baseline')) {
  throw new Error('Intro inbox text must state the STEP020 baseline');
}
if (!inboxText.includes('Received: 2/3 pending/total')) {
  throw new Error('Intro inbox text must show received counters');
}
if (!inboxText.includes('Received pending actions:') || !inboxText.includes('Sent recent requests:')) {
  throw new Error('Intro inbox text must show received and sent sections');
}

const inboxKeyboard = renderIntroInboxKeyboard({
  inboxState: { received: [{ intro_request_id: 1 }], sent: [] }
});
if (!inboxKeyboard.inline_keyboard.flat().some((button) => button.callback_data === 'intro:inbox')) {
  throw new Error('Intro inbox keyboard must expose refresh callback');
}

console.log('OK: intro request persistence baseline');
