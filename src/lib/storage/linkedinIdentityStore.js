import { withDbTransaction, isDatabaseConfigured } from '../../db/pool.js';
import { upsertTelegramUser } from '../../db/usersRepo.js';
import {
  deleteLinkedInAccountByUserId,
  getLinkedInAccountBySub,
  getLinkedInAccountByUserId,
  refreshLinkedInAccountBySub,
  upsertLinkedInAccount
} from '../../db/linkedinRepo.js';
import { ensureProfileDraft, getProfileSnapshotByUserId, hideProfileListingByUserId } from '../../db/profileRepo.js';
import { createAdminAuditEvent } from '../../db/adminRepo.js';
import { maybeCreatePendingInviteRewardForActivationWithClient } from './inviteStore.js';

function buildRawIdentityPayload({ identity, rawTokenPayload, rawUserInfo, source = 'linkedin_oidc' }) {
  return {
    source,
    identity,
    token: rawTokenPayload || null,
    userinfo: rawUserInfo || null
  };
}

function hasNonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function collectIdentityImportedFields(identity = {}) {
  const imported = [];
  if (hasNonEmptyText(identity.linkedinSub)) imported.push('linkedin_sub');
  if (hasNonEmptyText(identity.name)) imported.push('full_name');
  if (hasNonEmptyText(identity.givenName)) imported.push('given_name');
  if (hasNonEmptyText(identity.familyName)) imported.push('family_name');
  if (hasNonEmptyText(identity.pictureUrl)) imported.push('picture_url');
  if (hasNonEmptyText(identity.locale)) imported.push('locale');
  if (hasNonEmptyText(identity.email)) imported.push('email');
  return imported;
}

function buildProfileSeedMeta({ beforeProfile, afterProfile, identity }) {
  const expectedDisplayName = typeof identity?.name === 'string' && identity.name.trim()
    ? identity.name.trim()
    : [identity?.givenName, identity?.familyName].filter((part) => typeof part === 'string' && part.trim()).join(' ').trim() || null;

  const beforeDisplayName = hasNonEmptyText(beforeProfile?.display_name);
  const afterDisplayName = hasNonEmptyText(afterProfile?.display_name) ? afterProfile.display_name.trim() : null;
  const displayNameSeeded = !beforeDisplayName && Boolean(expectedDisplayName) && afterDisplayName === expectedDisplayName;

  return {
    displayNameSeeded,
    seededFields: displayNameSeeded ? ['display_name'] : []
  };
}

export async function persistLinkedInIdentity({
  telegramUserId,
  telegramUsername = null,
  identity,
  rawTokenPayload,
  rawUserInfo,
  transferMode = 'detect'
}) {
  if (!identity?.linkedinSub) {
    throw new Error('Cannot persist LinkedIn identity without linkedinSub');
  }

  if (!isDatabaseConfigured()) {
    return {
      persisted: false,
      reason: 'DATABASE_URL is not configured',
      telegramUserId,
      identity
    };
  }

  return withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, {
      telegramUserId,
      telegramUsername
    });

    const rawIdentityPayload = buildRawIdentityPayload({
      identity,
      rawTokenPayload,
      rawUserInfo,
      source: transferMode === 'confirm' ? 'linkedin_oidc_transfer_confirmed' : 'linkedin_oidc'
    });

    const identityImportedFields = collectIdentityImportedFields(identity);
    const existingBySub = await getLinkedInAccountBySub(client, identity.linkedinSub);

    if (existingBySub && String(existingBySub.user_id) !== String(user.id)) {
      if (transferMode !== 'confirm') {
        return {
          persisted: false,
          reason: 'LINKEDIN_TRANSFER_REQUIRED',
          transferRequired: true,
          user,
          identity,
          identityImportedFields,
          conflict: {
            linkedinSub: existingBySub.linkedin_sub,
            fullName: existingBySub.full_name,
            previousUserId: existingBySub.user_id,
            previousTelegramUserId: existingBySub.telegram_user_id,
            previousTelegramUsername: existingBySub.telegram_username
          }
        };
      }

      const existingByTargetUser = await getLinkedInAccountByUserId(client, user.id);
      if (existingByTargetUser && existingByTargetUser.linkedin_sub !== identity.linkedinSub) {
        await deleteLinkedInAccountByUserId(client, user.id);
      }

      const profileBeforeSeed = await getProfileSnapshotByUserId(client, user.id);
      await hideProfileListingByUserId(client, existingBySub.user_id);

      const linkedinAccount = await refreshLinkedInAccountBySub(client, {
        linkedinSub: identity.linkedinSub,
        userId: user.id,
        identity,
        rawIdentityPayload
      });

      const profileDraft = await ensureProfileDraft(client, {
        userId: user.id,
        identity
      });
      const profileSeed = buildProfileSeedMeta({
        beforeProfile: profileBeforeSeed,
        afterProfile: profileDraft,
        identity
      });
      const inviteRewardResult = await maybeCreatePendingInviteRewardForActivationWithClient(client, { userId: user.id });

      await createAdminAuditEvent(client, {
        eventType: 'linkedin_relink_transferred',
        actorUserId: user.id,
        targetUserId: user.id,
        secondaryTargetUserId: existingBySub.user_id,
        summary: 'LinkedIn connection moved to a new Telegram account.',
        detail: {
          linkedinSub: identity.linkedinSub,
          fullName: identity.name || existingBySub.full_name || null,
          previousTelegramUserId: existingBySub.telegram_user_id || null,
          previousTelegramUsername: existingBySub.telegram_username || null,
          newTelegramUserId: telegramUserId,
          newTelegramUsername: telegramUsername || null,
          identityImportedFields,
          profileSeed,
          inviteRewardResult
        }
      });

      return {
        persisted: true,
        transferred: true,
        reason: 'LinkedIn identity moved to the new Telegram account',
        user,
        linkedinAccount,
        profileDraft,
        profileSeed,
        identityImportedFields,
        inviteRewardResult,
        previousOwner: {
          userId: existingBySub.user_id,
          telegramUserId: existingBySub.telegram_user_id,
          telegramUsername: existingBySub.telegram_username,
          fullName: existingBySub.full_name
        }
      };
    }

    const profileBeforeSeed = await getProfileSnapshotByUserId(client, user.id);

    const linkedinAccount = existingBySub
      ? await refreshLinkedInAccountBySub(client, {
          linkedinSub: identity.linkedinSub,
          userId: user.id,
          identity,
          rawIdentityPayload
        })
      : await upsertLinkedInAccount(client, {
          userId: user.id,
          identity,
          rawIdentityPayload
        });

    const profileDraft = await ensureProfileDraft(client, {
      userId: user.id,
      identity
    });
    const profileSeed = buildProfileSeedMeta({
      beforeProfile: profileBeforeSeed,
      afterProfile: profileDraft,
      identity
    });
    const inviteRewardResult = await maybeCreatePendingInviteRewardForActivationWithClient(client, { userId: user.id });

    return {
      persisted: true,
      reason: existingBySub
        ? 'LinkedIn identity refreshed and profile draft ensured'
        : 'LinkedIn identity persisted and profile draft ensured',
      user,
      linkedinAccount,
      profileDraft,
      profileSeed,
      identityImportedFields,
      inviteRewardResult
    };
  });
}
