import { renderDirectoryCardKeyboard, renderDirectoryCardText, renderDirectoryListKeyboard, renderDirectoryListText, renderHomeKeyboard } from '../src/lib/telegram/render.js';
import { DIRECTORY_PAGE_SIZE } from '../src/lib/storage/directoryStore.js';

if (DIRECTORY_PAGE_SIZE !== 5) {
  throw new Error('Expected narrow directory page size baseline of 5');
}

const sampleProfiles = [
  {
    profile_id: 101,
    display_name: 'Rustam Lukmanov',
    linkedin_name: 'Rustam Lukmanov',
    headline_user: 'Founder | Growth operator',
    company_user: 'Collabka PR',
    city_user: 'Miami',
    industry_user: 'Creator economy',
    about_user: 'Building Telegram-native creator pipeline products.',
    visibility_status: 'listed',
    profile_state: 'active',
    skills: [{ skill_slug: 'growth', skill_label: 'Growth' }],
    is_viewer: true
  }
];

const homeKeyboard = renderHomeKeyboard({
  appBaseUrl: 'https://example.com',
  telegramUserId: 1,
  profileSnapshot: { linkedin_sub: 'abc' },
  persistenceEnabled: true
});

if (!JSON.stringify(homeKeyboard).includes('dir:list:0')) {
  throw new Error('Home keyboard must expose browse directory entrypoint when persistence is enabled');
}

const listText = renderDirectoryListText({ profiles: sampleProfiles, page: 0, totalCount: 1, persistenceEnabled: true });
if (!listText.includes('Public directory') || !listText.includes('Rustam Lukmanov')) {
  throw new Error('Directory list text must render listed profiles');
}

const listKeyboard = renderDirectoryListKeyboard({ profiles: sampleProfiles, page: 0, hasPrev: false, hasNext: true });
if (!JSON.stringify(listKeyboard).includes('dir:open:101:0') || !JSON.stringify(listKeyboard).includes('dir:list:1')) {
  throw new Error('Directory list keyboard must expose open and next-page callbacks');
}

const cardText = renderDirectoryCardText({ profileSnapshot: sampleProfiles[0], persistenceEnabled: true });
if (!cardText.includes('Directory profile') || !cardText.includes('Growth')) {
  throw new Error('Directory card text must render public card details');
}

const cardKeyboard = renderDirectoryCardKeyboard({ page: 2 });
if (!JSON.stringify(cardKeyboard).includes('dir:list:2')) {
  throw new Error('Directory card keyboard must preserve return page');
}

console.log('OK: directory browse contract baseline');
