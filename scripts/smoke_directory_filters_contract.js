import {
  DIRECTORY_INDUSTRY_BUCKETS,
  directoryProfileMatchesFilters,
  summarizeDirectoryFilters
} from '../src/lib/profile/contract.js';
import {
  renderDirectoryFilterInputKeyboard,
  renderDirectoryFilterInputPrompt,
  renderDirectoryFiltersKeyboard,
  renderDirectoryFiltersText,
  renderDirectoryListKeyboard,
  renderDirectoryListText
} from '../src/lib/telegram/render.js';

if (DIRECTORY_INDUSTRY_BUCKETS.length < 4) {
  throw new Error('Expected several curated industry buckets for STEP009 baseline');
}

const filterSummary = summarizeDirectoryFilters({
  textQuery: 'growth operator',
  cityQuery: 'Miami',
  selectedIndustrySlug: 'crypto',
  selectedSkillSlugs: ['growth', 'crypto']
});

if (filterSummary.industryLabel !== 'Crypto' || !filterSummary.skillLabels.includes('Growth')) {
  throw new Error('Directory filter summary must resolve labels for selected filters');
}
if (filterSummary.textQueryLabel !== 'growth operator' || filterSummary.cityQueryLabel !== 'Miami') {
  throw new Error('Directory filter summary must expose text and city labels');
}

const text = renderDirectoryFiltersText({
  persistenceEnabled: true,
  filterSummary
});
if (!text.includes('Directory filters') || !text.includes('Search: growth operator') || !text.includes('City: Miami')) {
  throw new Error('Directory filters text must render search and city summary');
}

const keyboard = renderDirectoryFiltersKeyboard({ filterSummary });
const keyboardJson = JSON.stringify(keyboard);
if (!keyboardJson.includes('dir:ft:q') || !keyboardJson.includes('dir:ft:c') || !keyboardJson.includes('dir:fx:q') || !keyboardJson.includes('dir:fx:c')) {
  throw new Error('Directory filters keyboard must expose search/city entry and clear controls');
}
if (!keyboardJson.includes('dir:fi:crypto') || !keyboardJson.includes('dir:fs:growth') || !keyboardJson.includes('dir:fc')) {
  throw new Error('Directory filters keyboard must still expose industry, skills, and clear-all controls');
}

const inputPrompt = renderDirectoryFilterInputPrompt({ kind: 'q', filterSummary });
if (!inputPrompt.includes('Edit Search text') || !inputPrompt.includes('Current value: growth operator')) {
  throw new Error('Directory filter input prompt must describe the active input kind');
}

const inputKeyboard = JSON.stringify(renderDirectoryFilterInputKeyboard());
if (!inputKeyboard.includes('dir:flt') || !inputKeyboard.includes('dir:list:0')) {
  throw new Error('Directory filter input keyboard must allow back-to-filters and back-to-directory');
}

const sampleProfile = {
  profile_id: 101,
  display_name: 'Rustam Lukmanov',
  linkedin_name: 'Rustam Lukmanov',
  headline_user: 'Founder | Growth operator',
  company_user: 'Collabka PR',
  city_user: 'Miami',
  industry_user: 'Crypto creator economy',
  about_user: 'Building Telegram-native creator pipeline products.',
  visibility_status: 'listed',
  profile_state: 'active',
  skills: [
    { skill_slug: 'growth', skill_label: 'Growth' },
    { skill_slug: 'crypto', skill_label: 'Crypto' }
  ],
  is_viewer: true
};

if (!directoryProfileMatchesFilters(sampleProfile, {
  textQuery: 'growth operator',
  cityQuery: 'Miami',
  selectedIndustrySlug: 'crypto',
  selectedSkillSlugs: ['growth']
})) {
  throw new Error('Profile must match combined STEP009 filters');
}

if (directoryProfileMatchesFilters(sampleProfile, {
  textQuery: 'recruiter',
  selectedIndustrySlug: 'crypto',
  selectedSkillSlugs: []
})) {
  throw new Error('Profile must not match a different text query');
}

const listText = renderDirectoryListText({
  profiles: [sampleProfile],
  page: 0,
  totalCount: 1,
  persistenceEnabled: true,
  filterSummary
});
if (!listText.includes('Search: growth operator') || !listText.includes('City: Miami')) {
  throw new Error('Directory list text must show search and city summary');
}

const listKeyboard = renderDirectoryListKeyboard({
  profiles: [sampleProfile],
  page: 0,
  hasPrev: false,
  hasNext: false
});
if (!JSON.stringify(listKeyboard).includes('dir:flt')) {
  throw new Error('Directory list keyboard must expose filters entrypoint');
}

console.log('OK: directory filters contract baseline');
