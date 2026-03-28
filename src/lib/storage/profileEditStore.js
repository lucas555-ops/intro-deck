import { isDatabaseConfigured, withDbTransaction } from '../../db/pool.js';
import { clearProfileEditSessionByUserId, getActiveProfileEditSessionByTelegramUserId, startProfileEditSession } from '../../db/editSessionRepo.js';
import {
  clearProfileSkills,
  getProfileSnapshotByTelegramUserId,
  getProfileSnapshotByUserId,
  setProfileVisibility,
  toggleProfileSkill,
  updateProfileField
} from '../../db/profileRepo.js';
import { getSkillMeta, normalizeProfileFieldValue, getProfileFieldMeta } from '../profile/contract.js';

const EDIT_SESSION_TTL_MINUTES = 20;

export async function loadProfileEditorState({ telegramUserId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      profile: null,
      pendingSession: null,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const profile = await getProfileSnapshotByTelegramUserId(client, telegramUserId);
    const pendingSession = await getActiveProfileEditSessionByTelegramUserId(client, telegramUserId);

    return {
      persistenceEnabled: true,
      profile,
      pendingSession,
      reason: profile ? 'profile_loaded' : 'profile_missing'
    };
  });
}

export async function beginProfileFieldEdit({ telegramUserId, fieldKey }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      started: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  const fieldMeta = getProfileFieldMeta(fieldKey);
  if (!fieldMeta) {
    throw new Error(`Unsupported profile field key: ${fieldKey}`);
  }

  return withDbTransaction(async (client) => {
    const profile = await getProfileSnapshotByTelegramUserId(client, telegramUserId);
    if (!profile?.user_id) {
      throw new Error('Profile not found for edit session');
    }

    const pendingSession = await startProfileEditSession(client, {
      userId: profile.user_id,
      fieldKey,
      ttlMinutes: EDIT_SESSION_TTL_MINUTES
    });

    return {
      persistenceEnabled: true,
      started: true,
      fieldMeta,
      pendingSession,
      profile
    };
  });
}

export async function cancelProfileFieldEdit({ telegramUserId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      cleared: false,
      profile: null,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const profile = await getProfileSnapshotByTelegramUserId(client, telegramUserId);
    if (!profile?.user_id) {
      return {
        persistenceEnabled: true,
        cleared: false,
        profile: null,
        reason: 'profile_missing'
      };
    }

    await clearProfileEditSessionByUserId(client, profile.user_id);
    const updatedProfile = await getProfileSnapshotByUserId(client, profile.user_id);

    return {
      persistenceEnabled: true,
      cleared: true,
      profile: updatedProfile,
      reason: 'edit_session_cleared'
    };
  });
}

export async function applyProfileFieldInput({ telegramUserId, text }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      consumed: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const pendingSession = await getActiveProfileEditSessionByTelegramUserId(client, telegramUserId);
    if (!pendingSession?.user_id) {
      return {
        persistenceEnabled: true,
        consumed: false,
        reason: 'no_active_edit_session'
      };
    }

    const value = normalizeProfileFieldValue(pendingSession.field_key, text);
    const profile = await updateProfileField(client, {
      userId: pendingSession.user_id,
      fieldKey: pendingSession.field_key,
      value
    });

    await clearProfileEditSessionByUserId(client, pendingSession.user_id);

    return {
      persistenceEnabled: true,
      consumed: true,
      fieldMeta: getProfileFieldMeta(pendingSession.field_key),
      profile,
      reason: 'profile_field_updated'
    };
  });
}

export async function toggleProfileSkillForTelegramUser({ telegramUserId, skillSlug }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      changed: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  const skillMeta = getSkillMeta(skillSlug);
  if (!skillMeta) {
    throw new Error(`Unsupported skill slug: ${skillSlug}`);
  }

  return withDbTransaction(async (client) => {
    const profile = await getProfileSnapshotByTelegramUserId(client, telegramUserId);
    if (!profile?.user_id) {
      return {
        persistenceEnabled: true,
        changed: false,
        reason: 'profile_missing'
      };
    }

    const result = await toggleProfileSkill(client, {
      userId: profile.user_id,
      skillSlug
    });

    return {
      persistenceEnabled: true,
      changed: true,
      toggledOn: result.toggledOn,
      skillMeta,
      profile: result.profile,
      reason: result.toggledOn ? 'skill_added' : 'skill_removed'
    };
  });
}

export async function clearProfileSkillsForTelegramUser({ telegramUserId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      changed: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const profile = await getProfileSnapshotByTelegramUserId(client, telegramUserId);
    if (!profile?.user_id) {
      return {
        persistenceEnabled: true,
        changed: false,
        reason: 'profile_missing'
      };
    }

    const updatedProfile = await clearProfileSkills(client, {
      userId: profile.user_id
    });

    return {
      persistenceEnabled: true,
      changed: true,
      profile: updatedProfile,
      reason: 'skills_cleared'
    };
  });
}

export async function toggleProfileVisibilityForTelegramUser({ telegramUserId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      changed: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const profile = await getProfileSnapshotByTelegramUserId(client, telegramUserId);
    if (!profile?.user_id) {
      return {
        persistenceEnabled: true,
        changed: false,
        reason: 'profile_missing'
      };
    }

    if (!profile.completion?.isReady) {
      return {
        persistenceEnabled: true,
        changed: false,
        blocked: true,
        profile,
        reason: 'profile_not_ready_to_list'
      };
    }

    const nextVisibility = profile.visibility_status === 'listed' ? 'hidden' : 'listed';
    const updatedProfile = await setProfileVisibility(client, {
      userId: profile.user_id,
      visibilityStatus: nextVisibility
    });

    return {
      persistenceEnabled: true,
      changed: true,
      blocked: false,
      profile: updatedProfile,
      reason: 'visibility_toggled'
    };
  });
}
