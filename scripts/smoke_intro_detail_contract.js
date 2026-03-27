import { renderIntroDetailKeyboard, renderIntroDetailText, renderIntroInboxKeyboard, renderIntroInboxText } from '../src/lib/telegram/render.js';

const receivedPending = {
  intro_request_id: 41,
  profile_id: 101,
  display_name: 'Alice Founder',
  headline_user: 'Founder',
  linkedin_public_url: 'https://www.linkedin.com/in/alice-founder',
  status: 'pending',
  created_at: '2026-03-26T12:00:00.000Z',
  updated_at: '2026-03-26T12:00:00.000Z',
  role: 'received'
};

const sentAccepted = {
  intro_request_id: 42,
  profile_id: 202,
  display_name: 'Dana Recruiter',
  headline_user: 'Recruiter',
  linkedin_public_url: 'https://www.linkedin.com/in/dana-recruiter',
  status: 'accepted',
  created_at: '2026-03-26T10:00:00.000Z',
  updated_at: '2026-03-26T13:00:00.000Z',
  role: 'sent'
};

const inboxText = renderIntroInboxText({
  persistenceEnabled: true,
  inboxState: {
    counts: { receivedPending: 1, receivedTotal: 1, sentPending: 0, sentTotal: 1 },
    received: [receivedPending],
    sent: [sentAccepted]
  }
});
if (!inboxText.includes('STEP020 baseline')) {
  throw new Error('Intro inbox text must state the STEP020 baseline');
}

const inboxKeyboard = renderIntroInboxKeyboard({
  inboxState: {
    counts: { receivedPending: 1, receivedTotal: 1, sentPending: 0, sentTotal: 1 },
    received: [receivedPending],
    sent: [sentAccepted]
  }
});
const inboxButtons = inboxKeyboard.inline_keyboard.flat();
if (!inboxButtons.some((button) => button.callback_data === 'intro:view:41')) {
  throw new Error('Inbox keyboard must expose detail view for received rows');
}
if (!inboxButtons.some((button) => button.callback_data === 'intro:view:42')) {
  throw new Error('Inbox keyboard must expose detail view for sent rows');
}

const receivedText = renderIntroDetailText({ persistenceEnabled: true, introRequest: receivedPending });
if (!receivedText.includes('Perspective: Received intro')) {
  throw new Error('Received detail must identify perspective');
}
if (!receivedText.includes('You can accept or decline this intro request.')) {
  throw new Error('Received pending detail must describe available decision path');
}

const receivedKeyboard = renderIntroDetailKeyboard({ introRequest: receivedPending });
const receivedButtons = receivedKeyboard.inline_keyboard.flat();
if (!receivedButtons.some((button) => button.callback_data === 'intro:acc:41')) {
  throw new Error('Received pending detail must expose accept action');
}
if (!receivedButtons.some((button) => button.callback_data === 'intro:dec:41')) {
  throw new Error('Received pending detail must expose decline action');
}
if (!receivedButtons.some((button) => button.url === 'https://www.linkedin.com/in/alice-founder')) {
  throw new Error('Received detail must expose sender LinkedIn URL when present');
}

const sentText = renderIntroDetailText({ persistenceEnabled: true, introRequest: sentAccepted });
if (!sentText.includes('Perspective: Sent intro')) {
  throw new Error('Sent detail must identify perspective');
}
if (!sentText.includes('Accepted. The recipient shared a LinkedIn URL')) {
  throw new Error('Sent accepted detail must describe unlocked contact');
}

const sentKeyboard = renderIntroDetailKeyboard({ introRequest: sentAccepted });
const sentButtons = sentKeyboard.inline_keyboard.flat();
if (!sentButtons.some((button) => button.url === 'https://www.linkedin.com/in/dana-recruiter')) {
  throw new Error('Sent accepted detail must expose unlocked contact URL');
}
if (sentButtons.some((button) => button.callback_data === 'intro:acc:42' || button.callback_data === 'intro:dec:42')) {
  throw new Error('Sent detail must not expose recipient-only decision actions');
}

console.log('OK: intro detail surfaces baseline');
