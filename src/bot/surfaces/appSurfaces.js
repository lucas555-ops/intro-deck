import {
  renderDirectoryCardKeyboard,
  renderDirectoryCardText,
  renderDirectoryFiltersKeyboard,
  renderDirectoryFiltersText,
  renderIntroDetailKeyboard,
  renderIntroDetailText,
  renderIntroInboxKeyboard,
  renderIntroInboxText,
  renderDirectoryListKeyboard,
  renderDirectoryListText,
  renderHomeKeyboard,
  renderHomeText,
  renderOperatorDiagnosticsKeyboard,
  renderOperatorDiagnosticsText,
  renderProfileMenuKeyboard,
  renderProfileMenuText,
  renderProfilePreviewKeyboard,
  renderProfilePreviewText,
  renderProfileSkillsKeyboard,
  renderProfileSkillsText
} from '../../lib/telegram/render.js';
import { loadDirectoryCard, loadDirectoryPage } from '../../lib/storage/directoryStore.js';
import { loadDirectoryFilterState } from '../../lib/storage/directoryFilterStore.js';
import { loadIntroInboxState, loadIntroRequestDetailForTelegramUser } from '../../lib/storage/introRequestStore.js';
import { touchTelegramUserAndLoadProfile } from '../../lib/storage/profileStore.js';
import { loadNotificationOperatorSurface } from '../../lib/storage/notificationStore.js';
import { loadProfileEditorState } from '../../lib/storage/profileEditStore.js';
import { isOperatorTelegramUser } from '../../config/env.js';

export function createSurfaceBuilders({ appBaseUrl }) {
  async function buildHomeSurface(ctx) {
    const storeResult = await touchTelegramUserAndLoadProfile({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null
    }).catch((error) => {
      console.warn('[home surface] profile load skipped', error?.message || error);
      return {
        persistenceEnabled: false,
        profile: null,
        reason: 'profile_load_failed'
      };
    });

    const directoryResult = storeResult.persistenceEnabled
      ? await loadDirectoryPage({ page: 0, viewerTelegramUserId: ctx.from.id }).catch((error) => ({
        persistenceEnabled: true,
        profiles: [],
        totalCount: 0,
        hasPrev: false,
        hasNext: false,
        reason: String(error?.message || error)
      }))
      : null;

    const introInboxResult = storeResult.persistenceEnabled
      ? await loadIntroInboxState({
        telegramUserId: ctx.from.id,
        telegramUsername: ctx.from.username || null
      }).catch((error) => ({
        persistenceEnabled: true,
        inbox: null,
        reason: String(error?.message || error)
      }))
      : null;

    return {
      text: renderHomeText({
        profileSnapshot: storeResult.profile,
        persistenceEnabled: storeResult.persistenceEnabled,
        directoryStats: directoryResult ? { totalCount: directoryResult.totalCount || 0 } : null,
        introInboxStats: introInboxResult?.inbox?.counts || null,
        isOperator: isOperatorTelegramUser(ctx.from.id)
      }),
      reply_markup: renderHomeKeyboard({
        appBaseUrl,
        telegramUserId: ctx.from.id,
        profileSnapshot: storeResult.profile,
        persistenceEnabled: storeResult.persistenceEnabled,
        isOperator: isOperatorTelegramUser(ctx.from.id)
      })
    };
  }

  async function buildProfileMenuSurface(ctx, notice = null) {
    const state = await loadProfileEditorState({
      telegramUserId: ctx.from.id
    }).catch((error) => {
      console.warn('[profile menu] load failed', error?.message || error);
      return {
        persistenceEnabled: false,
        profile: null,
        reason: 'profile_menu_load_failed'
      };
    });

    return {
      text: renderProfileMenuText({
        profileSnapshot: state.profile,
        persistenceEnabled: state.persistenceEnabled,
        notice
      }),
      reply_markup: renderProfileMenuKeyboard({
        profileSnapshot: state.profile
      })
    };
  }

  async function buildProfilePreviewSurface(ctx, notice = null) {
    const state = await loadProfileEditorState({
      telegramUserId: ctx.from.id
    }).catch((error) => {
      console.warn('[profile preview] load failed', error?.message || error);
      return {
        persistenceEnabled: false,
        profile: null,
        reason: 'profile_preview_load_failed'
      };
    });

    return {
      text: renderProfilePreviewText({
        profileSnapshot: state.profile,
        persistenceEnabled: state.persistenceEnabled,
        notice
      }),
      reply_markup: renderProfilePreviewKeyboard()
    };
  }

  async function buildProfileSkillsSurface(ctx, notice = null) {
    const state = await loadProfileEditorState({
      telegramUserId: ctx.from.id
    }).catch((error) => {
      console.warn('[profile skills] load failed', error?.message || error);
      return {
        persistenceEnabled: false,
        profile: null,
        reason: 'profile_skills_load_failed'
      };
    });

    return {
      text: renderProfileSkillsText({
        profileSnapshot: state.profile,
        persistenceEnabled: state.persistenceEnabled,
        notice
      }),
      reply_markup: renderProfileSkillsKeyboard({
        profileSnapshot: state.profile
      })
    };
  }

  async function buildDirectoryListSurface(ctx, page = 0, notice = null) {
    const state = await loadDirectoryPage({
      page,
      viewerTelegramUserId: ctx.from.id
    }).catch((error) => {
      console.warn('[directory list] load failed', error?.message || error);
      return {
        persistenceEnabled: false,
        page: 0,
        profiles: [],
        totalCount: 0,
        hasPrev: false,
        hasNext: false,
        filterSummary: null,
        reason: 'directory_list_load_failed'
      };
    });

    return {
      text: renderDirectoryListText({
        profiles: state.profiles,
        page: state.page,
        totalCount: state.totalCount,
        persistenceEnabled: state.persistenceEnabled,
        filterSummary: state.filterSummary,
        notice
      }),
      reply_markup: renderDirectoryListKeyboard({
        profiles: state.profiles,
        page: state.page,
        hasPrev: state.hasPrev,
        hasNext: state.hasNext
      })
    };
  }

  async function buildDirectoryCardSurface(ctx, profileId, page = 0, notice = null) {
    const state = await loadDirectoryCard({
      profileId,
      viewerTelegramUserId: ctx.from.id
    }).catch((error) => {
      console.warn('[directory card] load failed', error?.message || error);
      return {
        persistenceEnabled: false,
        profile: null,
        reason: 'directory_card_load_failed'
      };
    });

    return {
      text: renderDirectoryCardText({
        profileSnapshot: state.profile,
        persistenceEnabled: state.persistenceEnabled,
        notice
      }),
      reply_markup: renderDirectoryCardKeyboard({ profileSnapshot: state.profile, page })
    };
  }

  async function buildDirectoryFiltersSurface(ctx, notice = null) {
    const state = await loadDirectoryFilterState({
      telegramUserId: ctx.from.id
    }).catch((error) => {
      console.warn('[directory filters] load failed', error?.message || error);
      return {
        persistenceEnabled: false,
        filterSummary: null,
        reason: 'directory_filters_load_failed'
      };
    });

    return {
      text: renderDirectoryFiltersText({
        persistenceEnabled: state.persistenceEnabled,
        filterSummary: state.filterSummary,
        notice
      }),
      reply_markup: renderDirectoryFiltersKeyboard({
        filterSummary: state.filterSummary
      })
    };
  }

  async function buildIntroDetailSurface(ctx, introRequestId, notice = null) {
    const state = await loadIntroRequestDetailForTelegramUser({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null,
      introRequestId
    }).catch((error) => {
      console.warn('[intro detail] load failed', error?.message || error);
      return {
        persistenceEnabled: false,
        introRequest: null,
        reason: 'intro_detail_load_failed'
      };
    });

    return {
      text: renderIntroDetailText({
        persistenceEnabled: state.persistenceEnabled,
        introRequest: state.introRequest,
        notice
      }),
      reply_markup: renderIntroDetailKeyboard({
        introRequest: state.introRequest
      })
    };
  }


  async function buildOperatorDiagnosticsSurface(ctx, { bucket = null, introRequestId = null, notice = null } = {}) {
    const allowed = isOperatorTelegramUser(ctx.from.id);
    if (!allowed) {
      return {
        text: renderOperatorDiagnosticsText({ allowed: false, notice }),
        reply_markup: renderOperatorDiagnosticsKeyboard({ allowed: false })
      };
    }

    const state = await loadNotificationOperatorSurface({ bucket, introRequestId }).catch((error) => ({
      persistenceEnabled: false,
      reason: String(error?.message || error),
      bucket,
      introRequestId,
      diagnostics: null,
      hotRetryDue: [],
      hotFailed: [],
      hotExhausted: []
    }));

    return {
      text: renderOperatorDiagnosticsText({
        allowed: true,
        persistenceEnabled: state.persistenceEnabled,
        diagnostics: state.diagnostics,
        bucket: state.bucket,
        introRequestId: state.introRequestId,
        hotRetryDue: state.hotRetryDue,
        hotFailed: state.hotFailed,
        hotExhausted: state.hotExhausted,
        notice
      }),
      reply_markup: renderOperatorDiagnosticsKeyboard({
        allowed: true,
        bucket: state.bucket,
        introRequestId: state.introRequestId,
        diagnostics: state.diagnostics,
        hotRetryDue: state.hotRetryDue,
        hotFailed: state.hotFailed,
        hotExhausted: state.hotExhausted
      })
    };
  }

  async function buildIntroInboxSurface(ctx, notice = null) {
    const state = await loadIntroInboxState({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null
    }).catch((error) => {
      console.warn('[intro inbox] load failed', error?.message || error);
      return {
        persistenceEnabled: false,
        inbox: null,
        reason: 'intro_inbox_load_failed'
      };
    });

    return {
      text: renderIntroInboxText({
        persistenceEnabled: state.persistenceEnabled,
        inboxState: state.inbox,
        notice
      }),
      reply_markup: renderIntroInboxKeyboard({
        inboxState: state.inbox
      })
    };
  }

  return {
    buildHomeSurface,
    buildProfileMenuSurface,
    buildProfilePreviewSurface,
    buildProfileSkillsSurface,
    buildDirectoryListSurface,
    buildDirectoryCardSurface,
    buildDirectoryFiltersSurface,
    buildIntroDetailSurface,
    buildIntroInboxSurface,
    buildOperatorDiagnosticsSurface
  };
}
