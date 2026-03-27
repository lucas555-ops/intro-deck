import { normalizeProfileFieldValue } from '../src/lib/profile/contract.js';
import { renderDirectoryCardKeyboard, renderDirectoryCardText } from '../src/lib/telegram/render.js';

const url = normalizeProfileFieldValue('li', 'https://www.linkedin.com/in/rustam-lukmanov/');
if (url !== 'https://www.linkedin.com/in/rustam-lukmanov') {
  throw new Error('Public LinkedIn URL must be normalized without trailing slash');
}

let invalidRejected = false;
try {
  normalizeProfileFieldValue('li', 'https://example.com/in/not-linkedin');
} catch (error) {
  invalidRejected = String(error?.message || error).includes('linkedin.com');
}
if (!invalidRejected) {
  throw new Error('Non-LinkedIn host must be rejected for public profile URL');
}

const publicKeyboard = renderDirectoryCardKeyboard({
  page: 2,
  profileSnapshot: {
    profile_id: 101,
    linkedin_public_url: 'https://www.linkedin.com/in/rustam-lukmanov',
    contact_mode: 'intro_request',
    is_viewer: false
  }
});

const publicButtons = publicKeyboard.inline_keyboard.flat();
if (publicButtons.some((button) => button.url === 'https://www.linkedin.com/in/rustam-lukmanov')) {
  throw new Error('Public directory card must not expose LinkedIn URL directly in intro_request mode');
}
if (!publicButtons.some((button) => button.callback_data === 'dir:intro:101:2')) {
  throw new Error('Directory card keyboard must still expose intro-request callback');
}

const viewerKeyboard = renderDirectoryCardKeyboard({
  page: 0,
  profileSnapshot: {
    profile_id: 101,
    linkedin_public_url: 'https://www.linkedin.com/in/rustam-lukmanov',
    contact_mode: 'intro_request',
    is_viewer: true
  }
});
const viewerButtons = viewerKeyboard.inline_keyboard.flat();
if (!viewerButtons.some((button) => button.url === 'https://www.linkedin.com/in/rustam-lukmanov')) {
  throw new Error('Viewer must still be able to open their own submitted LinkedIn URL');
}
if (viewerButtons.some((button) => button.callback_data?.startsWith('dir:intro:'))) {
  throw new Error('Viewer must not see intro-request button on own card');
}

const externalKeyboard = renderDirectoryCardKeyboard({
  page: 0,
  profileSnapshot: {
    profile_id: 201,
    linkedin_public_url: 'https://www.linkedin.com/in/open-public-profile',
    contact_mode: 'external_link',
    is_viewer: false
  }
});
if (!externalKeyboard.inline_keyboard.flat().some((button) => button.url === 'https://www.linkedin.com/in/open-public-profile')) {
  throw new Error('external_link mode must still expose the configured public URL on directory cards');
}

const publicCardText = renderDirectoryCardText({
  persistenceEnabled: true,
  profileSnapshot: {
    profile_id: 101,
    display_name: 'Rustam Lukmanov',
    linkedin_name: 'Rustam Lukmanov',
    headline_user: 'Founder',
    company_user: 'Collabka PR',
    city_user: 'Miami',
    industry_user: 'Creator economy',
    about_user: 'Building Telegram-native directories.',
    linkedin_public_url: 'https://www.linkedin.com/in/rustam-lukmanov',
    contact_mode: 'intro_request',
    visibility_status: 'listed',
    profile_state: 'active',
    is_viewer: false,
    skills: [{ skill_slug: 'growth', skill_label: 'Growth' }]
  }
});
if (!publicCardText.includes('Public LinkedIn URL: shared after accepted intro')) {
  throw new Error('Public card text must describe the post-decision contact contract in intro_request mode');
}

console.log('OK: profile card outbound contract honors STEP014 contact rules');
