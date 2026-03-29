import { strict as assert } from 'node:assert';
import {
  getContactModeLabel,
  normalizeTelegramUsername
} from '../src/lib/profile/contract.js';
import {
  renderContactUnlockDetailKeyboard,
  renderContactUnlockDetailText,
  renderDirectoryCardKeyboard,
  renderProfileMenuKeyboard,
  renderProfilePreviewText
} from '../src/lib/telegram/render.js';

assert.equal(normalizeTelegramUsername('@rustam_dev'), 'rustam_dev');
assert.equal(normalizeTelegramUsername('https://t.me/Rustam_Dev'), 'Rustam_Dev');
assert.equal(getContactModeLabel('paid_unlock_requires_approval'), 'Direct contact by paid request');

const profileKeyboard = renderProfileMenuKeyboard({
  persistenceEnabled: true,
  profileSnapshot: { linkedin_sub: 'sub', visibility_status: 'hidden' }
});
assert.match(JSON.stringify(profileKeyboard), /p:ed:tg/);
assert.match(JSON.stringify(profileKeyboard), /p:cm/);

const directoryKeyboard = renderDirectoryCardKeyboard({
  page: 0,
  profileSnapshot: {
    profile_id: 44,
    is_viewer: false,
    contact_mode: 'paid_unlock_requires_approval'
  }
});
assert.match(JSON.stringify(directoryKeyboard), /dir:unlock:44:0/);

const preview = renderProfilePreviewText({
  persistenceEnabled: true,
  profileSnapshot: {
    linkedin_sub: 'sub',
    linkedin_name: 'Rustam',
    headline_user: 'Founder',
    company_user: 'Intro Deck',
    city_user: 'Miami',
    industry_user: 'SaaS',
    about_user: 'About',
    linkedin_public_url: 'https://www.linkedin.com/in/test',
    telegram_username_hidden: 'rustam_dev',
    visibility_status: 'hidden',
    contact_mode: 'paid_unlock_requires_approval',
    profile_state: 'draft',
    skills: [],
    completion: { isReady: false, hasRequiredSkills: false, filledCount: 1, totalCount: 8, requiredFilledCount: 1, requiredCount: 4, skillsCount: 0, requiredSkillCount: 1 }
  }
});
assert.match(preview, /Hidden Telegram username: @rustam_dev/);
assert.match(preview, /Contact mode: Direct contact by paid request/);

const detailText = renderContactUnlockDetailText({
  persistenceEnabled: true,
  request: {
    contact_unlock_request_id: 9,
    role: 'sent',
    display_name: 'Alice',
    headline_user: 'Operator',
    status: 'revealed',
    payment_state: 'paid',
    price_stars_snapshot: 75,
    requested_at: new Date().toISOString(),
    revealed_contact_value: 'alice_ops'
  }
});
assert.match(detailText, /Unlocked Telegram username: @alice_ops/);

const detailKeyboard = renderContactUnlockDetailKeyboard({
  request: {
    contact_unlock_request_id: 9,
    role: 'sent',
    status: 'revealed',
    revealed_contact_value: 'alice_ops'
  }
});
assert.match(JSON.stringify(detailKeyboard), /https:\/\/t\.me\/alice_ops/);

console.log('OK: contact unlock render and contract');
