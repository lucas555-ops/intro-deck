import {
  buildProfileDraftSeed,
  ensureProfileDraft,
  getProfileSnapshotByTelegramUserId,
  updateProfileField,
  toggleProfileSkill,
  clearProfileSkills
} from '../src/db/profileRepo.js';
import { upsertLinkedInAccount } from '../src/db/linkedinRepo.js';
import { upsertTelegramUser } from '../src/db/usersRepo.js';
import { startProfileEditSession, getActiveProfileEditSessionByTelegramUserId, clearProfileEditSessionByUserId } from '../src/db/editSessionRepo.js';

class FakeClient {
  constructor() {
    this.queries = [];
    this.skillRows = [];
  }

  async query(text, params) {
    const normalized = text.replace(/\s+/g, ' ').trim();
    this.queries.push({ text: normalized, params });

    if (normalized.startsWith('insert into users')) {
      return {
        rows: [{
          id: 1,
          telegram_user_id: params[0],
          telegram_username: params[1],
          first_seen_at: '2026-03-26T00:00:00.000Z',
          last_seen_at: '2026-03-26T00:00:00.000Z'
        }]
      };
    }

    if (normalized.startsWith('insert into linkedin_accounts')) {
      return {
        rows: [{
          id: 10,
          user_id: params[0],
          linkedin_sub: params[1],
          full_name: params[2],
          email: params[6],
          email_verified: params[7],
          locale: params[8],
          linked_at: '2026-03-26T00:00:00.000Z',
          last_refresh_at: '2026-03-26T00:00:00.000Z'
        }]
      };
    }

    if (normalized.startsWith('insert into member_profiles')) {
      return { rows: [] };
    }

    if (normalized.startsWith('update member_profiles mp set profile_state')) {
      return { rows: [] };
    }

    if (normalized.startsWith('select u.id as user_id') && normalized.includes('where u.id = $1')) {
      return {
        rows: [{
          user_id: params[0],
          telegram_user_id: 123,
          telegram_username: 'rustam',
          linkedin_sub: 'linkedin-sub-1',
          linkedin_name: 'Rustam Lukmanov',
          linkedin_email: 'r@example.com',
          profile_id: 20,
          display_name: 'Rustam Lukmanov',
          headline_user: this.skillRows.length ? 'Founder' : null,
          company_user: null,
          city_user: null,
          industry_user: this.skillRows.length ? 'Creator economy' : null,
          about_user: this.skillRows.length ? 'I build Telegram-first products.' : null,
          linkedin_public_url: null,
          visibility_status: 'hidden',
          contact_mode: 'intro_request',
          profile_state: this.skillRows.length ? 'active' : 'draft',
          created_at: '2026-03-26T00:00:00.000Z',
          updated_at: '2026-03-26T00:00:00.000Z'
        }]
      };
    }

    if (normalized.startsWith('select u.id as user_id') && normalized.includes('where u.telegram_user_id = $1')) {
      return {
        rows: [{
          user_id: 1,
          telegram_user_id: params[0],
          telegram_username: 'rustam',
          linkedin_sub: 'linkedin-sub-1',
          linkedin_name: 'Rustam Lukmanov',
          linkedin_email: 'r@example.com',
          profile_id: 20,
          display_name: 'Rustam Lukmanov',
          headline_user: 'Founder',
          company_user: 'Collabka PR',
          city_user: 'Miami',
          industry_user: 'Creator economy',
          about_user: 'I build Telegram-first products.',
          linkedin_public_url: null,
          visibility_status: 'hidden',
          contact_mode: 'intro_request',
          profile_state: this.skillRows.length ? 'active' : 'draft',
          created_at: '2026-03-26T00:00:00.000Z',
          updated_at: '2026-03-26T00:00:00.000Z'
        }]
      };
    }

    if (normalized.startsWith('select skill_slug, skill_label from member_profile_skills')) {
      return { rows: this.skillRows };
    }

    if (normalized.startsWith('update member_profiles set display_name')) {
      return { rows: [] };
    }

    if (normalized.startsWith('select id as profile_id from member_profiles where user_id = $1')) {
      return { rows: [{ profile_id: 20 }] };
    }

    if (normalized.startsWith('select 1 from member_profile_skills where profile_id = $1 and skill_slug = $2')) {
      return {
        rows: this.skillRows.some((row) => row.skill_slug === params[1]) ? [{ '?column?': 1 }] : []
      };
    }

    if (normalized.startsWith('insert into member_profile_skills')) {
      this.skillRows = Array.from(new Map([...this.skillRows, { skill_slug: params[1], skill_label: params[2] }].map((row) => [row.skill_slug, row])).values());
      return { rows: [] };
    }

    if (normalized.startsWith('delete from member_profile_skills where profile_id = $1 and skill_slug = $2')) {
      this.skillRows = this.skillRows.filter((row) => row.skill_slug !== params[1]);
      return { rows: [] };
    }

    if (normalized.startsWith('delete from member_profile_skills where profile_id = $1')) {
      this.skillRows = [];
      return { rows: [] };
    }

    if (normalized.startsWith('insert into profile_edit_sessions')) {
      return {
        rows: [{
          user_id: params[0],
          field_key: params[1],
          expires_at: '2026-03-26T00:20:00.000Z',
          updated_at: '2026-03-26T00:00:00.000Z'
        }]
      };
    }

    if (normalized.startsWith('select pes.user_id')) {
      return {
        rows: [{
          user_id: 1,
          field_key: 'hl',
          expires_at: '2026-03-26T00:20:00.000Z',
          updated_at: '2026-03-26T00:00:00.000Z',
          telegram_user_id: params[0]
        }]
      };
    }

    if (normalized.startsWith('delete from profile_edit_sessions')) {
      return { rows: [] };
    }

    throw new Error(`Unexpected query in FakeClient: ${normalized}`);
  }
}

const seed = buildProfileDraftSeed({
  name: 'Rustam Lukmanov',
  givenName: 'Rustam',
  familyName: 'Lukmanov'
});
if (seed.displayName !== 'Rustam Lukmanov') {
  throw new Error('buildProfileDraftSeed must prefer full name when present');
}
if (seed.profileState !== 'draft') {
  throw new Error('profile draft seed must default to draft state');
}

const client = new FakeClient();
const user = await upsertTelegramUser(client, {
  telegramUserId: 123,
  telegramUsername: 'rustam'
});
if (user.id !== 1) {
  throw new Error('upsertTelegramUser must return inserted row');
}

const account = await upsertLinkedInAccount(client, {
  userId: user.id,
  identity: {
    linkedinSub: 'linkedin-sub-1',
    name: 'Rustam Lukmanov',
    givenName: 'Rustam',
    familyName: 'Lukmanov',
    pictureUrl: 'https://example.com/p.png',
    email: 'r@example.com',
    emailVerified: true,
    locale: 'en_US'
  },
  rawIdentityPayload: { idToken: true }
});
if (account.linkedin_sub !== 'linkedin-sub-1') {
  throw new Error('upsertLinkedInAccount must persist linkedin_sub');
}

const draft = await ensureProfileDraft(client, {
  userId: user.id,
  identity: { name: 'Rustam Lukmanov' }
});
if (draft.profile_state !== 'draft') {
  throw new Error('ensureProfileDraft must return draft profile state before skills exist');
}

const snapshot = await getProfileSnapshotByTelegramUserId(client, 123);
if (snapshot.display_name !== 'Rustam Lukmanov') {
  throw new Error('profile snapshot must expose display_name');
}
if (snapshot.completion?.isReady) {
  throw new Error('profile snapshot must not be ready before skills are selected');
}

const updated = await updateProfileField(client, {
  userId: 1,
  fieldKey: 'dn',
  value: 'Rustam'
});
if (!updated.completion) {
  throw new Error('updateProfileField must return decorated profile snapshot');
}

const toggle = await toggleProfileSkill(client, {
  userId: 1,
  skillSlug: 'founder'
});
if (!toggle.toggledOn) {
  throw new Error('toggleProfileSkill must add missing skill');
}
if (!toggle.profile.completion.hasRequiredSkills) {
  throw new Error('profile completion must expose selected skills after toggle');
}

const cleared = await clearProfileSkills(client, { userId: 1 });
if (cleared.skills.length !== 0) {
  throw new Error('clearProfileSkills must remove all selected skills');
}

const session = await startProfileEditSession(client, {
  userId: 1,
  fieldKey: 'hl'
});
if (session.field_key !== 'hl') {
  throw new Error('startProfileEditSession must persist field_key');
}

const activeSession = await getActiveProfileEditSessionByTelegramUserId(client, 123);
if (activeSession.field_key !== 'hl') {
  throw new Error('getActiveProfileEditSessionByTelegramUserId must return active session');
}

await clearProfileEditSessionByUserId(client, 1);

console.log('OK: storage contract baseline');
