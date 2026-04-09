import * as render from '../../lib/telegram/render.js';
import { loadDirectoryCard, loadDirectoryPage } from '../../lib/storage/directoryStore.js';
import { loadDirectoryFilterState } from '../../lib/storage/directoryFilterStore.js';
import { loadIntroInboxState, loadIntroRequestDetailForTelegramUser } from '../../lib/storage/introRequestStore.js';
import { loadContactUnlockInboxState, loadContactUnlockRequestDetailForTelegramUser } from '../../lib/storage/contactUnlockStore.js';
import { loadDmInboxState, loadDmThreadDetailForTelegramUser } from '../../lib/storage/dmStore.js';
import { touchTelegramUserAndLoadProfile } from '../../lib/storage/profileStore.js';
import { loadNotificationOperatorSurface } from '../../lib/storage/notificationStore.js';
import { loadPricingSurfaceState } from '../../lib/storage/monetizationStore.js';
import { loadInviteSurfaceState } from '../../lib/storage/inviteStore.js';
import { loadProfileEditorState } from '../../lib/storage/profileEditStore.js';
import { isOperatorTelegramUser } from '../../config/env.js';
import { loadActiveAdminNotice } from '../../lib/storage/adminStore.js';


function fallbackRenderHelpText() {
  return [
    '❓ Help',
    '',
    'Use Intro Deck to connect your LinkedIn identity, complete a concise profile inside Telegram, browse listed professionals, manage your intro inbox, review gated DM requests, and open plans when you need direct contact.',
    '',
    'Shortcuts:',
    '• /profile — open your profile',
    '• /browse — browse the directory',
    '• /inbox — open your intro inbox',
    '• /dm — open your DM inbox',
    '• /plans — open pricing and Pro status',
    '• /invite — share your invite',
    '• /menu — return home'
  ].join('\n');
}

function fallbackRenderHelpKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🧩 Profile', callback_data: 'p:menu' },
        { text: '🌐 Browse directory', callback_data: 'dir:list:0' }
      ],
      [
        { text: '📥 Intro inbox', callback_data: 'intro:inbox' },
        { text: '💬 DM inbox', callback_data: 'dm:inbox' }
      ],
      [
        { text: '⭐ Plans', callback_data: 'plans:root' },
        { text: '📨 Invite contacts', callback_data: 'invite:root' }
      ],
      [{ text: '🏠 Home', callback_data: 'home:root' }]
    ]
  };
}

const renderHelpText = typeof render.renderHelpText === 'function' ? render.renderHelpText : fallbackRenderHelpText;
const renderHelpKeyboard = typeof render.renderHelpKeyboard === 'function' ? render.renderHelpKeyboard : fallbackRenderHelpKeyboard;
const renderDirectoryCardKeyboard = render.renderDirectoryCardKeyboard;
const renderDirectoryCardText = render.renderDirectoryCardText;
const renderDirectoryFiltersKeyboard = render.renderDirectoryFiltersKeyboard;
const renderDirectoryFiltersText = render.renderDirectoryFiltersText;
const renderContactUnlockDetailKeyboard = render.renderContactUnlockDetailKeyboard;
const renderContactUnlockDetailText = render.renderContactUnlockDetailText;
const renderIntroDetailKeyboard = render.renderIntroDetailKeyboard;
const renderIntroDetailText = render.renderIntroDetailText;
const renderIntroInboxKeyboard = render.renderIntroInboxKeyboard;
const renderIntroInboxText = render.renderIntroInboxText;
const renderDirectoryListKeyboard = render.renderDirectoryListKeyboard;
const renderDmInboxKeyboard = render.renderDmInboxKeyboard;
const renderDmInboxText = render.renderDmInboxText;
const renderDmThreadKeyboard = render.renderDmThreadKeyboard;
const renderDmThreadText = render.renderDmThreadText;
const renderDirectoryListText = render.renderDirectoryListText;
const renderHomeKeyboard = render.renderHomeKeyboard;
const renderHomeText = render.renderHomeText;
const renderOperatorDiagnosticsKeyboard = render.renderOperatorDiagnosticsKeyboard;
const renderOperatorDiagnosticsText = render.renderOperatorDiagnosticsText;
const renderProfileMenuKeyboard = render.renderProfileMenuKeyboard;
const renderProfileMenuText = render.renderProfileMenuText;
const renderProfilePreviewKeyboard = render.renderProfilePreviewKeyboard;
const renderProfilePreviewText = render.renderProfilePreviewText;
const renderProfileSkillsKeyboard = render.renderProfileSkillsKeyboard;
const renderProfileSkillsText = render.renderProfileSkillsText;
const renderPricingText = render.renderPricingText;
const renderPricingKeyboard = render.renderPricingKeyboard;
const renderInviteText = render.renderInviteText;
const renderInviteKeyboard = render.renderInviteKeyboard;
const renderInviteLinkText = render.renderInviteLinkText;
const renderInviteLinkKeyboard = render.renderInviteLinkKeyboard;
const renderInviteCardText = render.renderInviteCardText;
const renderInviteCardKeyboard = render.renderInviteCardKeyboard;
const renderInlineInviteCaption = render.renderInlineInviteCaption;
const renderInlineInviteShareText = render.renderInlineInviteShareText;


function noticeMatchesProfile(notice, profileSnapshot) {
  if (!notice?.isActive || !notice?.body) {
    return null;
  }

  const hasLinkedIn = Boolean(profileSnapshot?.linkedin_sub);
  const profileId = profileSnapshot?.profile_id || null;
  const profileState = profileSnapshot?.profile_state || null;
  const visibilityStatus = profileSnapshot?.visibility_status || 'hidden';
  const skillsReady = Boolean(profileSnapshot?.completion?.hasRequiredSkills);
  const lastSeenAt = profileSnapshot?.last_seen_at ? new Date(profileSnapshot.last_seen_at) : null;
  const isListedActive = visibilityStatus === 'listed' && lastSeenAt && !Number.isNaN(lastSeenAt.getTime())
    ? lastSeenAt.getTime() >= Date.now() - (14 * 24 * 60 * 60 * 1000)
    : false;
  const isListedInactive = visibilityStatus === 'listed' && !isListedActive;

  switch (notice.audienceKey) {
    case 'CONNECTED':
      return hasLinkedIn ? notice.body : null;
    case 'NOT_CONNECTED':
      return hasLinkedIn ? null : notice.body;
    case 'CONNECTED_NO_PROFILE':
      return hasLinkedIn && !profileId ? notice.body : null;
    case 'PROFILE_INCOMPLETE':
      return hasLinkedIn && profileState !== 'active' ? notice.body : null;
    case 'COMPLETE_NO_SKILLS':
      return profileState === 'active' && !skillsReady ? notice.body : null;
    case 'READY_NOT_LISTED':
      return profileState === 'active' && visibilityStatus !== 'listed' ? notice.body : null;
    case 'LISTED_ACTIVE':
      return profileState === 'active' && isListedActive ? notice.body : null;
    case 'LISTED_INACTIVE':
      return profileState === 'active' && isListedInactive ? notice.body : null;
    case 'LISTED':
      return profileState === 'active' && visibilityStatus === 'listed' ? notice.body : null;
    case 'ALL':
    default:
      return notice.body;
  }
}

function buildInvitePhotoUrl(appBaseUrl) {
  if (!appBaseUrl) {
    return null;
  }

  return new URL('/assets/social/intro-deck-og-1200x630.jpg', appBaseUrl).toString();
}

export function createSurfaceBuilders({ appBaseUrl, invitePhotoFileId = null }) {
  async function buildHomeSurface(ctx, homeExtraNotice = null) {
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

    const adminNoticeResult = storeResult.persistenceEnabled
      ? await loadActiveAdminNotice().catch(() => ({ persistenceEnabled: true, notice: null }))
      : { persistenceEnabled: false, notice: null };
    const activeNotice = noticeMatchesProfile(adminNoticeResult.notice, storeResult.profile);
    const combinedNotice = [activeNotice, homeExtraNotice].filter(Boolean).join('\n\n') || null;

    return {
      text: renderHomeText({
        profileSnapshot: storeResult.profile,
        persistenceEnabled: storeResult.persistenceEnabled,
        directoryStats: directoryResult ? { totalCount: directoryResult.totalCount || 0 } : null,
        introInboxStats: introInboxResult?.inbox?.counts || null,
        isOperator: isOperatorTelegramUser(ctx.from.id),
        notice: combinedNotice
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

  async function buildHelpSurface() {
    return {
      text: renderHelpText(),
      reply_markup: renderHelpKeyboard()
    };
  }

  async function buildPricingSurface(ctx) {
    const state = await loadPricingSurfaceState({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null
    }).catch((error) => ({
      persistenceEnabled: false,
      profile: null,
      subscription: null,
      recentReceipts: [],
      pricing: null,
      reason: String(error?.message || error)
    }));

    return {
      text: renderPricingText({ pricingState: state }),
      reply_markup: renderPricingKeyboard({ pricingState: state })
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

    const adminNoticeResult = state.persistenceEnabled
      ? await loadActiveAdminNotice().catch(() => ({ persistenceEnabled: true, notice: null }))
      : { persistenceEnabled: false, notice: null };
    const activeNotice = noticeMatchesProfile(adminNoticeResult.notice, state.profile);
    const combinedNotice = [activeNotice, notice].filter(Boolean).join('\n\n') || null;

    return {
      text: renderProfileMenuText({
        profileSnapshot: state.profile,
        persistenceEnabled: state.persistenceEnabled,
        notice: combinedNotice
      }),
      reply_markup: renderProfileMenuKeyboard({
        appBaseUrl,
        telegramUserId: ctx.from.id,
        profileSnapshot: state.profile,
        persistenceEnabled: state.persistenceEnabled
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

  const viewerState = state.persistenceEnabled
    ? await touchTelegramUserAndLoadProfile({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null
    }).catch(() => ({
      persistenceEnabled: true,
      profile: null,
      reason: 'viewer_profile_load_failed'
    }))
    : { persistenceEnabled: false, profile: null };

  return {
    text: renderDirectoryListText({
      profiles: state.profiles,
      page: state.page,
      totalCount: state.totalCount,
      persistenceEnabled: state.persistenceEnabled,
      filterSummary: state.filterSummary,
      viewerProfile: viewerState.profile,
      notice
    }),
    reply_markup: renderDirectoryListKeyboard({
      profiles: state.profiles,
      page: state.page,
      hasPrev: state.hasPrev,
      hasNext: state.hasNext,
      viewerProfile: viewerState.profile,
      filterSummary: state.filterSummary
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



  async function buildContactUnlockDetailSurface(ctx, requestId, notice = null) {
    const state = await loadContactUnlockRequestDetailForTelegramUser({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null,
      requestId
    }).catch((error) => {
      console.warn('[contact unlock detail] load failed', error?.message || error);
      return {
        persistenceEnabled: false,
        request: null,
        reason: 'contact_unlock_detail_load_failed'
      };
    });

    return {
      text: renderContactUnlockDetailText({
        persistenceEnabled: state.persistenceEnabled,
        request: state.request,
        notice
      }),
      reply_markup: renderContactUnlockDetailKeyboard({
        request: state.request
      })
    };
  }


  async function buildInviteSurface(ctx, notice = null) {
    const state = await loadInviteSurfaceState({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null
    }).catch((error) => ({
      persistenceEnabled: false,
      inviteCode: null,
      inviteLink: null,
      inlineInviteLink: null,
      inviteCardLink: null,
      shareInlineQuery: 'invite',
      invitePhotoUrl: buildInvitePhotoUrl(appBaseUrl),
      invitePhotoFileId,
      invitedCount: 0,
      activatedCount: 0,
      invitedBy: null,
      invited: [],
      reason: String(error?.message || error)
    }));

    return {
      text: renderInviteText({ inviteState: state, notice }),
      reply_markup: renderInviteKeyboard({ inviteState: state }),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
  }

  async function buildInviteLinkSurface(ctx) {
    const state = await loadInviteSurfaceState({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null
    }).catch((error) => ({
      persistenceEnabled: false,
      inviteCode: null,
      inviteLink: null,
      reason: String(error?.message || error)
    }));

    return {
      text: renderInviteLinkText({ inviteState: state }),
      reply_markup: renderInviteLinkKeyboard(),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
  }

  async function buildInviteCardMessage(ctx) {
    const state = await loadInviteSurfaceState({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null
    }).catch((error) => ({
      persistenceEnabled: false,
      inviteCode: null,
      inviteLink: null,
      inlineInviteLink: null,
      inviteCardLink: null,
      invitePhotoUrl: buildInvitePhotoUrl(appBaseUrl),
      invitePhotoFileId,
      invitedCount: 0,
      activatedCount: 0,
      invited: [],
      reason: String(error?.message || error)
    }));

    return {
      text: renderInviteCardText({ inviteState: state }),
      reply_markup: renderInviteCardKeyboard({ inviteState: state }),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      snapshot: {
        ...state,
        invitePhotoUrl: buildInvitePhotoUrl(appBaseUrl),
        invitePhotoFileId,
        inlineInviteCaption: renderInlineInviteCaption({ inviteState: state }),
        inlineShareText: renderInlineInviteShareText({ inviteState: state })
      }
    };
  }


  async function buildDmInboxSurface(ctx, notice = null) {
    const state = await loadDmInboxState({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null
    }).catch((error) => {
      console.warn('[dm inbox] load failed', error?.message || error);
      return {
        persistenceEnabled: false,
        inbox: null,
        reason: 'dm_inbox_load_failed'
      };
    });

    return {
      text: renderDmInboxText({
        persistenceEnabled: state.persistenceEnabled,
        inboxState: state.inbox,
        notice
      }),
      reply_markup: renderDmInboxKeyboard({
        inboxState: state.inbox
      })
    };
  }

  async function buildDmThreadSurface(ctx, threadId, notice = null) {
    const state = await loadDmThreadDetailForTelegramUser({
      telegramUserId: ctx.from.id,
      telegramUsername: ctx.from.username || null,
      threadId
    }).catch((error) => {
      console.warn('[dm thread] load failed', error?.message || error);
      return {
        persistenceEnabled: false,
        thread: null,
        reason: 'dm_thread_load_failed'
      };
    });

    return {
      text: renderDmThreadText({
        persistenceEnabled: state.persistenceEnabled,
        thread: state.thread,
        viewerTelegramUserId: ctx.from.id,
        notice
      }),
      reply_markup: renderDmThreadKeyboard({
        thread: state.thread
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

    const contactState = state.persistenceEnabled
      ? await loadContactUnlockInboxState({
        telegramUserId: ctx.from.id,
        telegramUsername: ctx.from.username || null
      }).catch((error) => {
        console.warn('[contact unlock inbox] load failed', error?.message || error);
        return { persistenceEnabled: true, inbox: null, reason: 'contact_unlock_inbox_load_failed' };
      })
      : { persistenceEnabled: false, inbox: null };

    return {
      text: renderIntroInboxText({
        persistenceEnabled: state.persistenceEnabled,
        inboxState: state.inbox,
        contactUnlockInbox: contactState.inbox,
        notice
      }),
      reply_markup: renderIntroInboxKeyboard({
        inboxState: state.inbox,
        contactUnlockInbox: contactState.inbox
      })
    };
  }

  return {
    buildHomeSurface,
    buildHelpSurface,
    buildInviteSurface,
    buildInviteLinkSurface,
    buildInviteCardMessage,
    buildPricingSurface,
    buildProfileMenuSurface,
    buildProfilePreviewSurface,
    buildProfileSkillsSurface,
    buildDirectoryListSurface,
    buildDirectoryCardSurface,
    buildDirectoryFiltersSurface,
    buildIntroDetailSurface,
    buildContactUnlockDetailSurface,
    buildIntroInboxSurface,
    buildDmInboxSurface,
    buildDmThreadSurface,
    buildOperatorDiagnosticsSurface
  };
}
