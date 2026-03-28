import {
  renderHelpKeyboard,
  renderHelpText,
  renderHomeKeyboard,
  renderHomeText,
  renderProfileInputKeyboard,
  renderProfileInputPrompt,
  renderProfileMenuKeyboard,
  renderProfileMenuText,
  renderProfilePreviewKeyboard,
  renderProfilePreviewText,
  renderProfileSkillsKeyboard,
  renderProfileSkillsText
} from '../src/lib/telegram/render.js';

const profileSnapshot = {
  linkedin_sub: 'abc',
  linkedin_name: 'Rustam Lukmanov',
  display_name: 'Rustam',
  headline_user: 'Founder',
  company_user: 'Collabka PR',
  city_user: 'Miami',
  industry_user: 'Creator economy',
  about_user: 'I build Telegram-first products.',
  profile_state: 'active',
  visibility_status: 'hidden',
  skills: [
    { skill_slug: 'founder', skill_label: 'Founder' },
    { skill_slug: 'growth', skill_label: 'Growth' }
  ],
  completion: {
    filledCount: 6,
    totalCount: 6,
    requiredFilledCount: 4,
    requiredCount: 4,
    skillsCount: 2,
    requiredSkillCount: 1,
    hasRequiredSkills: true,
    isReady: true,
    fields: [
      { label: 'Display name', filled: true, value: 'Rustam' }
    ]
  }
};

const textDisconnected = renderHomeText({
  profileSnapshot: null,
  persistenceEnabled: false
});
if (!textDisconnected.includes('Profile saving is unavailable right now.')) {
  throw new Error('home text must expose disabled persistence state');
}

const textConnected = renderHomeText({
  persistenceEnabled: true,
  profileSnapshot
});
if (!textConnected.includes('Connected as: Rustam')) {
  throw new Error('home text missing connected profile summary');
}
if (!textConnected.includes('Skills: Founder, Growth')) {
  throw new Error('home text missing skills summary');
}

const keyboard = renderHomeKeyboard({
  appBaseUrl: 'https://example.com',
  telegramUserId: 42,
  profileSnapshot,
  persistenceEnabled: true
});

const serialized = JSON.stringify(keyboard.inline_keyboard);
if (!serialized.includes('Edit profile')) {
  throw new Error('home keyboard missing profile entrypoint');
}
if (!serialized.includes('help:root')) {
  throw new Error('home keyboard missing help callback');
}
if (serialized.includes('home:root')) {
  throw new Error('home keyboard must not include a home callback on the home surface');
}

const menuText = renderProfileMenuText({
  profileSnapshot,
  persistenceEnabled: true
});
if (!menuText.includes('Profile editor')) {
  throw new Error('profile menu text missing title');
}
if (!menuText.includes('Skills: Founder, Growth')) {
  throw new Error('profile menu text missing skills summary');
}

const menuKeyboard = JSON.stringify(renderProfileMenuKeyboard({ profileSnapshot, persistenceEnabled: true }).inline_keyboard);
if (!menuKeyboard.includes('p:ed:hl')) {
  throw new Error('profile menu keyboard missing headline edit callback');
}
if (!menuKeyboard.includes('p:sk')) {
  throw new Error('profile menu keyboard missing skills callback');
}

const previewText = renderProfilePreviewText({ profileSnapshot, persistenceEnabled: true });
if (!previewText.includes('Profile preview')) {
  throw new Error('profile preview text missing title');
}
if (!previewText.includes('Skills: Founder, Growth')) {
  throw new Error('profile preview text missing skills line');
}

const previewKeyboard = JSON.stringify(renderProfilePreviewKeyboard().inline_keyboard);
if (!previewKeyboard.includes('p:menu')) {
  throw new Error('profile preview keyboard missing menu callback');
}

const inputPrompt = renderProfileInputPrompt({ fieldKey: 'ab', profileSnapshot });
if (!inputPrompt.includes('Edit About')) {
  throw new Error('profile input prompt missing field label');
}
if (!inputPrompt.includes('next text message')) {
  throw new Error('profile input prompt missing input instructions');
}

const inputKeyboard = JSON.stringify(renderProfileInputKeyboard().inline_keyboard);
if (!inputKeyboard.includes('p:menu')) {
  throw new Error('profile input keyboard missing back callback');
}

const skillsText = renderProfileSkillsText({ profileSnapshot, persistenceEnabled: true });
if (!skillsText.includes('Skills selection')) {
  throw new Error('skills text missing title');
}
if (!skillsText.includes('Selected skills: Founder, Growth')) {
  throw new Error('skills text missing selected skills summary');
}

const skillsKeyboard = JSON.stringify(renderProfileSkillsKeyboard({ profileSnapshot }).inline_keyboard);
if (!skillsKeyboard.includes('p:skt:founder')) {
  throw new Error('skills keyboard missing toggle callback');
}
if (!skillsKeyboard.includes('p:sk:clr')) {
  throw new Error('skills keyboard missing clear callback');
}

console.log('OK: router baseline contract');

const helpText = renderHelpText();
if (!helpText.includes('Use Intro Deck to connect your LinkedIn identity')) {
  throw new Error('help text missing product summary');
}
const helpKeyboard = JSON.stringify(renderHelpKeyboard().inline_keyboard);
if (!helpKeyboard.includes('p:menu') || !helpKeyboard.includes('dir:list:0') || !helpKeyboard.includes('intro:inbox')) {
  throw new Error('help keyboard missing key entrypoints');
}
