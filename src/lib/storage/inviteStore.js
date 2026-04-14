import { withDbClient, withDbTransaction, isDatabaseConfigured } from '../../db/pool.js';
import {
  createInviteAttribution,
  createPendingInviteActivationReward,
  ensureInviteRewardsDefaults,
  getInviteAttributionByInvitedUserId,
  getInviteRewardActivationStateByInvitedUserId,
  getInviteRewardSummaryByUserId,
  getInviteRewardsConfig,
  getInviteRewardsMode,
  getUserByTelegramUserId,
  loadAdminInviteSnapshot,
  loadInviteHistoryByUserId,
  loadInviteSnapshotByUserId,
  parseInviteStartParam
} from '../../db/inviteRepo.js';
import { upsertTelegramUser } from '../../db/usersRepo.js';
import { getTelegramConfig } from '../../config/env.js';

const INTRO_DECK_INVITE_ACTIVATION_HINT = 'the invited member connected LinkedIn or started a profile';
const INTRO_DECK_REWARDS_ACTIVATION_HINT = 'the invited member connected LinkedIn and reached listed-ready state';

function emptyInviteRewardsSummary(reason = 'DATABASE_URL is not configured') {
  return {
    persistenceEnabled: false,
    rewardsSummary: {
      mode: 'off',
      config: {
        activationPoints: 10,
        activationConfirmHours: 24,
        activationRuleVersion: 'introdeck_listed_ready_v1',
        catalogVersion: 'v1'
      },
      availablePoints: 0,
      pendingPoints: 0,
      redeemedPoints: 0,
      availableEntries: 0,
      pendingEntries: 0,
      redeemedEntries: 0
    },
    activationHint: INTRO_DECK_REWARDS_ACTIVATION_HINT,
    reason
  };
}

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

export async function maybeCreatePendingInviteRewardForActivationWithClient(client, { userId }) {
  await ensureInviteRewardsDefaults(client);
  const [mode, config, activationState] = await Promise.all([
    getInviteRewardsMode(client),
    getInviteRewardsConfig(client),
    getInviteRewardActivationStateByInvitedUserId(client, { invitedUserId: userId })
  ]);

  if (!['earn_only', 'live'].includes(mode)) {
    return {
      created: false,
      blocked: true,
      mode,
      config,
      activationState,
      reason: `rewards_mode_${mode}`
    };
  }

  if (!activationState.inviteId) {
    return {
      created: false,
      blocked: false,
      mode,
      config,
      activationState,
      reason: 'invite_attribution_missing'
    };
  }

  if (!activationState.rewardable) {
    return {
      created: false,
      blocked: false,
      mode,
      config,
      activationState,
      reason: activationState.reason || 'invite_activation_not_rewardable'
    };
  }

  const result = await createPendingInviteActivationReward(client, {
    referrerUserId: activationState.referrerUserId,
    invitedUserId: activationState.invitedUserId,
    inviteLinkId: activationState.inviteId,
    inviteCode: activationState.inviteCode,
    source: activationState.source,
    activationState,
    activationAt: activationState.activatedAt || new Date().toISOString(),
    points: config.activationPoints,
    confirmHours: config.activationConfirmHours,
    activationRuleVersion: config.activationRuleVersion,
    catalogVersion: config.catalogVersion
  });

  return {
    ...result,
    blocked: false,
    mode,
    config,
    activationState
  };
}

export async function recordInviteRewardableActivationForUserId({ userId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      created: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => ({
    persistenceEnabled: true,
    ...(await maybeCreatePendingInviteRewardForActivationWithClient(client, { userId }))
  }));
}

export async function loadInviteRewardsSummaryState({ telegramUserId, telegramUsername = null }) {
  if (!isDatabaseConfigured()) {
    return emptyInviteRewardsSummary();
  }

  return withDbClient(async (client) => {
    const user = await upsertTelegramUser(client, {
      telegramUserId,
      telegramUsername
    });

    const rewardsSummary = await getInviteRewardSummaryByUserId(client, { userId: user.id });
    return {
      persistenceEnabled: true,
      rewardsSummary,
      activationHint: INTRO_DECK_REWARDS_ACTIVATION_HINT,
      reason: 'invite_rewards_summary_loaded'
    };
  });
}
