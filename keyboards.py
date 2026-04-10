#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Telegram keyboard helpers for Roll Duel."""

import json
import os
from typing import List, Optional
from urllib.parse import quote, urlencode

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, KeyboardButton, ReplyKeyboardMarkup, WebAppInfo

BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "rollduelbot").strip().lstrip("@") or "rollduelbot"


def _build_telegram_share_url(url: str, text: str) -> str:
    params = {}
    normalized_url = str(url or '').strip()
    normalized_text = str(text or '').strip()
    if normalized_url:
        params["url"] = normalized_url
    if normalized_text:
        params["text"] = normalized_text
    return f"https://t.me/share/url?{urlencode(params)}" if params else "https://t.me/share/url"


def _share_button(label: str, payload: Optional[dict]) -> Optional[InlineKeyboardButton]:
    if not payload:
        return None
    composer_text = str(payload.get("composerText") or '').strip()
    share_url = str(payload.get("url") or '').strip()
    share_text = composer_text or str(payload.get("text") or '').strip()
    if not share_url and not share_text:
        return None
    if composer_text:
        share_url = ''
    return InlineKeyboardButton(label, url=_build_telegram_share_url(share_url, share_text))


def _resolve_app_origin(app_base_url: Optional[str] = None) -> Optional[str]:
    candidate = (app_base_url or "").strip().rstrip("/")
    if candidate:
        return candidate

    for env_name in ("APP_BASE_URL", "PUBLIC_BASE_URL", "RAILWAY_STATIC_URL"):
        candidate = os.getenv(env_name, "").strip().rstrip("/")
        if candidate:
            return candidate

    railway_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN", "").strip().strip("/")
    if railway_domain:
        return f"https://{railway_domain}"

    return None


def _resolve_miniapp_url(app_base_url: Optional[str] = None) -> Optional[str]:
    explicit_url = os.getenv("MINIAPP_PUBLIC_URL", "").strip()
    origin = _resolve_app_origin(app_base_url)

    if explicit_url:
        if explicit_url.startswith(("http://", "https://")):
            return explicit_url.rstrip("/")
        if origin:
            normalized_explicit = explicit_url if explicit_url.startswith("/") else f"/{explicit_url}"
            return f"{origin}{normalized_explicit.rstrip('/')}"

    if not origin:
        return None

    miniapp_prefix = os.getenv("MINIAPP_PREFIX", "/app").strip() or "/app"
    if not miniapp_prefix.startswith("/"):
        miniapp_prefix = f"/{miniapp_prefix}"
    return f"{origin}{miniapp_prefix.rstrip('/')}"


def _build_open_app_button(app_base_url: Optional[str] = None) -> Optional[InlineKeyboardButton]:
    miniapp_url = _resolve_miniapp_url(app_base_url)
    if not miniapp_url:
        return None
    return InlineKeyboardButton("🧪 Open Mini App (optional)", web_app=WebAppInfo(url=miniapp_url))


def _resolve_admin_web_url(app_base_url: Optional[str] = None) -> Optional[str]:
    origin = _resolve_app_origin(app_base_url)
    if not origin:
        return None
    admin_prefix = os.getenv("ADMIN_WEB_PREFIX", "/admin").strip() or "/admin"
    if not admin_prefix.startswith("/"):
        admin_prefix = f"/{admin_prefix}"
    return f"{origin}{admin_prefix}"


def get_main_menu_keyboard(app_base_url: Optional[str] = None, *, show_admin: bool = False, show_notice: bool = False) -> InlineKeyboardMarkup:
    """Primary classic-bot menu after the bot-first pivot."""
    keyboard = [
        [
            InlineKeyboardButton("🎮 Create Duel", callback_data="create_game"),
            InlineKeyboardButton("🔍 Find Duel", callback_data="find_game"),
        ],
        [
            InlineKeyboardButton("💰 Balance", callback_data="balance"),
            InlineKeyboardButton("📜 My Duels", callback_data="my_history"),
        ],
        [
            InlineKeyboardButton("👤 Profile", callback_data="profile"),
            InlineKeyboardButton("🏆 Leaderboard", callback_data="leaderboard_global"),
        ],
        [
            InlineKeyboardButton("🧪 Practice Mode", callback_data="practice_mode"),
            InlineKeyboardButton("👥 My Chats", callback_data="my_chats"),
        ],
    ]
    if show_notice:
        keyboard.append([InlineKeyboardButton("📣 Current Notice", callback_data="notice_open")])
    if show_admin:
        keyboard.append([InlineKeyboardButton("👑 Админка", callback_data="admin_panel")])
    return InlineKeyboardMarkup(keyboard)


def get_game_keyboard() -> ReplyKeyboardMarkup:
    """Reply keyboard used during the dice roll step."""
    keyboard = [[KeyboardButton("🎲")], [KeyboardButton("❌ Leave duel")]]
    return ReplyKeyboardMarkup(keyboard, resize_keyboard=True, one_time_keyboard=False)


def get_bet_amount_keyboard() -> InlineKeyboardMarkup:
    keyboard = [
        [
            InlineKeyboardButton("0.5 TON", callback_data="bet_0.5"),
            InlineKeyboardButton("1 TON", callback_data="bet_1"),
            InlineKeyboardButton("5 TON", callback_data="bet_5"),
        ],
        [
            InlineKeyboardButton("10 TON", callback_data="bet_10"),
            InlineKeyboardButton("25 TON", callback_data="bet_25"),
            InlineKeyboardButton("50 TON", callback_data="bet_50"),
        ],
        [
            InlineKeyboardButton("💰 Use full balance", callback_data="bet_all"),
            InlineKeyboardButton("✏️ Custom amount", callback_data="bet_custom"),
        ],
        [InlineKeyboardButton("◀️ Back", callback_data="back_to_main")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_waiting_games_keyboard(games: List[dict], current_user_id: int) -> InlineKeyboardMarkup:
    keyboard = []
    for game in games:
        if game["player1_id"] != current_user_id:
            button_text = f"🎲 {game['first_name']} — {game['bet_amount']:.1f} TON"
            keyboard.append([InlineKeyboardButton(button_text, callback_data=f"join_game_{game['game_id']}")])

    if not keyboard:
        keyboard.append([InlineKeyboardButton("😔 No open duels yet", callback_data="create_game")])

    keyboard.append([InlineKeyboardButton("◀️ Back", callback_data="back_to_main")])
    return InlineKeyboardMarkup(keyboard)


def get_game_created_keyboard(game_id: int, share_payload: Optional[dict] = None) -> InlineKeyboardMarkup:
    keyboard = []
    share_button = _share_button("📨 Share duel", share_payload)
    if share_button:
        keyboard.append([share_button])
    keyboard.extend([
        [InlineKeyboardButton("❌ Cancel duel", callback_data=f"cancel_game_{game_id}")],
        [InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")],
    ])
    return InlineKeyboardMarkup(keyboard)


def get_game_confirmation_keyboard(game_id: int, bet_amount: float) -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(f"✅ Join for {bet_amount:.1f} TON", callback_data=f"confirm_join_{game_id}")],
        [InlineKeyboardButton("🔍 Back to lobby", callback_data="find_game")],
        [InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_game_active_keyboard() -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton("📊 Duel status", callback_data="game_status")],
        [InlineKeyboardButton("❌ Leave duel", callback_data="leave_game")],
        [InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_stats_keyboard() -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton("🏆 Leaderboard", callback_data="leaderboard")],
        [InlineKeyboardButton("📈 My history", callback_data="my_history")],
        [InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_duel_history_keyboard(has_items: bool = True) -> InlineKeyboardMarkup:
    keyboard = []
    if has_items:
        keyboard.append([InlineKeyboardButton("🔄 Refresh history", callback_data="my_history")])
    else:
        keyboard.append([InlineKeyboardButton("🎮 Create Duel", callback_data="create_game")])
        keyboard.append([InlineKeyboardButton("🧪 Practice Mode", callback_data="practice_mode")])
    keyboard.append([InlineKeyboardButton("👤 Profile", callback_data="profile")])
    keyboard.append([InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")])
    return InlineKeyboardMarkup(keyboard)


def get_balance_keyboard() -> InlineKeyboardMarkup:
    keyboard = [
        [
            InlineKeyboardButton("➕ Deposit", callback_data="deposit"),
            InlineKeyboardButton("➖ Withdraw", callback_data="withdraw"),
        ],
        [
            InlineKeyboardButton("🎮 Create Duel", callback_data="create_game"),
            InlineKeyboardButton("🧪 Practice Mode", callback_data="practice_mode"),
        ],
        [InlineKeyboardButton("💸 Balance activity", callback_data="transaction_history")],
        [InlineKeyboardButton("🔄 Refresh balance", callback_data="balance")],
        [InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_help_keyboard() -> InlineKeyboardMarkup:
    keyboard = [
        [
            InlineKeyboardButton("🛟 Support", callback_data="support"),
            InlineKeyboardButton("📨 Invite Friends", callback_data="invite_friends"),
        ],
        [InlineKeyboardButton("👤 Profile", callback_data="profile")],
        [InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_support_keyboard(show_support_address: bool = False) -> InlineKeyboardMarkup:
    keyboard = []
    if show_support_address:
        keyboard.append([InlineKeyboardButton("📨 Invite Friends", callback_data="invite_friends")])
    keyboard.append([InlineKeyboardButton("👤 Profile", callback_data="profile")])
    keyboard.append([InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")])
    return InlineKeyboardMarkup(keyboard)


def get_referral_keyboard(share_payload: Optional[dict] = None) -> InlineKeyboardMarkup:
    inline_query = "invite"
    if share_payload and str(share_payload.get("kind") or "").strip().lower() == "invite":
        inline_query = "invite"

    keyboard = [
        [InlineKeyboardButton("📨 Share invite", switch_inline_query=inline_query)],
        [
            InlineKeyboardButton("🔗 Show link", callback_data="invite_show_link"),
            InlineKeyboardButton("🧾 Get invite card", callback_data="invite_send_card"),
        ],
        [InlineKeyboardButton("🔄 Refresh", callback_data="invite_friends")],
        [InlineKeyboardButton("👤 Profile", callback_data="profile")],
        [InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_invite_card_keyboard(invite_url: str) -> InlineKeyboardMarkup:
    normalized_url = str(invite_url or "").strip()
    return InlineKeyboardMarkup([[InlineKeyboardButton("🎲 Join Roll Duel", url=normalized_url)]])


def get_profile_keyboard() -> InlineKeyboardMarkup:
    keyboard = [
        [
            InlineKeyboardButton("📨 Invite Friends", callback_data="invite_friends"),
            InlineKeyboardButton("🏆 Leaderboard", callback_data="leaderboard_global"),
        ],
        [
            InlineKeyboardButton("📜 My Duels", callback_data="my_history"),
            InlineKeyboardButton("❓ Help", callback_data="help"),
        ],
        [InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")],
    ]
    return InlineKeyboardMarkup(keyboard)




def get_leaderboard_keyboard(scope: str = "global", *, workspace_available: bool = False) -> InlineKeyboardMarkup:
    normalized_scope = str(scope or "global").strip().lower()
    global_label = "🟢 Global" if normalized_scope == "global" else "🌐 Global"
    weekly_label = "🟢 Weekly" if normalized_scope == "weekly" else "📆 Weekly"
    chat_label = "🟢 This Chat" if normalized_scope == "workspace" else "💬 This Chat"
    keyboard = [
        [
            InlineKeyboardButton(global_label, callback_data="leaderboard_global"),
            InlineKeyboardButton(weekly_label, callback_data="leaderboard_weekly"),
        ],
    ]
    if workspace_available:
        keyboard.append([InlineKeyboardButton(chat_label, callback_data="leaderboard_workspace")])
    keyboard.append([InlineKeyboardButton("👤 Profile", callback_data="profile")])
    keyboard.append([InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")])
    return InlineKeyboardMarkup(keyboard)




def get_practice_menu_keyboard() -> InlineKeyboardMarkup:
    keyboard = [
        [
            InlineKeyboardButton("🧪 Create Practice Duel", callback_data="practice_create"),
            InlineKeyboardButton("🔍 Find Practice Duel", callback_data="practice_find"),
        ],
        [
            InlineKeyboardButton("💎 Practice Balance", callback_data="practice_balance"),
            InlineKeyboardButton("ℹ️ How it works", callback_data="practice_about"),
        ],
        [
            InlineKeyboardButton("🎮 Start Real Duel", callback_data="create_game"),
            InlineKeyboardButton("💰 Open Real Balance", callback_data="balance"),
        ],
        [InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_practice_bet_amount_keyboard() -> InlineKeyboardMarkup:
    keyboard = [
        [
            InlineKeyboardButton("0.5 Demo TON", callback_data="pbet_0.5"),
            InlineKeyboardButton("1 Demo TON", callback_data="pbet_1"),
        ],
        [
            InlineKeyboardButton("5 Demo TON", callback_data="pbet_5"),
            InlineKeyboardButton("10 Demo TON", callback_data="pbet_10"),
        ],
        [InlineKeyboardButton("◀️ Practice menu", callback_data="practice_mode")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_waiting_practice_games_keyboard(games: List[dict], current_user_id: int) -> InlineKeyboardMarkup:
    keyboard = []
    for game in games:
        if int(game["player1_id"]) != int(current_user_id):
            button_text = f"🧪 {game['first_name']} — {float(game['stake_amount']):.1f} Demo TON"
            keyboard.append([InlineKeyboardButton(button_text, callback_data=f"pjoin_game_{game['practice_game_id']}")])

    if not keyboard:
        keyboard.append([InlineKeyboardButton("😔 No open practice duels yet", callback_data="practice_create")])

    keyboard.append([InlineKeyboardButton("🔄 Refresh lobby", callback_data="practice_find")])
    keyboard.append([InlineKeyboardButton("◀️ Practice menu", callback_data="practice_mode")])
    return InlineKeyboardMarkup(keyboard)


def get_practice_game_created_keyboard(practice_game_id: int) -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton("❌ Cancel practice duel", callback_data=f"pcancel_game_{practice_game_id}")],
        [InlineKeyboardButton("🔄 Refresh practice lobby", callback_data="practice_find")],
        [InlineKeyboardButton("◀️ Practice menu", callback_data="practice_mode")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_practice_game_confirmation_keyboard(practice_game_id: int, stake_amount: float) -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(f"✅ Join for {float(stake_amount):.1f} Demo TON", callback_data=f"pconfirm_join_{practice_game_id}")],
        [InlineKeyboardButton("🔍 Back to practice lobby", callback_data="practice_find")],
        [InlineKeyboardButton("◀️ Practice menu", callback_data="practice_mode")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_practice_balance_keyboard() -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton("🧪 Create Practice Duel", callback_data="practice_create")],
        [InlineKeyboardButton("🔍 Find Practice Duel", callback_data="practice_find")],
        [
            InlineKeyboardButton("🎮 Start Real Duel", callback_data="create_game"),
            InlineKeyboardButton("💰 Open Real Balance", callback_data="balance"),
        ],
        [InlineKeyboardButton("◀️ Practice menu", callback_data="practice_mode")],
    ]
    return InlineKeyboardMarkup(keyboard)

def get_result_actions_keyboard(share_payload: Optional[dict] = None) -> InlineKeyboardMarkup:
    keyboard = []
    share_button = _share_button("📨 Share result", share_payload)
    if share_button:
        keyboard.append([share_button])
    keyboard.extend([
        [
            InlineKeyboardButton("📜 My Duels", callback_data="my_history"),
            InlineKeyboardButton("🎮 Create Duel", callback_data="create_game"),
        ],
        [InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")],
    ])
    return InlineKeyboardMarkup(keyboard)


def get_open_bot_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[InlineKeyboardButton("🤖 Open Roll Duel Bot", url=f"https://t.me/{BOT_USERNAME}?start=menu")]])

def get_open_app_keyboard(app_base_url: Optional[str] = None) -> InlineKeyboardMarkup:
    open_app_button = _build_open_app_button(app_base_url)
    keyboard = []
    if open_app_button:
        keyboard.append([open_app_button])
    keyboard.append([InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")])
    return InlineKeyboardMarkup(keyboard)


def remove_reply_keyboard():
    from telegram import ReplyKeyboardRemove

    return ReplyKeyboardRemove()


def create_callback_data(action: str, **kwargs) -> str:
    data = {"action": action}
    data.update(kwargs)
    return json.dumps(data, separators=(",", ":"))


def parse_callback_data(callback_data: str) -> dict:
    try:
        return json.loads(callback_data)
    except (json.JSONDecodeError, TypeError):
        return {"action": callback_data}


def get_back_button() -> InlineKeyboardMarkup:
    keyboard = [[InlineKeyboardButton("◀️ Back", callback_data="back_to_main")]]
    return InlineKeyboardMarkup(keyboard)


def get_refresh_button(callback_data: str) -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton("🔄 Refresh", callback_data=callback_data)],
        [InlineKeyboardButton("◀️ Back", callback_data="back_to_main")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_yes_no_keyboard(yes_callback: str, no_callback: str) -> InlineKeyboardMarkup:
    keyboard = [[InlineKeyboardButton("✅ Yes", callback_data=yes_callback), InlineKeyboardButton("❌ No", callback_data=no_callback)]]
    return InlineKeyboardMarkup(keyboard)


def get_back_to_main_keyboard() -> InlineKeyboardMarkup:
    keyboard = [[InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")]]
    return InlineKeyboardMarkup(keyboard)


def get_insufficient_balance_keyboard() -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton("➕ Deposit TON", callback_data="deposit")],
        [
            InlineKeyboardButton("🧪 Back to Practice", callback_data="practice_mode"),
            InlineKeyboardButton("💰 Balance", callback_data="balance"),
        ],
        [InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_admin_panel_keyboard(admin_web_url: Optional[str] = None) -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton("📊 Overview", callback_data="admin_overview"), InlineKeyboardButton("💸 Withdrawals", callback_data="admin_withdrawals")],
        [InlineKeyboardButton("🧭 Runtime", callback_data="admin_runtime"), InlineKeyboardButton("👥 Users", callback_data="admin_users")],
        [InlineKeyboardButton("🏦 Liabilities", callback_data="admin_liabilities"), InlineKeyboardButton("📣 Broadcasts", callback_data="admin_broadcasts")],
        [InlineKeyboardButton("📢 Notice", callback_data="admin_notice"), InlineKeyboardButton("❓ Help", callback_data="admin_help")],
    ]
    if admin_web_url:
        keyboard.append([InlineKeyboardButton("🌐 Open web admin", url=admin_web_url)])
    keyboard.append([InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")])
    return InlineKeyboardMarkup(keyboard)


def get_admin_shortcuts_keyboard(current: str, admin_web_url: Optional[str] = None) -> InlineKeyboardMarkup:
    labels = [
        ("admin_overview", "📊 Overview"),
        ("admin_withdrawals", "💸 Withdrawals"),
        ("admin_runtime", "🧭 Runtime"),
        ("admin_users", "👥 Users"),
        ("admin_liabilities", "🏦 Liabilities"),
        ("admin_broadcasts", "📣 Broadcasts"),
        ("admin_notice", "📢 Notice"),
        ("admin_help", "❓ Help"),
    ]
    rows = []
    current_row = []
    for callback_data, label in labels:
        if callback_data == current:
            label = f"• {label}"
        current_row.append(InlineKeyboardButton(label, callback_data=callback_data))
        if len(current_row) == 2:
            rows.append(current_row)
            current_row = []
    if current_row:
        rows.append(current_row)
    if admin_web_url:
        rows.append([InlineKeyboardButton("🌐 Open web admin", url=admin_web_url)])
    rows.append([InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")])
    return InlineKeyboardMarkup(rows)


def get_admin_user_keyboard(user_id: int, is_blocked: bool) -> InlineKeyboardMarkup:
    keyboard = []
    if is_blocked:
        keyboard.append([InlineKeyboardButton("🔓 Разблокировать", callback_data=f"admin_unblock_{user_id}")])
    else:
        keyboard.append([InlineKeyboardButton("🚫 Заблокировать", callback_data=f"admin_block_{user_id}")])
    keyboard.append([InlineKeyboardButton("💸 Изменить баланс", callback_data=f"admin_change_balance_{user_id}")])
    keyboard.append([InlineKeyboardButton("📊 Статистика", callback_data=f"admin_stats_{user_id}")])
    keyboard.append([InlineKeyboardButton("◀️ Назад", callback_data="admin_users")])
    return InlineKeyboardMarkup(keyboard)


def get_admin_users_back_keyboard() -> InlineKeyboardMarkup:
    keyboard = [[InlineKeyboardButton("◀️ Назад", callback_data="admin_panel")]]
    return InlineKeyboardMarkup(keyboard)


def get_admin_settings_keyboard(allow_create_game: bool, allow_withdraw: bool) -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton(f"Создание игр: {'ВКЛ' if allow_create_game else 'ВЫКЛ'}", callback_data="toggle_create_game")],
        [InlineKeyboardButton(f"Вывод средств: {'ВКЛ' if allow_withdraw else 'ВЫКЛ'}", callback_data="toggle_withdraw")],
        [InlineKeyboardButton("⏹️ Отменить все ожидающие игры", callback_data="cancel_all_waiting_games")],
        [InlineKeyboardButton("◀️ Назад", callback_data="admin_panel")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_workspace_list_keyboard(workspaces: List[dict]) -> InlineKeyboardMarkup:
    keyboard = []
    for item in workspaces[:8]:
        title = str(item.get("title") or "Untitled Group")
        is_default = bool(int(item.get("is_default") or 0))
        prefix = "⭐ " if is_default else "👥 "
        keyboard.append([InlineKeyboardButton(f"{prefix}{title[:42]}", callback_data=f"workspace_open_{item['workspace_id']}")])
    keyboard.append([InlineKeyboardButton("➕ Connect Group", callback_data="workspace_connect")])
    if workspaces:
        keyboard.append([InlineKeyboardButton("🔄 Refresh My Chats", callback_data="my_chats")])
    keyboard.append([InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")])
    return InlineKeyboardMarkup(keyboard)


def get_workspace_settings_keyboard(detail: dict) -> InlineKeyboardMarkup:
    workspace_id = detail["workspaceId"]
    settings = detail.get("settings") or {}
    duel_label = "🟢 Duel posts" if settings.get("postDuelCreatedEnabled") else "⚪ Duel posts"
    result_label = "🟢 Result posts" if settings.get("postDuelResultEnabled") else "⚪ Result posts"
    leaderboard_label = "🟢 Leaderboard posts" if settings.get("leaderboardPostsEnabled") else "⚪ Leaderboard posts"
    weekly_label = "🟢 Weekly summary" if settings.get("weeklySummaryEnabled") else "⚪ Weekly summary"
    scope_label = f"🔁 Scope: {str(settings.get('defaultLeaderboardScope') or 'chat').title()}"
    default_label = "⭐ Default target" if detail.get("isDefault") else "☆ Set as default"
    keyboard = [
        [
            InlineKeyboardButton("🔄 Recheck status", callback_data=f"workspace_refresh_{workspace_id}"),
            InlineKeyboardButton("🧪 Test post", callback_data=f"workspace_test_{workspace_id}"),
        ],
        [
            InlineKeyboardButton("🎁 Giveaway", callback_data=f"giveaway_open_{workspace_id}"),
            InlineKeyboardButton(default_label, callback_data=f"workspace_set_default_{workspace_id}"),
        ],
        [
            InlineKeyboardButton(duel_label, callback_data=f"workspace_toggle_duel_{workspace_id}"),
            InlineKeyboardButton(result_label, callback_data=f"workspace_toggle_result_{workspace_id}"),
        ],
        [
            InlineKeyboardButton(leaderboard_label, callback_data=f"ws_toggle_lb_{workspace_id}"),
            InlineKeyboardButton(weekly_label, callback_data=f"ws_toggle_weekly_{workspace_id}"),
        ],
        [InlineKeyboardButton(scope_label, callback_data=f"ws_scope_{workspace_id}")],
        [
            InlineKeyboardButton("🏁 Chat leaderboard", callback_data=f"ws_pub_chat_{workspace_id}"),
            InlineKeyboardButton("🏆 Weekly leaders", callback_data=f"ws_pub_weekly_{workspace_id}"),
        ],
        [
            InlineKeyboardButton("👑 Champion", callback_data=f"ws_pub_champ_{workspace_id}"),
            InlineKeyboardButton("🧪 Preview", callback_data=f"ws_pub_preview_{workspace_id}"),
        ],
        [InlineKeyboardButton("🔌 Disconnect group", callback_data=f"workspace_disconnect_{workspace_id}")],
        [InlineKeyboardButton("◀️ Back to My Chats", callback_data="my_chats")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_workspace_disconnect_confirm_keyboard(workspace_id: str) -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton("✅ Yes, disconnect", callback_data=f"workspace_disconnect_apply_{workspace_id}")],
        [InlineKeyboardButton("↩️ Keep this group", callback_data=f"workspace_open_{workspace_id}")],
        [InlineKeyboardButton("◀️ Back to My Chats", callback_data="my_chats")],
    ]
    return InlineKeyboardMarkup(keyboard)


def get_workspace_connect_keyboard() -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton("📋 My Chats", callback_data="my_chats")],
        [InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")],
    ]
    return InlineKeyboardMarkup(keyboard)



def get_giveaway_detail_keyboard(snapshot: dict) -> InlineKeyboardMarkup:
    workspace = snapshot.get("workspace") or {}
    giveaway = snapshot.get("giveaway") or {}
    stats = snapshot.get("stats") or {}
    workspace_id = str(workspace.get("workspace_id") or giveaway.get("workspace_id") or "")
    giveaway_id = str(giveaway.get("giveaway_id") or "")
    status = str(giveaway.get("status") or "").upper()
    entries_count = int(stats.get("entriesCount") or 0)
    winners_selected_count = int(stats.get("winnersSelectedCount") or 0)

    if not giveaway_id:
        keyboard = [
            [InlineKeyboardButton("🎁 Create giveaway", callback_data=f"giveaway_create_{workspace_id}")],
            [InlineKeyboardButton("◀️ Back to group", callback_data=f"workspace_open_{workspace_id}")],
        ]
        return InlineKeyboardMarkup(keyboard)

    keyboard = []
    if status == "DRAFT":
        keyboard.extend([
            [
                InlineKeyboardButton("✏️ Title", callback_data=f"gw_edit_title_{giveaway_id}"),
                InlineKeyboardButton("🎁 Prize", callback_data=f"gw_edit_prize_{giveaway_id}"),
            ],
            [
                InlineKeyboardButton("👥 Winners", callback_data=f"gw_edit_winners_{giveaway_id}"),
                InlineKeyboardButton("⏰ Deadline", callback_data=f"gw_edit_deadline_{giveaway_id}"),
            ],
            [InlineKeyboardButton("✅ Activate giveaway", callback_data=f"gw_activate_{giveaway_id}")],
            [InlineKeyboardButton("🗑️ Cancel giveaway", callback_data=f"gw_cancel_{giveaway_id}")],
        ])
    elif status == "ACTIVE":
        keyboard.extend([
            [InlineKeyboardButton("📣 Publish giveaway", callback_data=f"gw_publish_live_{giveaway_id}")],
            [InlineKeyboardButton("🛑 End giveaway", callback_data=f"gw_end_{giveaway_id}")],
        ])
    elif status == "ENDED":
        if entries_count > 0:
            keyboard.extend([
                [InlineKeyboardButton("🎲 Draw winners", callback_data=f"gw_draw_{giveaway_id}")],
            ])
        else:
            keyboard.extend([
                [InlineKeyboardButton("🏁 Publish no-winner result", callback_data=f"gw_publish_results_{giveaway_id}")],
                [InlineKeyboardButton("🗑️ Cancel empty giveaway", callback_data=f"gw_cancel_{giveaway_id}")],
            ])
    elif status == "WINNERS_DRAWN":
        label = "🏁 Publish results" if winners_selected_count > 0 else "🏁 Publish no-winner result"
        keyboard.extend([
            [InlineKeyboardButton(label, callback_data=f"gw_publish_results_{giveaway_id}")],
        ])
    if status in {"RESULTS_PUBLISHED", "CANCELLED"}:
        keyboard.extend([
            [InlineKeyboardButton("🎁 Create next giveaway", callback_data=f"giveaway_create_{workspace_id}")],
        ])
    keyboard.extend([
        [InlineKeyboardButton("🔄 Refresh giveaway", callback_data=f"gw_back_{giveaway_id}")],
        [InlineKeyboardButton("◀️ Back to group", callback_data=f"workspace_open_{workspace_id}")],
    ])
    return InlineKeyboardMarkup(keyboard)



def get_public_giveaway_join_keyboard(giveaway_id: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[InlineKeyboardButton("🎁 Join Giveaway", callback_data=f"gw_join_{giveaway_id}")]])



def get_giveaway_confirm_keyboard(action: str, giveaway_id: str, workspace_id: str) -> InlineKeyboardMarkup:
    mapping = {
        "activate": ("✅ Yes, activate", f"gw_confirm_activate_{giveaway_id}"),
        "end": ("✅ Yes, end", f"gw_confirm_end_{giveaway_id}"),
        "draw": ("✅ Yes, draw winners", f"gw_confirm_draw_{giveaway_id}"),
        "results": ("✅ Yes, mark published", f"gw_confirm_results_{giveaway_id}"),
        "cancel": ("✅ Yes, cancel", f"gw_confirm_cancel_{giveaway_id}"),
    }
    label, callback_data = mapping[action]
    keyboard = [
        [InlineKeyboardButton(label, callback_data=callback_data)],
        [InlineKeyboardButton("↩️ Back to giveaway", callback_data=f"gw_back_{giveaway_id}")],
        [InlineKeyboardButton("◀️ Back to group", callback_data=f"workspace_open_{workspace_id}")],
    ]
    return InlineKeyboardMarkup(keyboard)



def get_giveaway_edit_prompt_keyboard(giveaway_id: str, field_name: str | None = None) -> InlineKeyboardMarkup:
    keyboard = []
    if str(field_name or '').strip().lower() == 'deadline':
        keyboard.extend([
            [
                InlineKeyboardButton("⏱ 1h", callback_data=f"gw_deadline_preset_{giveaway_id}_1h"),
                InlineKeyboardButton("📅 24h", callback_data=f"gw_deadline_preset_{giveaway_id}_24h"),
            ],
            [
                InlineKeyboardButton("🗓 3d", callback_data=f"gw_deadline_preset_{giveaway_id}_3d"),
                InlineKeyboardButton("🗓 7d", callback_data=f"gw_deadline_preset_{giveaway_id}_7d"),
            ],
        ])
    keyboard.append([InlineKeyboardButton("↩️ Back to giveaway", callback_data=f"gw_back_{giveaway_id}")])
    return InlineKeyboardMarkup(keyboard)



def get_notice_view_keyboard(*, cta_label: Optional[str] = None, cta_callback: Optional[str] = None) -> InlineKeyboardMarkup:
    keyboard: list[list[InlineKeyboardButton]] = []
    if cta_label and cta_callback:
        keyboard.append([InlineKeyboardButton(cta_label, callback_data=cta_callback)])
    keyboard.append([InlineKeyboardButton("◀️ Main menu", callback_data="back_to_main")])
    return InlineKeyboardMarkup(keyboard)


def get_admin_broadcast_detail_keyboard(broadcast_id: str, status: str, admin_web_url: Optional[str] = None) -> InlineKeyboardMarkup:
    is_draft = str(status or "").lower() == "draft"
    is_running = str(status or "").lower() == "running"
    keyboard: list[list[InlineKeyboardButton]] = []
    if is_draft:
        keyboard.extend([
            [InlineKeyboardButton("✍️ Edit text", callback_data=f"admin_bc_text|{broadcast_id}"), InlineKeyboardButton("👥 Audience", callback_data=f"admin_bc_audience_menu|{broadcast_id}")],
            [InlineKeyboardButton("👀 Preview", callback_data=f"admin_bc_preview|{broadcast_id}"), InlineKeyboardButton("🚀 Launch", callback_data=f"admin_bc_launch|{broadcast_id}")],
            [InlineKeyboardButton("🗑️ Cancel draft", callback_data=f"admin_bc_cancel|{broadcast_id}")],
        ])
    elif is_running:
        keyboard.extend([
            [InlineKeyboardButton("👀 Preview", callback_data=f"admin_bc_preview|{broadcast_id}"), InlineKeyboardButton("🛑 Stop", callback_data=f"admin_bc_stop|{broadcast_id}")],
            [InlineKeyboardButton("🔁 Retry failed", callback_data=f"admin_bc_retry|{broadcast_id}")],
        ])
    else:
        keyboard.append([InlineKeyboardButton("👀 Preview", callback_data=f"admin_bc_preview|{broadcast_id}")])
        keyboard.append([InlineKeyboardButton("🔁 Retry failed", callback_data=f"admin_bc_retry|{broadcast_id}")])
    keyboard.append([InlineKeyboardButton("◀️ Back", callback_data="admin_broadcasts")])
    if admin_web_url:
        keyboard.append([InlineKeyboardButton("🌐 Open web admin", url=admin_web_url)])
    return InlineKeyboardMarkup(keyboard)


def get_admin_notice_detail_keyboard(notice_id: str, status: str, admin_web_url: Optional[str] = None) -> InlineKeyboardMarkup:
    is_draft = str(status or "").lower() == "draft"
    is_active = str(status or "").lower() == "active"
    keyboard: list[list[InlineKeyboardButton]] = []
    if is_draft:
        keyboard.extend([
            [InlineKeyboardButton("✍️ Edit text", callback_data=f"admin_notice_text|{notice_id}"), InlineKeyboardButton("⚠️ Severity", callback_data=f"admin_notice_severity_menu|{notice_id}")],
            [InlineKeyboardButton("🎯 Target", callback_data=f"admin_notice_target_menu|{notice_id}"), InlineKeyboardButton("🔗 CTA", callback_data=f"admin_notice_cta_menu|{notice_id}")],
            [InlineKeyboardButton("⏱️ Expiry", callback_data=f"admin_notice_expiry_menu|{notice_id}"), InlineKeyboardButton("👀 Preview", callback_data=f"admin_notice_preview|{notice_id}")],
            [InlineKeyboardButton("📢 Publish", callback_data=f"admin_notice_publish|{notice_id}"), InlineKeyboardButton("🗑️ Cancel draft", callback_data=f"admin_notice_deactivate|{notice_id}")],
        ])
    elif is_active:
        keyboard.extend([
            [InlineKeyboardButton("👀 Preview", callback_data=f"admin_notice_preview|{notice_id}"), InlineKeyboardButton("⏹️ Deactivate", callback_data=f"admin_notice_deactivate|{notice_id}")],
        ])
    else:
        keyboard.append([InlineKeyboardButton("👀 Preview", callback_data=f"admin_notice_preview|{notice_id}")])
    keyboard.append([InlineKeyboardButton("◀️ Back", callback_data="admin_notice")])
    if admin_web_url:
        keyboard.append([InlineKeyboardButton("🌐 Open web admin", url=admin_web_url)])
    return InlineKeyboardMarkup(keyboard)
