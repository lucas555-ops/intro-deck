import { readFileSync } from 'node:fs';
import { renderIntroInboxText, renderIntroNotificationKeyboard, renderIntroNotificationText } from '../src/lib/telegram/render.js';

const createdText = renderIntroNotificationText({
  eventType: 'intro_request_created',
  introRequest: {
    intro_request_id: 41,
    display_name: 'Alice Founder',
    headline_user: 'Founder at Example',
    status: 'pending',
    role: 'received'
  }
});
if (!createdText.includes('New intro request')) {
  throw new Error('Created notification text must mention new intro request');
}
if (!createdText.includes('Alice Founder')) {
  throw new Error('Created notification text must include member display name');
}

const acceptedText = renderIntroNotificationText({
  eventType: 'intro_request_accepted',
  introRequest: {
    intro_request_id: 42,
    display_name: 'Dana Recruiter',
    headline_user: 'Recruiter',
    status: 'accepted',
    role: 'sent'
  }
});
if (!acceptedText.includes('Intro accepted')) {
  throw new Error('Accepted notification text must mention accepted status');
}

const keyboard = renderIntroNotificationKeyboard({
  eventType: 'intro_request_created',
  introRequestId: 41
});
const buttons = keyboard.inline_keyboard.flat();
if (!buttons.some((button) => button.callback_data === 'intro:view:41')) {
  throw new Error('Notification keyboard must expose intro detail callback');
}
if (!buttons.some((button) => button.callback_data === 'intro:inbox')) {
  throw new Error('Created notification keyboard must expose inbox callback');
}

const inboxText = renderIntroInboxText({
  persistenceEnabled: true,
  inboxState: {
    counts: { receivedPending: 1, receivedTotal: 1, sentPending: 0, sentTotal: 1 },
    received: [],
    sent: []
  }
});
if (!inboxText.includes('STEP020 baseline')) {
  throw new Error('Intro inbox text must state the STEP020 baseline');
}

const notificationRepoSource = readFileSync(new URL('../src/db/notificationRepo.js', import.meta.url), 'utf8');
if (!notificationRepoSource.includes('notification_receipts')) {
  throw new Error('Notification repo must target notification_receipts table');
}
if (!notificationRepoSource.includes('claimNotificationReceipt')) {
  throw new Error('Notification repo must expose claimNotificationReceipt');
}

const notificationStoreSource = readFileSync(new URL('../src/lib/storage/notificationStore.js', import.meta.url), 'utf8');
if (!notificationStoreSource.includes('sendTelegramMessage')) {
  throw new Error('Notification store must deliver Telegram service messages');
}
if (!notificationStoreSource.includes('markNotificationReceiptStatus')) {
  throw new Error('Notification store must persist receipt delivery status');
}

const directoryComposerSource = readFileSync(new URL('../src/bot/composers/directoryComposer.js', import.meta.url), 'utf8');
if (!directoryComposerSource.includes("eventType: 'intro_request_created'")) {
  throw new Error('Directory composer must trigger intro_request_created receipts');
}

const introComposerSource = readFileSync(new URL('../src/bot/composers/introComposer.js', import.meta.url), 'utf8');
if (!introComposerSource.includes("eventType: 'intro_request_accepted'")) {
  throw new Error('Intro composer must trigger accepted receipts');
}
if (!introComposerSource.includes("eventType: 'intro_request_declined'")) {
  throw new Error('Intro composer must trigger declined receipts');
}

console.log('OK: notification / receipt layer baseline');
