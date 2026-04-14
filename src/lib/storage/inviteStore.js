import { withDbClient, withDbTransaction, isDatabaseConfigured } from '../../db/pool.js';
import {
  appendInviteRewardsModeAudit,
  createInviteAttribution,
  createInviteRewardRedemptionRequest,
  createPendingInviteActivationReward,
  createRedeemDebitLedgerEntry,
  createInviteRewardSettlementRun,
  ensureInviteRewardsDefaults,
  failInviteRewardRedemption,
  finalizeInviteRewardSettlementRun,
  getAdminInviteRewardsSnapshot,
  getInviteRewardReconciliationSnapshot,
  getLastInviteRewardSettlementRun,
  getInviteAttributionByInvitedUserId,
  getInviteRewardActivationStateByInvitedUserId,
  getInviteRewardRedemptionById,
  getInviteRewardSummaryByUserId,
  confirmInviteRewardEventToAvailable,
  rejectInviteRewardEvent,
  getInviteRewardsCatalog,
  getInviteRewardsConfig,
  getInviteRewardsMode,
  getRecentInviteRewardsModeAudit,
  getRedeemCatalogItemByCode,
  getSpendableInviteRewardBalance,
  getUserByTelegramUserId,
  listInviteRewardEventsByUserId,
  listPendingInviteRewardConfirmationCandidates,
  loadAdminInviteSnapshot,
  loadInviteHistoryByUserId,
  loadInviteSnapshotByUserId,
  parseInviteStartParam,
  setInviteRewardsMode,
  completeInviteRewardRedemption
} from '../../db/inviteRepo.js';
import { activateOrExtendProSubscription } from '../../db/monetizationRepo.js';
import { upsertTelegramUser } from '../../db/usersRepo.js';
import { getTelegramConfig } from '../../config/env.js';

const INTRO_DECK_INVITE_ACTIVATION_HINT = 'the invited member connected LinkedIn or started a profile';
const INTRO_DECK_REWARDS_ACTIVATION_HINT = 'the invited member connected LinkedIn and reached listed-ready state';
const INVITE_REWARDS_SETTLEMENT_BATCH_LIMIT = 25;

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


function emptyInviteRedeemState(reason = 'DATABASE_URL is not configured') {
  return {
    persistenceEnabled: false,
    mode: 'off',
    canRedeem: false,
    blockedReason: reason,
    catalog: getInviteRewardsCatalog(),
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
    latestRedemption: null,
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
    const rewardsSummary = await getInviteRewardSummaryByUserId(client, { userId: user.id });

    return {
      persistenceEnabled: true,
      ...snapshot,
      rewardsSummary,
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
      rewards: {
        mode: 'off',
        config: {
          activationPoints: 10,
          activationConfirmHours: 24,
          activationRuleVersion: 'introdeck_listed_ready_v1',
          catalogVersion: 'v1'
        },
        totals: {
          pendingPoints: 0,
          availablePoints: 0,
          redeemedPoints: 0,
          pendingEntries: 0,
          availableEntries: 0,
          redeemedEntries: 0,
          totalRewardEvents: 0,
          pendingCandidates: 0,
          pendingDue: 0,
          confirmedToday: 0,
          rejectedToday: 0
        },
        topRewardInviters: [],
        recentRewardEvents: [],
        lastSettlementRun: null,
        reconciliation: {
          warningCount: 0,
          warnings: {},
          completedRedemptions: 0,
          sampleWarnings: []
        }
      },
      activationHint: INTRO_DECK_INVITE_ACTIVATION_HINT,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    const [snapshot, rewards] = await Promise.all([
      loadAdminInviteSnapshot(client),
      getAdminInviteRewardsSnapshot(client)
    ]);
    return {
      persistenceEnabled: true,
      snapshot,
      rewards,
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


export async function loadInviteRedeemReadModel({ telegramUserId, telegramUsername = null }) {
  if (!isDatabaseConfigured()) {
    return emptyInviteRedeemState();
  }

  return withDbClient(async (client) => {
    const user = await upsertTelegramUser(client, {
      telegramUserId,
      telegramUsername
    });

    const [mode, rewardsSummary, recentEvents] = await Promise.all([
      getInviteRewardsMode(client),
      getInviteRewardSummaryByUserId(client, { userId: user.id }),
      listInviteRewardEventsByUserId(client, { userId: user.id, limit: 5 })
    ]);

    const catalog = getInviteRewardsCatalog().map((item) => ({
      ...item,
      affordable: (Number(rewardsSummary.availablePoints || 0) || 0) >= item.pointsCost
    }));

    return {
      persistenceEnabled: true,
      userId: user.id,
      mode,
      canRedeem: mode === 'live',
      blockedReason: mode === 'earn_only' ? 'redeem_not_live_in_earn_only' : (mode === 'paused' ? 'rewards_paused' : (mode === 'off' ? 'rewards_off' : null)),
      catalog,
      rewardsSummary,
      recentEvents,
      activationHint: INTRO_DECK_REWARDS_ACTIVATION_HINT,
      reason: 'invite_redeem_read_model_loaded'
    };
  });
}

export async function beginInviteRewardRedemptionForTelegramUser({ telegramUserId, telegramUsername = null, catalogCode }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      created: false,
      blocked: true,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    const mode = await getInviteRewardsMode(client);
    if (mode !== 'live') {
      return { persistenceEnabled: true, created: false, blocked: true, mode, reason: `redeem_not_available_in_${mode}` };
    }

    const catalogItem = getRedeemCatalogItemByCode(catalogCode);
    if (!catalogItem) {
      return { persistenceEnabled: true, created: false, blocked: true, mode, reason: 'catalog_item_not_found' };
    }

    const summary = await getInviteRewardSummaryByUserId(client, { userId: user.id });
    if ((Number(summary.availablePoints || 0) || 0) < catalogItem.pointsCost) {
      return { persistenceEnabled: true, created: false, blocked: true, mode, summary, catalogItem, reason: 'insufficient_available_points' };
    }

    const redemption = await createInviteRewardRedemptionRequest(client, {
      userId: user.id,
      catalogCode: catalogItem.code,
      pointsCost: catalogItem.pointsCost,
      proDays: catalogItem.proDays,
      meta: { source: 'telegram_invite_rewards', stage: 'confirm_pending' }
    });

    return {
      persistenceEnabled: true,
      created: true,
      blocked: false,
      mode,
      summary,
      catalogItem,
      redemption,
      reason: 'invite_reward_redemption_requested'
    };
  });
}

export async function confirmInviteRewardRedemptionForTelegramUser({ telegramUserId, telegramUsername = null, redemptionId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      changed: false,
      blocked: true,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    await client.query('select pg_advisory_xact_lock($1)', [Number(user.id)]);

    const redemption = await getInviteRewardRedemptionById(client, { redemptionId, userId: user.id, forUpdate: true });
    if (!redemption) {
      return { persistenceEnabled: true, changed: false, blocked: true, reason: 'redemption_not_found' };
    }

    if (redemption.status === 'completed') {
      return { persistenceEnabled: true, changed: false, duplicate: true, blocked: false, redemption, reason: 'redemption_already_completed' };
    }

    if (redemption.status === 'failed') {
      return { persistenceEnabled: true, changed: false, blocked: true, redemption, reason: redemption.failureReason || 'redemption_already_failed' };
    }

    const mode = await getInviteRewardsMode(client);
    if (mode !== 'live') {
      const failed = await failInviteRewardRedemption(client, {
        redemptionId: redemption.redemptionId,
        failureReason: `redeem_not_available_in_${mode}`,
        meta: { stage: 'confirm', mode }
      });
      return { persistenceEnabled: true, changed: false, blocked: true, mode, redemption: failed, reason: `redeem_not_available_in_${mode}` };
    }

    const catalogItem = getRedeemCatalogItemByCode(redemption.catalogCode);
    if (!catalogItem) {
      const failed = await failInviteRewardRedemption(client, {
        redemptionId: redemption.redemptionId,
        failureReason: 'catalog_item_not_found',
        meta: { stage: 'confirm' }
      });
      return { persistenceEnabled: true, changed: false, blocked: true, redemption: failed, reason: 'catalog_item_not_found' };
    }

    const availablePoints = await getSpendableInviteRewardBalance(client, { userId: user.id });
    if (availablePoints < catalogItem.pointsCost) {
      const failed = await failInviteRewardRedemption(client, {
        redemptionId: redemption.redemptionId,
        failureReason: 'insufficient_available_points',
        meta: { stage: 'confirm', availablePoints }
      });
      return { persistenceEnabled: true, changed: false, blocked: true, redemption: failed, reason: 'insufficient_available_points', availablePoints };
    }

    const ledgerEntry = await createRedeemDebitLedgerEntry(client, {
      userId: user.id,
      pointsCost: catalogItem.pointsCost,
      meta: {
        source: 'invite_rewards_redeem',
        catalogCode: catalogItem.code,
        proDays: catalogItem.proDays,
        redemptionId: redemption.redemptionId
      }
    });

    const subscription = await activateOrExtendProSubscription(client, {
      userId: user.id,
      durationDays: catalogItem.proDays,
      source: 'invite_rewards',
      telegramPaymentChargeId: null,
      providerPaymentChargeId: null,
      lastReceiptId: null,
      planCode: 'pro_monthly'
    });

    const completed = await completeInviteRewardRedemption(client, {
      redemptionId: redemption.redemptionId,
      rewardLedgerEntryId: ledgerEntry?.id || null,
      subscriptionId: subscription?.subscriptionId || null,
      receiptId: null,
      meta: {
        catalogCode: catalogItem.code,
        proDays: catalogItem.proDays,
        source: 'invite_rewards_redeem'
      }
    });

    const rewardsSummary = await getInviteRewardSummaryByUserId(client, { userId: user.id });

    return {
      persistenceEnabled: true,
      changed: true,
      blocked: false,
      duplicate: false,
      mode,
      redemption: completed,
      catalogItem,
      subscription,
      rewardsSummary,
      reason: 'invite_reward_redemption_completed'
    };
  });
}

export async function changeInviteRewardsModeForTelegramUser({ telegramUserId, telegramUsername = null, toMode, reason = null }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      changed: false,
      blocked: true,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbTransaction(async (client) => {
    const user = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
    const result = await setInviteRewardsMode(client, {
      mode: toMode,
      updatedBy: `tg:${user.telegram_user_id}`,
      changedByUserId: user.id,
      reason,
      meta: { source: 'telegram_admin_invite_controls' }
    });

    return {
      persistenceEnabled: true,
      ...result,
      modeAudit: await getRecentInviteRewardsModeAudit(client, { limit: 5 }),
      reason: result.changed ? 'invite_rewards_mode_changed' : 'invite_rewards_mode_unchanged'
    };
  });
}

async function doesInvitedUserStillQualifyForRewardSettlementWithClient(client, { invitedUserId }) {
  const activationState = await getInviteRewardActivationStateByInvitedUserId(client, { invitedUserId });
  return {
    qualifies: Boolean(activationState?.rewardable),
    activationState,
    reason: activationState?.rewardable ? 'rewardable_activation' : (activationState?.reason || 'invite_activation_not_rewardable')
  };
}

export async function doesInvitedUserStillQualifyForRewardSettlement({ invitedUserId }) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      qualifies: false,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => ({
    persistenceEnabled: true,
    ...(await doesInvitedUserStillQualifyForRewardSettlementWithClient(client, { invitedUserId }))
  }));
}

export async function settlePendingInviteRewardsBatch({ telegramUserId, telegramUsername = null, limit = INVITE_REWARDS_SETTLEMENT_BATCH_LIMIT } = {}) {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      changed: false,
      blocked: true,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => {
    await client.query('BEGIN');
    try {
      const operator = await upsertTelegramUser(client, { telegramUserId, telegramUsername });
      await ensureInviteRewardsDefaults(client);
      const mode = await getInviteRewardsMode(client);
      if (mode === 'paused') {
        await client.query('ROLLBACK');
        return {
          persistenceEnabled: true,
          changed: false,
          blocked: true,
          mode,
          reason: 'settlement_blocked_in_paused'
        };
      }

      const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
        ? Math.min(100, Number(limit))
        : INVITE_REWARDS_SETTLEMENT_BATCH_LIMIT;

      const run = await createInviteRewardSettlementRun(client, {
        modeSnapshot: mode,
        meta: {
          source: 'telegram_admin_invite_settlement',
          triggeredByUserId: operator.id,
          triggeredByTelegramUserId: operator.telegram_user_id,
          limit: safeLimit
        }
      });

      const candidates = await listPendingInviteRewardConfirmationCandidates(client, { limit: safeLimit });
      const decisions = [];
      let processedCount = 0;
      let confirmedCount = 0;
      let rejectedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      for (const candidate of candidates) {
        const qualification = await doesInvitedUserStillQualifyForRewardSettlementWithClient(client, {
          invitedUserId: candidate.invitedUserId
        });

        if (!qualification.qualifies) {
          const rejected = await rejectInviteRewardEvent(client, {
            rewardEventId: candidate.rewardEventId,
            rejectReason: qualification.reason,
            settlementRunId: run?.settlementRunId || null,
            meta: {
              source: 'telegram_admin_invite_settlement',
              triggeredByUserId: operator.id,
              qualificationReason: qualification.reason
            }
          });
          if (rejected.changed) {
            processedCount += 1;
            rejectedCount += 1;
          } else {
            skippedCount += 1;
          }
          decisions.push({
            rewardEventId: candidate.rewardEventId,
            invitedUserId: candidate.invitedUserId,
            outcome: rejected.changed ? 'rejected' : 'skipped',
            reason: qualification.reason
          });
          continue;
        }

        const confirmed = await confirmInviteRewardEventToAvailable(client, {
          rewardEventId: candidate.rewardEventId,
          settlementRunId: run?.settlementRunId || null,
          meta: {
            source: 'telegram_admin_invite_settlement',
            triggeredByUserId: operator.id,
            qualificationReason: qualification.reason
          }
        });
        if (confirmed.changed) {
          processedCount += 1;
          confirmedCount += 1;
        } else {
          skippedCount += 1;
        }
        decisions.push({
          rewardEventId: candidate.rewardEventId,
          invitedUserId: candidate.invitedUserId,
          outcome: confirmed.changed ? 'confirmed' : 'skipped',
          reason: qualification.reason
        });
      }

      const finalizedRun = await finalizeInviteRewardSettlementRun(client, {
        runId: run?.settlementRunId,
        status: 'completed',
        processedCount,
        confirmedCount,
        rejectedCount,
        skippedCount,
        errorCount,
        meta: {
          triggeredByUserId: operator.id,
          candidateCount: candidates.length,
          mode,
          decisionsPreview: decisions.slice(0, 10)
        }
      });

      const verification = await getAdminInviteRewardsSnapshot(client);
      await client.query('COMMIT');

      return {
        persistenceEnabled: true,
        changed: processedCount > 0,
        blocked: false,
        mode,
        run: finalizedRun,
        decisions,
        rewards: verification,
        reason: 'invite_rewards_settlement_completed'
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

export async function loadInviteRewardsReconciliationState() {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      reconciliation: {
        warningCount: 0,
        warnings: {},
        completedRedemptions: 0,
        sampleWarnings: []
      },
      lastSettlementRun: null,
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => ({
    persistenceEnabled: true,
    reconciliation: await getInviteRewardReconciliationSnapshot(client, { sampleLimit: 10 }),
    lastSettlementRun: await getLastInviteRewardSettlementRun(client),
    reason: 'invite_rewards_reconciliation_loaded'
  }));
}

export async function loadFounderInviteRewardsLiveVerificationState() {
  if (!isDatabaseConfigured()) {
    return {
      persistenceEnabled: false,
      rewards: {
        mode: 'off',
        totals: {
          pendingCandidates: 0,
          pendingDue: 0,
          confirmedToday: 0,
          rejectedToday: 0
        },
        lastSettlementRun: null,
        reconciliation: {
          warningCount: 0,
          warnings: {},
          completedRedemptions: 0,
          sampleWarnings: []
        }
      },
      reason: 'DATABASE_URL is not configured'
    };
  }

  return withDbClient(async (client) => ({
    persistenceEnabled: true,
    rewards: await getAdminInviteRewardsSnapshot(client),
    reason: 'invite_rewards_live_verification_loaded'
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

    const [rewardsSummary, recentEvents] = await Promise.all([
      getInviteRewardSummaryByUserId(client, { userId: user.id }),
      listInviteRewardEventsByUserId(client, { userId: user.id, limit: 5 })
    ]);

    return {
      persistenceEnabled: true,
      rewardsSummary,
      recentEvents,
      activationHint: INTRO_DECK_REWARDS_ACTIVATION_HINT,
      reason: 'invite_rewards_summary_loaded'
    };
  });
}
