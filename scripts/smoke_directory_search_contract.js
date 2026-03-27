import {
  directoryProfileMatchesFilters,
  summarizeDirectoryFilters
} from '../src/lib/profile/contract.js';
import { renderDirectoryListText } from '../src/lib/telegram/render.js';

const sampleProfile = {
  profile_id: 101,
  display_name: 'Rustam Lukmanov',
  linkedin_name: 'Rustam Lukmanov',
  headline_user: 'Founder | Growth operator',
  company_user: 'Collabka PR',
  city_user: 'Miami Beach',
  industry_user: 'Crypto creator economy',
  about_user: 'Building Telegram-native creator pipeline products.',
  visibility_status: 'listed',
  profile_state: 'active',
  skills: [
    { skill_slug: 'growth', skill_label: 'Growth' },
    { skill_slug: 'crypto', skill_label: 'Crypto' }
  ]
};

if (!directoryProfileMatchesFilters(sampleProfile, { textQuery: 'collabka' })) {
  throw new Error('Text query must match company');
}
if (!directoryProfileMatchesFilters(sampleProfile, { textQuery: 'telegram-native' })) {
  throw new Error('Text query must match about');
}
if (!directoryProfileMatchesFilters(sampleProfile, { cityQuery: 'Miami' })) {
  throw new Error('City query must match city fragments case-insensitively');
}
if (directoryProfileMatchesFilters(sampleProfile, { cityQuery: 'Berlin' })) {
  throw new Error('City query must reject other cities');
}

const filterSummary = summarizeDirectoryFilters({
  textQuery: 'collabka',
  cityQuery: 'Miami'
});

const emptyListText = renderDirectoryListText({
  profiles: [],
  page: 0,
  totalCount: 0,
  persistenceEnabled: true,
  filterSummary
});

if (!emptyListText.includes('No listed profiles match the current filters.')) {
  throw new Error('Filtered empty state must be explicit for STEP009');
}

console.log('OK: directory search contract baseline');
