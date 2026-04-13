import { withDbClient, withDbTransaction, isDatabaseConfigured } from '../../db/pool.js';
import { createInviteAttribution, getInviteAttributionByInvitedUserId, getUserByTelegramUserId, loadAdminInviteSnapshot, loadInviteHistoryByUserId, loadInviteSnapshotByUserId, parseInviteStartParam } from '../../db/inviteRepo.js';
import { upsertTelegramUser } from '../../db/usersRepo.js';
import { getTelegramConfig } from '../../config/env.js';
const INTRO_DECK_INVITE_ACTIVATION_HINT = 'the invited member connected LinkedIn or started a profile';


export async function loadInviteSurfaceState({ telegramUserId, telegramUsername = null, recentLimit = 3 }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      inviteCode: null,
      inviteLink: null,
      inlineInviteLink: null,
      inviteCardLink: null,
      shareInlineQuery: 'invite',
      invitedCount: 0,
      activatedCount: 0,
      invitedBy: null,
      invited: [],
      hasMoreInvites: false,
      activationHint: INTRO_DECK_INVITE_ACTIVATION_HINT,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const user = await upsertTelegramUser(client, {
      telegramUserId,
      telegramUsername
    });

    const snapshot = await loadInviteSnapshotByUserId(client, {
      userId: user.id,
      telegramUserId: user.telegram_user_id,
      botUsername: getTelegramConfig().botUsername,
      recentLimit
    });

    return {
      persistenceEnabled: true,
      ...snapshot,
      activationHint: INTRO_DECK_INVITE_ACTIVATION_HINT,
      reason: 'invite_snapshot_loaded'
    };
  });
}

export async function attemptInviteAttributionForTelegramUser({ telegramUserId, telegramUsername = null, startParam = null }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      created: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const parsed = parseInviteStartParam(startParam);
    if (!parsed) {
      return {
        persistenceEnabled: true,
        created: false,
        ignored: true,
        reason: 'start_param_not_invite'
      };
    }

    const invitedUser = await upsertTelegramUser(client, {
      telegramUserId,
      telegramUsername
    });

    if (String(invitedUser.telegram_user_id) === String(parsed.referrerTelegramUserId)) {
      return {
        persistenceEnabled: true,
        created: false,
        invalid: true,
        reason: 'self_referral'
      };
    }

    const existing = await getInviteAttributionByInvitedUserId(client, invitedUser.id);
    if (existing) {
      return {
        persistenceEnabled: true,
        created: false,
        alreadyLinked: true,
        reason: 'already_linked',
        invitedBy: existing.invitedBy || null
      };
    }

    if (!invitedUser.inserted) {
      return {
        persistenceEnabled: true,
        created: false,
        existingUser: true,
        reason: 'existing_user_not_eligible'
      };
    }

    const referrerUser = await getUserByTelegramUserId(client, parsed.referrerTelegramUserId);
    if (!referrerUser) {
      return {
        persistenceEnabled: true,
        created: false,
        invalid: true,
        reason: 'unknown_referrer'
      };
    }

    const attribution = await createInviteAttribution(client, {
      referrerUserId: referrerUser.id,
      invitedUserId: invitedUser.id,
      inviteCode: parsed.inviteCode,
      source: parsed.source,
      startParam: parsed.raw
    });

    const linked = await getInviteAttributionByInvitedUserId(client, invitedUser.id);

    return {
      persistenceEnabled: true,
      created: true,
      reason: 'invite_linked',
      inviteId: attribution.inviteId,
      invitedBy: linked?.invitedBy || null,
      source: parsed.source
    };
  });
}


export async function loadInviteHistoryState({ telegramUserId, telegramUsername = null, page = 1 }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      snapshot: {
        inviteCode: null,
        inviteLink: null,
        inlineInviteLink: null,
        inviteCardLink: null,
        shareInlineQuery: 'invite',
        invitedCount: 0,
        activatedCount: 0,
        invitedBy: null,
        invited: [],
        hasMoreInvites: false,
        activationHint: INTRO_DECK_INVITE_ACTIVATION_HINT
      },
      history: {
        totalCount: 0,
        page: 1,
        pageSize: 10,
        totalPages: 1,
        hasPrev: false,
        hasNext: false,
        startIndex: 0,
        endIndex: 0,
        items: []
      },
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const user = await upsertTelegramUser(client, {
      telegramUserId,
      telegramUsername
    });

    const snapshot = await loadInviteSnapshotByUserId(client, {
      userId: user.id,
      telegramUserId: user.telegram_user_id,
      botUsername: getTelegramConfig().botUsername,
      recentLimit: 3
    });

    const history = await loadInviteHistoryByUserId(client, {
      userId: user.id,
      page
    });

    return {
      persistenceEnabled: true,
      snapshot: {
        ...snapshot,
        activationHint: INTRO_DECK_INVITE_ACTIVATION_HINT
      },
      history,
      reason: 'invite_history_loaded'
    };
  });
}

export async function loadAdminInviteSnapshotState() {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      snapshot: {
        summary: {
          totalInvites: 0,
          activatedInvites: 0,
          activationRate: 0,
          inlineShareCount: 0,
          rawLinkCount: 0,
          inviteCardCount: 0,
          joined7d: 0,
          activated7d: 0
        },
        topInviters: [],
        recentInvites: []
      },
      activationHint: INTRO_DECK_INVITE_ACTIVATION_HINT,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const snapshot = await loadAdminInviteSnapshot(client);
    return {
      persistenceEnabled: true,
      snapshot,
      activationHint: INTRO_DECK_INVITE_ACTIVATION_HINT,
      reason: 'admin_invite_snapshot_loaded'
    };
  });
}
