import { readFileSync } from 'node:fs';
import {
  renderHelpKeyboard,
  renderHomeKeyboard,
  renderInviteCardKeyboard,
  buildInlineInviteResult,
  renderInviteKeyboard,
  renderInviteHistoryKeyboard,
  renderInviteHistoryText,
  renderInviteLinkText,
  renderInvitePerformanceKeyboard,
  renderInvitePerformanceText,
  renderInviteText,
  renderInlineInviteCaption,
  renderInlineInviteShareText
} from '../src/lib/telegram/render.js';
import { buildInviteCodeFromTelegramUserId, buildInviteLink, buildInviteStartParam, parseInviteStartParam } from '../src/db/inviteRepo.js';

const inviteComposerSource = readFileSync(new URL('../src/bot/composers/inviteComposer.js', import.meta.url), 'utf8');
const createBotSource = readFileSync(new URL('../src/bot/createBot.js', import.meta.url), 'utf8');
const appSurfacesSource = readFileSync(new URL('../src/bot/surfaces/appSurfaces.js', import.meta.url), 'utf8');
const adminSurfacesSource = readFileSync(new URL('../src/bot/surfaces/adminSurfaces.js', import.meta.url), 'utf8');
const operatorComposerSource = readFileSync(new URL('../src/bot/composers/operatorComposer.js', import.meta.url), 'utf8');
const renderSource = readFileSync(new URL('../src/lib/telegram/render.js', import.meta.url), 'utf8');

if (!inviteComposerSource.includes("composer.command('invite'")) {
  throw new Error('Missing /invite command handler');
}

if (!inviteComposerSource.includes("composer.callbackQuery('invite:root'")) {
  throw new Error('Invite surface root callback is missing');
}


if (!inviteComposerSource.includes("composer.callbackQuery('invite:perf'")) {
  throw new Error('Invite performance callback is missing');
}

if (!inviteComposerSource.includes('composer.callbackQuery(/^invite:hist:')) {
  throw new Error('Invite history callback is missing');
}

if (!inviteComposerSource.includes('composer.inlineQuery(')) {
  throw new Error('Invite inline query handler is missing');
}

if (!createBotSource.includes('createInviteComposer')) {
  throw new Error('Invite composer is not wired into createBot');
}

for (const token of ['buildInvitePerformanceSurface', 'buildInviteHistorySurface']) {
  if (!createBotSource.includes(token)) {
    throw new Error(`Missing invite module builder wiring: ${token}`);
  }
}

if (!operatorComposerSource.includes("composer.callbackQuery('adm:invite'")) {
  throw new Error('Admin invite callback is missing');
}

if (!adminSurfacesSource.includes('📨 Инвайты')) {
  throw new Error('Admin operations surface must expose invite entrypoint');
}

if (!renderSource.includes('photo_file_id') || !renderSource.includes('thumbnail_url')) {
  throw new Error('Invite inline result must support photo-card share paths');
}

if (!appSurfacesSource.includes('intro-deck-og-1200x630.jpg')) {
  throw new Error('Invite surfaces must point to the JPEG OG asset');
}

const inviteCode = buildInviteCodeFromTelegramUserId(123456789);
if (!inviteCode) {
  throw new Error('Invite code must be generated from telegram user id');
}

const rawStart = buildInviteStartParam({ inviteCode, source: 'raw_link' });
const inlineStart = buildInviteStartParam({ inviteCode, source: 'inline_share' });
const cardStart = buildInviteStartParam({ inviteCode, source: 'invite_card' });
if (!rawStart?.startsWith('il_') || !inlineStart?.startsWith('ii_') || !cardStart?.startsWith('ic_')) {
  throw new Error('Invite start-param prefixes must differentiate source paths');
}

const parsed = parseInviteStartParam(inlineStart);
if (!parsed || parsed.source !== 'inline_share' || String(parsed.referrerTelegramUserId) !== '123456789') {
  throw new Error('Invite start-param parsing must recover source and telegram user id');
}

const inviteUrl = buildInviteLink({ botUsername: 'introdeckbot', inviteCode, source: 'raw_link' });
if (!inviteUrl?.includes('?start=il_')) {
  throw new Error('Invite link must encode raw-link start param');
}

const inviteText = renderInviteText({
  inviteState: {
    persistenceEnabled: true,
    inviteCode,
    inviteLink: inviteUrl,
    inlineInviteLink: buildInviteLink({ botUsername: 'introdeckbot', inviteCode, source: 'inline_share' }),
    inviteCardLink: buildInviteLink({ botUsername: 'introdeckbot', inviteCode, source: 'invite_card' }),
    invitedCount: 2,
    activatedCount: 1,
    invited: [{ displayName: 'Alice', headlineUser: 'Founder', joinedAt: '2026-04-10T10:00:00Z', source: 'inline_share', status: 'activated' }]
  }
});
if (!inviteText.includes('Snapshot') || !inviteText.includes('Next step')) {
  throw new Error('Invite root text must include snapshot and next-step guidance');
}

const inviteKeyboard = JSON.stringify(renderInviteKeyboard({ inviteState: { persistenceEnabled: true, inviteLink: inviteUrl, shareInlineQuery: 'invite' } }).inline_keyboard);
for (const token of ['switch_inline_query', 'invite:show_link', 'invite:send_card', 'invite:perf', 'invite:hist:1', 'invite:root']) {
  if (!inviteKeyboard.includes(token)) {
    throw new Error(`Invite keyboard missing ${token}`);
  }
}


const perfText = renderInvitePerformanceText({
  inviteState: {
    inviteCode,
    invitedCount: 2,
    activatedCount: 1,
    activationHint: 'connected LinkedIn or started a profile',
    invited: [{ displayName: 'Alice', headlineUser: 'Founder', joinedAt: '2026-04-10T10:00:00Z', source: 'inline_share', status: 'activated' }],
    hasMoreInvites: true
  }
});
if (!perfText.includes('Activation rate') || !perfText.includes('By source') || !perfText.includes('Last 7 days')) {
  throw new Error('Invite performance text must expose source mix and recent quality');
}

const perfKeyboard = JSON.stringify(renderInvitePerformanceKeyboard({ inviteState: { invitedCount: 0 } }).inline_keyboard);
if (!perfKeyboard.includes('invite:hist:1') || !perfKeyboard.includes('invite:root')) {
  throw new Error('Invite performance keyboard must always link back to root and history');
}

const historyText = renderInviteHistoryText({
  inviteState: { invitedCount: 2, activatedCount: 1 },
  historyState: {
    totalCount: 2,
    page: 1,
    totalPages: 1,
    startIndex: 0,
    endIndex: 2,
    items: [{ displayName: 'Alice', headlineUser: 'Founder', joinedAt: '2026-04-10T10:00:00Z', source: 'inline_share', status: 'activated' }]
  }
});
if (!historyText.includes('History window') || !historyText.includes('Contacts')) {
  throw new Error('Invite history text must expose a paged history window');
}

const emptyHistoryText = renderInviteHistoryText({
  inviteState: { invitedCount: 0, activatedCount: 0, shareInlineQuery: 'invite' },
  historyState: { totalCount: 0, page: 1, totalPages: 1, startIndex: 0, endIndex: 0, items: [] }
});
if (!emptyHistoryText.includes('No invited contacts yet.') || !emptyHistoryText.includes('Share invite')) {
  throw new Error('Invite history must expose a product empty-state when no invited contacts exist');
}

const historyKeyboard = JSON.stringify(renderInviteHistoryKeyboard({
  inviteState: { invitedCount: 0, shareInlineQuery: 'invite' },
  historyState: { page: 1, hasPrev: false, hasNext: true }
}).inline_keyboard);
if (!historyKeyboard.includes('invite:perf') || !historyKeyboard.includes('invite:hist:2') || !historyKeyboard.includes('switch_inline_query') || !historyKeyboard.includes('invite:show_link')) {
  throw new Error('Invite history keyboard must expose navigation plus empty-state recovery actions');
}

const cardKeyboard = JSON.stringify(renderInviteCardKeyboard({ inviteState: { inviteCardLink: inviteUrl } }).inline_keyboard);
if (!cardKeyboard.includes('Open Intro Deck')) {
  throw new Error('Invite card keyboard must expose Open Intro Deck URL button');
}

const inlineShareText = renderInlineInviteShareText({ inviteState: { inlineInviteLink: inviteUrl } });
if (!inlineShareText.includes('Join Intro Deck')) {
  throw new Error('Inline invite share text must contain Join Intro Deck anchor');
}

const inlineCaption = renderInlineInviteCaption({ inviteState: { inlineInviteLink: inviteUrl } });
if (!inlineCaption.includes('Trusted intros and direct contact in Telegram.') || !inlineCaption.includes('Join Intro Deck')) {
  throw new Error('Invite photo caption must contain the upgraded invite copy and join anchor');
}

const homeKeyboard = JSON.stringify(renderHomeKeyboard({
  appBaseUrl: 'https://example.com',
  telegramUserId: 1,
  persistenceEnabled: true,
  profileSnapshot: { linkedin_sub: 'abc', completion: { isReady: true } }
}).inline_keyboard);
if (!homeKeyboard.includes('invite:root')) {
  throw new Error('Home keyboard must expose invite entrypoint for connected members');
}

const helpKeyboard = JSON.stringify(renderHelpKeyboard().inline_keyboard);
if (!helpKeyboard.includes('invite:root')) {
  throw new Error('Help keyboard must expose invite entrypoint');
}

const photoUrlResult = buildInlineInviteResult({
  inviteState: {
  inviteLink: inviteUrl,
  inlineInviteLink: inviteUrl,
  inviteCardLink: inviteUrl,
  invitePhotoUrl: 'https://example.com/assets/social/intro-deck-og-1200x630.jpg',
  inlineInviteCaption: inlineCaption,
  inlineShareText
  }
});
if (photoUrlResult.type !== 'photo' || photoUrlResult.photo_url !== 'https://example.com/assets/social/intro-deck-og-1200x630.jpg' || photoUrlResult.thumbnail_url !== 'https://example.com/assets/social/intro-deck-og-1200x630.jpg') {
  throw new Error('Invite inline result must emit a URL-based photo card when a public JPEG asset is available');
}

const cachedPhotoResult = buildInlineInviteResult({
  inviteState: {
  inviteLink: inviteUrl,
  inlineInviteLink: inviteUrl,
  inviteCardLink: inviteUrl,
  invitePhotoFileId: 'AgACAgIAAxkBAAIBQ2aFakePhotoFileId',
  inlineInviteCaption: inlineCaption,
  inlineShareText
  }
});
if (cachedPhotoResult.type !== 'photo' || cachedPhotoResult.photo_file_id !== 'AgACAgIAAxkBAAIBQ2aFakePhotoFileId') {
  throw new Error('Invite inline result must emit a cached-photo card when a Telegram photo file id is configured');
}

const fallbackArticleResult = buildInlineInviteResult({
  inviteState: {
  inviteLink: inviteUrl,
  inlineInviteLink: inviteUrl,
  inviteCardLink: inviteUrl,
  inlineInviteCaption: inlineCaption,
  inlineShareText
  }
});
if (fallbackArticleResult.type !== 'article' || !fallbackArticleResult.input_message_content?.message_text?.includes('Join Intro Deck')) {
  throw new Error('Invite inline result must preserve an article/text fallback when no photo asset is available');
}

const inviteLinkText = renderInviteLinkText({ inviteState: { inviteLink: inviteUrl } });
if (!inviteLinkText.includes(inviteUrl)) {
  throw new Error('Invite link text must show raw invite link');
}

console.log('OK: invite contract');
