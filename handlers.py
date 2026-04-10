#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Обработчики команд и callback запросов для Telegram бота
"""

import logging
import re
import os
from telegram import Update, Bot, InlineQueryResultArticle, InputTextMessageContent, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.error import BadRequest, Forbidden
from telegram.ext import ContextTypes
from telegram.constants import ParseMode
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from datetime import datetime, timedelta
import asyncio
from functools import wraps
from cryptopay import create_ton_invoice, get_invoice_status
import math
from html import escape

from database import (
    cleanup_expired_user_runtime_states, clear_user_runtime_state, create_or_update_user,
    get_connection, get_room_message_id, get_setting, get_user_balance,
    get_user_runtime_state, get_user_stats, get_waiting_games, get_active_game, get_game_by_id,
    set_room_message_id, set_user_runtime_state, update_game_roll, update_user_balance,
)
from services.games import (
    create_game_with_reservation,
    join_game_with_reservation,
    cancel_waiting_game,
    cancel_active_game_by_user,
    settle_game,
    settle_timeout_game,
)
from services.payments import create_invoice_record, apply_paid_invoice, update_invoice_status
from services import settings as platform_settings, risk as risk_service
from services.withdrawals import create_withdrawal_request
from services.referrals import attempt_referral_attribution, get_referral_snapshot, parse_share_start_param
from services.workspaces import (
    WorkspaceError,
    activate_connect_request,
    create_connect_request,
    disconnect_workspace,
    get_workspace_detail,
    list_workspaces_for_user,
    publish_open_duel_to_default_workspace,
    publish_result_to_default_workspaces,
    publish_test_post,
    set_default_workspace,
    set_workspace_default_scope,
    toggle_workspace_setting,
)
from services.workspace_publish import WorkspacePublishError, publish_workspace_leaderboard_post
from services.leaderboards import get_leaderboard_snapshot
from services.giveaways import (
    GiveawayError,
    activate_giveaway,
    cancel_giveaway,
    create_giveaway_draft,
    draw_giveaway_winners,
    end_giveaway,
    get_giveaway_owner_snapshot,
    get_giveaway_public_snapshot,
    get_workspace_giveaway_for_owner,
    join_giveaway_public,
    mark_giveaway_post_published,
    mark_results_published,
    update_giveaway_core,
)
from services.practice import (
    cancel_active_practice_game_by_user,
    cancel_waiting_practice_game,
    create_practice_game,
    get_active_practice_game,
    get_practice_balance,
    get_practice_game_by_id,
    get_practice_room_message_id,
    get_waiting_practice_games,
    join_practice_game,
    set_practice_room_message_id,
    settle_practice_game,
    update_practice_game_roll,
)
from services.real_mode import get_balance_snapshot, get_real_mode_readiness
from services.social import get_duel_history, get_duel_share_payload, get_profile_snapshot, get_result_share_payload
from admin import read_models as admin_read_models
from services import broadcasts as broadcast_service, notices as notice_service
from game_logic import (
    validate_bet_amount, determine_winner, format_game_result,
    get_dice_emoji, format_balance_display, get_random_game_message
)
from keyboards import (
    get_main_menu_keyboard, get_game_keyboard, get_bet_amount_keyboard,
    get_waiting_games_keyboard, get_game_created_keyboard,
    get_game_confirmation_keyboard, get_balance_keyboard, get_stats_keyboard,
    remove_reply_keyboard, get_back_button, get_back_to_main_keyboard,
    get_admin_panel_keyboard, get_admin_shortcuts_keyboard, get_admin_user_keyboard, get_admin_users_back_keyboard,
    get_admin_broadcast_detail_keyboard, get_admin_notice_detail_keyboard, get_notice_view_keyboard,
    get_admin_settings_keyboard, get_yes_no_keyboard,
    get_help_keyboard, get_support_keyboard, get_referral_keyboard, get_profile_keyboard,
    get_open_app_keyboard, get_workspace_list_keyboard, get_workspace_settings_keyboard,
    get_workspace_connect_keyboard, get_workspace_disconnect_confirm_keyboard,
    get_giveaway_detail_keyboard, get_giveaway_confirm_keyboard, get_giveaway_edit_prompt_keyboard,
    get_public_giveaway_join_keyboard,
    get_leaderboard_keyboard, get_open_bot_keyboard,
    get_practice_balance_keyboard, get_practice_bet_amount_keyboard,
    get_practice_game_confirmation_keyboard, get_practice_game_created_keyboard,
    get_practice_menu_keyboard, get_waiting_practice_games_keyboard,
    get_insufficient_balance_keyboard, get_duel_history_keyboard, get_result_actions_keyboard,
    get_invite_card_keyboard,
)

logger = logging.getLogger(__name__)

class PersistentUserStates:
    """DB-backed runtime state storage with dict-like ergonomics."""

    def get(self, user_id: int, default=None):
        row = get_user_runtime_state(user_id)
        if not row:
            return default
        return row.get("state_key") or default

    def __setitem__(self, user_id: int, state_key: str) -> None:
        set_user_runtime_state(user_id, state_key, ttl_seconds=_state_ttl_seconds(state_key))

    def pop(self, user_id: int, default=None):
        existing = self.get(user_id, default)
        clear_user_runtime_state(user_id)
        return existing


def _state_ttl_seconds(state_key: str | None) -> int:
    key = str(state_key or "")
    if key.startswith("admin_waiting_broadcast") or key.startswith("admin_bc_") or key.startswith("admin_notice_"):
        return 15 * 60
    if key.startswith("admin_waiting_"):
        return 20 * 60
    if key.startswith("gw_edit_"):
        return 2 * 60 * 60
    if key.startswith("waiting_"):
        return 30 * 60
    return 45 * 60


user_states = PersistentUserStates()

# Словарь для хранения локальных job-ссылок: timers[scope_key][user_id] = {'reminder': job, 'timeout': job}
timers = {}
scheduler = AsyncIOScheduler()
_broadcast_runtime_bot: Bot | None = None


async def _process_broadcast_delivery_tick() -> None:
    if _broadcast_runtime_bot is None:
        return
    try:
        await broadcast_service.process_active_broadcasts(
            _broadcast_runtime_bot,
            batch_size=max(1, min(int(os.getenv("ADMIN_BROADCAST_BATCH_SIZE", "25") or "25"), 50)),
        )
    except Exception:
        logger.exception("Broadcast delivery tick failed")


def init_runtime_scheduler(bot: Bot | None = None) -> None:
    global _broadcast_runtime_bot
    if bot is not None:
        _broadcast_runtime_bot = bot
    if not scheduler.running:
        scheduler.start()
        logger.info("Runtime scheduler started")
    if scheduler.get_job("broadcast-delivery-tick") is None:
        scheduler.add_job(
            _process_broadcast_delivery_tick,
            trigger="interval",
            seconds=max(10, int(os.getenv("ADMIN_BROADCAST_TICK_SECONDS", "15") or "15")),
            id="broadcast-delivery-tick",
            replace_existing=True,
        )


def shutdown_runtime_scheduler() -> None:
    if scheduler.running:
        try:
            scheduler.shutdown(wait=False)
        except Exception:
            logger.exception("Failed to stop runtime scheduler cleanly")


def _remove_scheduled_job(job) -> None:
    if job is None:
        return
    try:
        scheduler.remove_job(job.id)
    except Exception:
        pass


def _store_timer_job(scope_key, user_id, job_key, job) -> None:
    timers.setdefault(scope_key, {}).setdefault(user_id, {})[job_key] = job


def _clear_timer_scope(scope_key, user_ids=None) -> None:
    bucket = timers.get(scope_key)
    if not bucket:
        timers.pop(scope_key, None)
        return
    if user_ids is None:
        user_ids = list(bucket.keys())
    for uid in list(user_ids):
        for job in list(bucket.get(uid, {}).values()):
            _remove_scheduled_job(job)
        bucket.pop(uid, None)
    if not bucket:
        timers.pop(scope_key, None)


def _clear_timer_user(scope_key, user_id) -> None:
    bucket = timers.get(scope_key)
    if not bucket:
        return
    for job in list(bucket.get(user_id, {}).values()):
        _remove_scheduled_job(job)
    bucket.pop(user_id, None)
    if not bucket:
        timers.pop(scope_key, None)

def _parse_admin_id_list(raw: str) -> list[int]:
    values: list[int] = []
    for chunk in str(raw or "").split(","):
        chunk = chunk.strip()
        if chunk.isdigit():
            values.append(int(chunk))
    return values


ADMIN_CHAT_ID = int(os.getenv("ADMIN_CHAT_ID", "0").strip()) if os.getenv("ADMIN_CHAT_ID", "0").strip().isdigit() else 0
TG_OPERATOR_IDS = _parse_admin_id_list(os.getenv("TG_OPERATOR_IDS", ""))
LEGACY_ADMIN_IDS = _parse_admin_id_list(os.getenv("ADMIN_IDS", ""))
ADMIN_IDS = sorted({*( [ADMIN_CHAT_ID] if ADMIN_CHAT_ID else [] ), *TG_OPERATOR_IDS, *LEGACY_ADMIN_IDS})
FOUNDER_ADMIN_IDS = {ADMIN_CHAT_ID} if ADMIN_CHAT_ID else set()

MIN_DEPOSIT_AMOUNT = 0.1
BOT_USERNAME = os.getenv("TELEGRAM_BOT_USERNAME", "rollduelbot").strip().lstrip("@") or "rollduelbot"
_raw_support_handle = os.getenv("SUPPORT_TELEGRAM_HANDLE", "").strip()
if not _raw_support_handle or "durovcube" in _raw_support_handle.lower():
    SUPPORT_TELEGRAM_HANDLE = f"@{BOT_USERNAME}"
else:
    SUPPORT_TELEGRAM_HANDLE = _raw_support_handle if _raw_support_handle.startswith("@") else f"@{_raw_support_handle.lstrip('@')}"
SUPPORT_TON_ADDRESS = os.getenv("SUPPORT_TON_ADDRESS", "").strip()


def _is_admin_user(user_id: int | None) -> bool:
    return bool(user_id and user_id in ADMIN_IDS)


def _show_admin_button(user_id: int | None) -> bool:
    if not user_id:
        return False
    if FOUNDER_ADMIN_IDS:
        return user_id in FOUNDER_ADMIN_IDS
    return _is_admin_user(user_id)


def _main_menu_markup(user_id: int | None):
    return get_main_menu_keyboard(show_admin=_show_admin_button(user_id), show_notice=notice_service.has_active_notice_for_user(user_id))


def _admin_web_url(section_suffix: str = "") -> str:
    base_url = os.getenv("APP_BASE_URL", "").strip().rstrip("/")
    if not base_url:
        public_domain = os.getenv("RAILWAY_PUBLIC_DOMAIN", "").strip().strip("/")
        if public_domain:
            base_url = f"https://{public_domain}"
    if not base_url:
        return ""
    admin_prefix = os.getenv("ADMIN_WEB_PREFIX", "/admin").strip() or "/admin"
    if not admin_prefix.startswith("/"):
        admin_prefix = f"/{admin_prefix}"
    base = f"{base_url}{admin_prefix.rstrip('/')}"
    suffix = (section_suffix or "").strip()
    if not suffix:
        return base
    if suffix.startswith(("http://", "https://")):
        return suffix
    if not suffix.startswith("/"):
        suffix = f"/{suffix}"
    return f"{base}{suffix}"


def _format_admin_alert_lines(alerts: list[dict], *, limit: int = 3) -> list[str]:
    lines: list[str] = []
    for item in alerts[:limit]:
        title = escape(str(item.get("title") or "Alert"))
        detail = escape(str(item.get("detail") or ""))
        level = str(item.get("level") or "neutral").lower()
        icon = "🔴" if level == "bad" else "🟡" if level == "warn" else "ℹ️"
        lines.append(f"• {icon} <b>{title}</b> — {detail}")
    return lines


def _render_tg_admin_overview_text(user_id: int) -> str:
    snapshot = admin_read_models.dashboard_snapshot()
    liabilities = admin_read_models.liabilities_snapshot()
    founder_note = "Founder shortcut visible in main menu." if _show_admin_button(user_id) else "Operator shortcut opened via /admin fallback."
    alert_lines = _format_admin_alert_lines(liabilities.get("alerts") or [], limit=3)
    if not alert_lines:
        alert_lines = ["• ✅ No operator alerts right now."]
    return (
        "👑 <b>Админка Roll Duel</b>\n\n"
        "Это узкий Telegram operator layer поверх того же backend truth, что и web admin.\n\n"
        "<b>Quick snapshot</b>\n"
        f"• Pending withdrawals: <b>{int(snapshot.get('requested_withdrawals') or 0)}</b>\n"
        f"• Failed withdrawals: <b>{int(snapshot.get('failed_withdrawals') or 0)}</b>\n"
        f"• Open / active / stuck duels: <b>{int(snapshot.get('open_duels') or 0)}</b> / <b>{int(snapshot.get('active_duels') or 0)}</b> / <b>{int(snapshot.get('stuck_duels') or 0)}</b>\n"
        f"• Manual review users: <b>{int(snapshot.get('manual_review_users') or 0)}</b>\n"
        f"• Frozen users: <b>{int(snapshot.get('frozen_users') or 0)}</b>\n\n"
        "<b>Liabilities snapshot</b>\n"
        f"• Customer liability: <b>{float(liabilities.get('total_customer_liability') or 0):.2f} TON</b>\n"
        f"• Treasury balance: <b>{float(liabilities.get('treasury_balance') or 0):.2f} TON</b>\n"
        f"• Inflight withdrawals: <b>{float(liabilities.get('hot_outflow_now') or 0):.2f} TON</b>\n"
        f"• Treasury vs inflight: <b>{float(liabilities.get('operator_buffer') or 0):.2f} TON</b>\n\n"
        + "<b>Operator alerts</b>\n"
        + "\n".join(alert_lines)
        + f"\n\n<b>Access model</b>\n• {founder_note}\n• /admin remains the fallback entrypoint for allowlist operators.\n• Heavy edits still belong in web admin."
    )


def _render_tg_admin_withdrawals_text() -> str:
    snapshot = admin_read_models.dashboard_snapshot()
    queue = admin_read_models.list_withdrawals(limit=5, offset=0)
    lines = [
        "💸 <b>Withdrawals</b>",
        "",
        f"• Requested: <b>{int(snapshot.get('requested_withdrawals') or 0)}</b>",
        f"• Processing / reserved: <b>{int(snapshot.get('processing_withdrawals') or 0)}</b>",
        f"• Failed / rejected: <b>{int(snapshot.get('failed_withdrawals') or 0)}</b>",
        "",
        "<b>Latest queue</b>",
    ]
    if queue:
        for item in queue[:5]:
            username = str(item.get('username') or item.get('first_name') or item.get('user_id'))
            lines.append(
                f"• <code>{item.get('withdrawal_id')}</code> — {float(item.get('amount') or 0):.2f} TON — {item.get('status')} / {item.get('review_status')} — {escape(username)}"
            )
    else:
        lines.append("• Queue is empty right now.")
    if int(snapshot.get('failed_withdrawals') or 0) > 0:
        lines.extend(["", "<b>Receipt</b>", "• Failed / rejected withdrawals are above zero. Go deeper in web admin or Failed Items."])
    else:
        lines.extend(["", "<b>Receipt</b>", "• Queue looks calm right now. Use web admin for full card detail and notes."])
    return "\n".join(lines)


def _render_tg_admin_runtime_text() -> str:
    runtime = admin_read_models.runtime_snapshot()
    kill = runtime.get('kill_switches') or {}
    sanity = runtime.get('settings_sanity') or {}
    warnings = runtime.get('warnings') or []
    lines = [
        "🧭 <b>Runtime</b>",
        "",
        f"• DB backend: <b>{escape(str(runtime.get('database_backend') or '—'))}</b>",
        f"• Admin web: <b>{'enabled' if runtime.get('admin_web_enabled') else 'disabled'}</b>",
        f"• Mini App runtime: <b>{'enabled' if runtime.get('miniapp_runtime_enabled') else 'disabled'}</b>",
        f"• Telegram webhook: <code>{escape(str(runtime.get('telegram_webhook_path') or '—'))}</code>",
        f"• Crypto Pay webhook: <code>{escape(str(runtime.get('cryptopay_webhook_path') or '—'))}</code>",
        "",
        "<b>Kill switches</b>",
        f"• Duels: <b>{'enabled' if kill.get('duels_enabled') else 'disabled'}</b>",
        f"• Deposits: <b>{'enabled' if kill.get('deposits_enabled') else 'disabled'}</b>",
        f"• Withdrawals: <b>{'enabled' if kill.get('withdrawals_enabled') else 'disabled'}</b>",
        f"• Maintenance: <b>{'enabled' if kill.get('maintenance_mode') else 'disabled'}</b>",
        "",
        "<b>Settings sanity</b>",
        f"• Rows: <b>{int(sanity.get('rows') or 0)}</b>",
        f"• Native JSON rows: <b>{int(sanity.get('native_rows') or 0)}</b>",
        f"• Malformed rows: <b>{int(sanity.get('malformed_rows') or 0)}</b>",
        f"• Fallback mode: <b>{'enabled' if sanity.get('fallback_mode') else 'disabled'}</b>",
    ]
    if warnings:
        lines.extend(["", "<b>Warnings</b>"] + [f"• {escape(str(item))}" for item in warnings[:5]])
        lines.extend(["", "<b>Receipt</b>", "• Runtime is readable, but warnings exist. Use web admin Runtime for the full sanity surface."])
    else:
        lines.extend(["", "✅ No runtime warnings right now.", "", "<b>Receipt</b>", "• Runtime toggles stay in web admin so this shortcut remains fast and safe."])
    return "\n".join(lines)


def _render_tg_admin_liabilities_text() -> str:
    snap = admin_read_models.liabilities_snapshot()
    alert_lines = _format_admin_alert_lines(snap.get('alerts') or [], limit=4)
    if not alert_lines:
        alert_lines = ["• ✅ No operator alerts right now."]
    return (
        "🏦 <b>Liabilities</b>\n\n"
        "<b>Treasury / exposure snapshot</b>\n"
        f"• Treasury balance: <b>{float(snap.get('treasury_balance') or 0):.2f} TON</b>\n"
        f"• Treasury profit: <b>{float(snap.get('treasury_profit') or 0):.2f} TON</b>\n"
        f"• Customer liability: <b>{float(snap.get('total_customer_liability') or 0):.2f} TON</b>\n"
        f"• Inflight withdrawals: <b>{float(snap.get('hot_outflow_now') or 0):.2f} TON</b>\n"
        f"• Pending deposit amount: <b>{float(snap.get('pending_deposit_amount') or 0):.2f} TON</b>\n"
        f"• Treasury vs inflight: <b>{float(snap.get('operator_buffer') or 0):.2f} TON</b>\n\n"
        + "<b>Alerts / receipts</b>\n"
        + "\n".join(alert_lines)
        + "\n\nUse Liabilities in Telegram for the snapshot, then jump to web admin for deep operator work."
    )


def _render_tg_admin_help_text() -> str:
    return (
        "❓ <b>Telegram Admin Shortcuts</b>\n\n"
        "This surface is intentionally narrow.\n\n"
        "<b>What belongs here</b>\n"
        "• quick overview\n"
        "• withdrawal triage snapshot\n"
        "• runtime/readiness snapshot\n"
        "• liabilities / alert snapshot\n"
        "• user lookup shortcut\n\n"
        "<b>What stays in web admin</b>\n"
        "• kill switch edits\n"
        "• withdrawal state transitions\n"
        "• full User Card write-actions\n"
        "• audit / failed-items deep work\n\n"
        "Use one source of truth: Telegram shortcuts for speed, web admin for heavy operator work."
    )


def _render_tg_admin_broadcasts_text() -> str:
    active = broadcast_service.get_active_broadcast()
    recent = broadcast_service.list_recent_broadcasts(limit=5)
    lines = [
        "📣 <b>Broadcasts</b>",
        "",
        "Broadcast = active push from Telegram admin via backend/runtime truth.",
        "",
    ]
    if active:
        lines.extend([
            "<b>Active broadcast</b>",
            f"• ID: <code>{escape(str(active.get('broadcast_id') or '—'))}</code>",
            f"• Status: <b>{escape(str(active.get('status') or '—'))}</b>",
            f"• Audience: <code>{escape(str(active.get('audience') or '—'))}</code>",
            f"• Sent / total: <b>{int(active.get('sent_count') or 0)}</b> / <b>{int(active.get('total_count') or 0)}</b>",
            f"• Retry pending: <b>{int(active.get('retry_pending') or 0)}</b>",
            f"• Failed: <b>{int(active.get('failed_count') or 0)}</b>",
            "",
        ])
    else:
        lines.extend(["<b>Active broadcast</b>", "• None right now.", ""])
    lines.append("<b>Recent drafts / runs</b>")
    if recent:
        for item in recent[:5]:
            lines.append(
                f"• <code>{escape(str(item.get('broadcast_id') or '—'))}</code> — {escape(str(item.get('status') or '—'))} — {escape(str(item.get('audience') or '—'))} — {int(item.get('sent_count') or 0)}/{int(item.get('total_count') or 0)} — retry {int(item.get('retry_pending') or 0)}"
            )
    else:
        lines.append("• No broadcast rows yet.")
    lines.extend([
        "",
        "<b>Receipt</b>",
        "• Draft → preview → confirm launch. Delivery stays in backend/runtime, not in bot-only state.",
    ])
    return "\n".join(lines)


def _render_tg_admin_broadcast_detail_text(row: dict | None) -> str:
    if not row:
        return "📣 <b>Broadcast</b>\n\nDraft not found."
    estimate = broadcast_service.count_recipients(str(row.get('audience') or 'founder_test'))
    preview = escape(str(row.get('message_text') or '')) or '—'
    return (
        "📣 <b>Broadcast draft</b>\n\n"
        f"• ID: <code>{escape(str(row.get('broadcast_id') or '—'))}</code>\n"
        f"• Status: <b>{escape(str(row.get('status') or '—'))}</b>\n"
        f"• Audience: <code>{escape(str(row.get('audience') or '—'))}</code>\n"
        f"• Estimated recipients: <b>{estimate}</b>\n"
        f"• Sent / total: <b>{int(row.get('sent_count') or 0)}</b> / <b>{int(row.get('total_count') or 0)}</b>\n"
        f"• Retry pending: <b>{int(row.get('retry_pending') or 0)}</b>\n"
        f"• Failed: <b>{int(row.get('failed_count') or 0)}</b>\n\n"
        "<b>Message preview</b>\n"
        f"{preview}"
    )


def _render_tg_admin_notice_text() -> str:
    active = notice_service.get_active_notice()
    recent = notice_service.list_recent_notices(limit=5)
    lines = [
        "📢 <b>System Notice</b>",
        "",
        "Notice = passive system message with versioned publish/deactivate flow.",
        "",
    ]
    if active:
        lines.extend([
            "<b>Current active notice</b>",
            f"• ID: <code>{escape(str(active.get('notice_id') or '—'))}</code>",
            f"• Severity: <b>{escape(str(active.get('severity') or 'info'))}</b>",
            f"• Target: <code>{escape(str(active.get('target') or 'all_users'))}</code>",
            f"• Version: <b>{int(active.get('version') or 0)}</b>",
            "",
        ])
    else:
        lines.extend(["<b>Current active notice</b>", "• None right now.", ""])
    lines.append("<b>Recent notices</b>")
    if recent:
        for item in recent[:5]:
            lines.append(
                f"• <code>{escape(str(item.get('notice_id') or '—'))}</code> — {escape(str(item.get('status') or '—'))} — {escape(str(item.get('severity') or 'info'))} — v{int(item.get('version') or 0)}"
            )
    else:
        lines.append("• No notice rows yet.")
    lines.extend([
        "",
        "<b>Receipt</b>",
        "• Publish new version when you need a passive system message without noisy mass push.",
    ])
    return "\n".join(lines)


def _render_tg_admin_notice_detail_text(row: dict | None) -> str:
    if not row:
        return "📢 <b>System Notice</b>\n\nNotice not found."
    cta_key = str(row.get('cta_key') or 'none')
    cta_label = notice_service.CTA_CHOICES.get(cta_key, ("No CTA", None))[0]
    expires_at = _format_timestamp(row.get('expires_at')) if row.get('expires_at') else 'No expiry'
    body = escape(str(row.get('body_text') or '')) or '—'
    return (
        "📢 <b>Notice draft</b>\n\n"
        f"• ID: <code>{escape(str(row.get('notice_id') or '—'))}</code>\n"
        f"• Status: <b>{escape(str(row.get('status') or '—'))}</b>\n"
        f"• Severity: <b>{escape(str(row.get('severity') or 'info'))}</b>\n"
        f"• Target: <code>{escape(str(row.get('target') or 'all_users'))}</code>\n"
        f"• CTA: <b>{escape(cta_label)}</b>\n"
        f"• Expiry: <b>{escape(expires_at)}</b>\n"
        f"• Version: <b>{int(row.get('version') or 0)}</b>\n\n"
        "<b>Notice preview</b>\n"
        f"{body}"
    )


def _render_user_notice_text(row: dict | None) -> str:
    if not row:
        return "📣 <b>Current Notice</b>\n\nThere is no active notice right now."
    severity = str(row.get('severity') or 'info').lower()
    badge = 'ℹ️' if severity == 'info' else '⚠️' if severity == 'warning' else '🚨'
    expires_at = _format_timestamp(row.get('expires_at')) if row.get('expires_at') else 'No expiry'
    body = escape(str(row.get('body_text') or '')) or '—'
    return (
        f"{badge} <b>Current Notice</b>\n\n"
        f"<b>Severity:</b> {escape(severity.title())}\n"
        f"<b>Version:</b> {int(row.get('version') or 0)}\n"
        f"<b>Expiry:</b> {escape(expires_at)}\n\n"
        f"{body}"
    )


def _notice_cta_payload(row: dict | None) -> tuple[str | None, str | None]:
    if not row:
        return None, None
    label, callback_data = notice_service.CTA_CHOICES.get(str(row.get('cta_key') or 'none'), (None, None))
    return label, callback_data


def _render_tg_admin_user_lookup_receipt(user_card: dict) -> str:
    active_flags = user_card.get("active_risk_flags") or []
    return (
        "👤 <b>User lookup receipt</b>\n\n"
        f"• User: <b>{int(user_card.get('user_id') or 0)}</b> @{escape(str(user_card.get('username') or '-'))}\n"
        f"• First name: <b>{escape(str(user_card.get('first_name') or '-'))}</b>\n"
        f"• Balance / reserved: <b>{float(user_card.get('balance') or 0):.2f} TON</b> / <b>{float(user_card.get('reserved_amount') or 0):.2f} TON</b>\n"
        f"• Risk / frozen: <b>{escape(str(user_card.get('risk_level') or 'normal'))}</b> / <b>{'yes' if user_card.get('is_frozen') else 'no'}</b>\n"
        f"• Active flags: <b>{len(active_flags)}</b>\n"
        f"• Recent withdrawals: <b>{len(user_card.get('recent_withdrawals') or [])}</b>\n"
        f"• Recent deposits: <b>{len(user_card.get('recent_deposits') or [])}</b>\n\n"
        "Use web admin User Card for full actions, history, and audited writes."
    )


def _clear_admin_runtime_state(user_id: int) -> None:
    state_key = user_states.get(user_id, "")
    if str(state_key).startswith(("admin_waiting_", "admin_bc_", "admin_notice_")):
        user_states.pop(user_id, None)


async def _enforce_admin_callback(query, *, user_id: int, callback_data: str) -> bool:
    if _is_admin_user(user_id):
        return True
    logger.warning("Blocked admin callback from non-admin user %s: %s", user_id, callback_data)
    await safe_answer_callback(query, "Operator access required.", show_alert=True)
    return False


def require_admin_callback(handler):
    @wraps(handler)
    async def wrapper(query, context, *, user_id: int, callback_data: str):
        if not await _enforce_admin_callback(query, user_id=user_id, callback_data=callback_data):
            return
        return await handler(query, context, user_id=user_id, callback_data=callback_data)

    return wrapper


def _allow_admin_message_state(user_id: int, state_key: str | None) -> bool:
    if _is_admin_user(user_id):
        return True
    if str(state_key or "").startswith(("admin_waiting_", "admin_bc_", "admin_notice_")):
        user_states.pop(user_id, None)
    logger.warning("Blocked admin runtime state from non-admin user %s: %s", user_id, state_key)
    return False


def require_admin_command(handler):
    @wraps(handler)
    async def wrapper(update: Update, context: ContextTypes.DEFAULT_TYPE, *args, **kwargs):
        user = update.effective_user
        user_id = user.id if user else 0
        if not _is_admin_user(user_id):
            logger.warning("Blocked admin command from non-admin user %s", user_id)
            return
        return await handler(update, context, *args, **kwargs)

    return wrapper


def _format_username(username: str | None) -> str:
    return f"@{username}" if username else "—"


def _format_timestamp(value) -> str:
    if value is None:
        return "—"
    text = str(value).replace("T", " ")
    if "+" in text:
        text = text.split("+")[0]
    if "." in text:
        text = text.split(".")[0]
    return f"{text} UTC"


def render_main_menu_text() -> str:
    return (
        "🎲 <b>Roll Duel</b>\n\n"
        "Play duels, manage your balance, track results, and manage your groups — all here in Telegram.\n\n"
        "Choose what you want to do."
    )

def render_open_app_text() -> str:
    return (
        "🧪 <b>Mini App</b>\n\n"
        "The main Roll Duel flow now runs in the bot.\n\n"
        "Open the Mini App only if you need to check the older experimental surface."
    )

def render_help_text() -> str:
    return (
        "🎲 <b>Roll Duel — quick guide</b>\n\n"
        "<b>How duels work</b>\n"
        "1. Create a duel and choose a TON stake.\n"
        "2. Wait for another player or join an open duel.\n"
        "3. Each player sends one fresh 🎲 dice message in the bot chat.\n"
        "4. The higher roll wins the pot.\n\n"
        "<b>Money flow</b>\n"
        "• Deposits and withdrawals go through CryptoBot.\n"
        f"• Minimum deposit: {MIN_DEPOSIT_AMOUNT:.1f} TON.\n"
        f"• Minimum withdrawal: {platform_settings.get_float('withdrawal_min_ton'):.1f} TON.\n"
        "• Your Roll Duel balance is used for live duel stakes and payouts.\n\n"
        "<b>Useful tips</b>\n"
        "• Practice Mode uses Demo TON and never touches your real balance.\n"
        "• Use My Chats to manage connected groups and leaderboard posting.\n"
        "• Use only fresh dice rolls — forwarded dice do not count.\n"
        "• If a player times out, the duel is settled by backend truth."
    )

def render_support_text() -> str:
    lines = [
        "🛟 <b>Roll Duel — Support</b>",
        "",
        "Questions, bug reports, and product feedback are welcome.",
        "",
        "<b>Contact</b>",
        f"• Telegram: {SUPPORT_TELEGRAM_HANDLE}",
        "• You can also continue in this bot chat if something looks stuck.",
        "",
        "<b>Payments</b>",
        "• Deposits and withdrawals use CryptoBot.",
        "• Your Roll Duel balance is used for duel stakes and payouts.",
    ]
    if SUPPORT_TON_ADDRESS:
        lines.extend(["", "<b>TON support address</b>", f"• <code>{SUPPORT_TON_ADDRESS}</code>"])
    lines.extend(["", "<b>Notes</b>", "• If something looks stale, refresh and try again.", "• If a group looks disconnected, open My Chats and recheck it there."])
    return "\n".join(lines)

def render_practice_menu_text(user_id: int) -> str:
    balance = get_practice_balance(user_id)
    return (
        "🧪 <b>Practice Mode</b>\n\n"
        "Use Demo TON to learn the full duel flow before your first real duel.\n\n"
        f"<b>Practice balance:</b> {balance:.2f} Demo TON\n"
        "<b>Practice never affects:</b> real balance, real leaderboards, or group posts.\n"
        "Try create → join → roll → result, then tap <b>Start Real Duel</b> when you are ready."
    )

def render_practice_balance_text(user_id: int) -> str:
    balance = get_practice_balance(user_id)
    return (
        "💎 <b>Practice Balance</b>\n\n"
        f"<b>Available:</b> {balance:.2f} Demo TON\n\n"
        "Demo balance is only for practice duels. It cannot be withdrawn or used in real TON duels. Use <b>Open Real Balance</b> when you want to switch to live play."
    )



def render_practice_about_text() -> str:
    return (
        "ℹ️ <b>How Practice Mode works</b>\n\n"
        "• Practice duels use Demo TON only.\n"
        "• Your real TON balance is never touched here.\n"
        "• Practice results do not enter real leaderboards or group posts.\n"
        "• Use practice to test invite, join, roll, result, and rematch flows before your first deposit.\n"
        "• When you are ready, switch to Real Balance and deposit TON for live duels."
    )



def _get_active_duel_context(user_id: int) -> tuple[str | None, dict | None]:
    real_game = get_active_game(user_id)
    if real_game:
        return "real", real_game
    practice_game = get_active_practice_game(user_id)
    if practice_game:
        return "practice", practice_game
    return None, None



def _describe_active_duel_conflict(kind: str | None) -> str:
    if kind == "practice":
        return "❌ You already have an active practice duel. Finish or leave it before starting something else."
    return "❌ You already have an active duel. Finish or leave it before starting another one."



def _format_practice_amount(amount: float) -> str:
    return f"{float(amount):.2f} Demo TON"



def _format_practice_result_text(player1_name: str, player1_roll: int, player2_name: str, player2_roll: int, winner: str, stake_amount: float) -> str:
    base = format_game_result(player1_name, player1_roll, player2_name, player2_roll, winner)
    if winner == "draw":
        return f"{base}\n💎 Practice stakes returned: {_format_practice_amount(stake_amount)}"
    return f"{base}\n💎 Practice winnings: {_format_practice_amount(stake_amount * 2)}"



def _format_leaderboard_row(item: dict) -> str:
    return (
        f"#{int(item.get('rank') or 0)} {item.get('displayName') or 'Player'} — "
        f"{int(item.get('wins') or 0)} wins • {float(item.get('totalTonWon') or 0):.2f} TON won"
    )


def render_leaderboard_text(snapshot: dict, *, scope: str) -> str:
    normalized_scope = str(scope or 'global').strip().lower()
    leaderboards = snapshot.get('leaderboards') or {}
    workspace_meta = snapshot.get('workspace') or {}
    stats = snapshot.get('playerStats') or {}
    ranks = snapshot.get('currentUserRanks') or {}

    if normalized_scope == 'weekly':
        board = leaderboards.get('weekly') or {}
        title = '🏆 <b>Weekly Leaderboard</b>'
        rank_value = ranks.get('weekly')
        subtitle = f"<b>Window:</b> last {int(board.get('windowDays') or 7)} days"
    elif normalized_scope == 'workspace':
        board = leaderboards.get('workspace') or {}
        workspace_title = workspace_meta.get('title') or 'This Chat'
        title = f"💬 <b>{workspace_title}</b>"
        rank_value = ranks.get('workspace')
        subtitle = workspace_meta.get('note') or 'Only duels published to this group are counted here.'
    else:
        board = leaderboards.get('global') or {}
        title = '🌐 <b>Global Leaderboard</b>'
        rank_value = ranks.get('global')
        subtitle = '<b>Scope:</b> all valid completed duels'

    lines = [title, '', subtitle]
    if rank_value:
        lines.append(f"<b>Your rank:</b> #{int(rank_value)}")
    lines.extend([
        '',
        '<b>Your stats</b>',
        f"• Wins: <b>{int(stats.get('wins') or 0)}</b>",
        f"• Win rate: <b>{float(stats.get('winRate') or 0):.1f}%</b>",
        f"• TON won: <b>{float(stats.get('totalTonWon') or 0):.2f}</b>",
        f"• Best streak: <b>{int(stats.get('bestStreak') or 0)}</b>",
        '',
        '<b>Top players</b>',
    ])

    items = board.get('items') or []
    if items:
        for item in items:
            prefix = '👉 ' if item.get('isCurrentUser') else '• '
            lines.append(prefix + _format_leaderboard_row(item))
    else:
        lines.append('No ranked duel results yet. Play more to build this leaderboard.')

    if normalized_scope == 'workspace' and not workspace_meta.get('available'):
        lines.extend(['', 'Connect a group in <b>My Chats</b> to unlock this chat leaderboard.'])

    return '\n'.join(lines)

def render_balance_screen_text(user_id: int) -> str:
    snapshot = get_balance_snapshot(user_id)
    real_balance = float(snapshot["realBalance"])
    practice_balance = snapshot.get("practiceBalance")
    min_stake = float(snapshot["minStakeTon"])
    can_create = bool(snapshot.get("duelsEnabled")) and real_balance >= min_stake
    withdraw_note = (
        f"Withdrawals start from {float(snapshot['withdrawalMinTon']):.1f} TON."
        if snapshot.get("withdrawalsEnabled")
        else "Withdrawals are currently paused."
    )
    if practice_balance is None:
        practice_line = f"<b>Practice balance:</b> not started yet — open Practice Mode to unlock {float(snapshot['practiceSeedAmount']):.0f} Demo TON"
    else:
        practice_line = f"<b>Practice balance:</b> {float(practice_balance):.2f} Demo TON"
    readiness_line = (
        f"✅ Ready for a real duel. Minimum stake is {min_stake:.1f} TON."
        if can_create
        else f"⚠️ Add TON to start real duels. Minimum stake is {min_stake:.1f} TON."
    )
    return (
        "💰 <b>Balance</b>\n\n"
        f"<b>Real balance:</b> {format_balance_display(real_balance)}\n"
        f"{practice_line}\n\n"
        f"{readiness_line}\n"
        "• Deposits go through a CryptoBot invoice.\n"
        "• Real TON is used for live duel stakes and payouts.\n"
        f"• {withdraw_note}"
    )


def render_insufficient_balance_text(user_id: int, *, required_amount: float | None = None, action_label: str = "start this duel") -> str:
    readiness = get_real_mode_readiness(user_id, required_amount=required_amount)
    real_balance = float(readiness["realBalance"])
    required = float(readiness["requiredAmount"])
    missing = max(float(readiness["missingAmount"]), 0.0)
    practice_balance = readiness.get("practiceBalance")
    if practice_balance is None:
        practice_line = f"<b>Practice balance:</b> not started yet — open Practice Mode to unlock {float(readiness['practiceSeedAmount']):.0f} Demo TON"
    else:
        practice_line = f"<b>Practice balance:</b> {float(practice_balance):.2f} Demo TON"
    return (
        "⚠️ <b>Not enough TON for real mode</b>\n\n"
        f"You need <b>{required:.2f} TON</b> to {action_label}.\n"
        f"<b>Real balance:</b> {real_balance:.2f} TON\n"
        f"<b>Missing:</b> {missing:.2f} TON\n\n"
        f"{practice_line}\n\n"
        "Next step:\n"
        "• deposit TON to enter real duels, or\n"
        "• go back to Practice Mode and keep testing the full loop."
    )
def render_referral_text(snapshot: dict) -> str:
    invited_by = snapshot.get("invitedBy")
    invited_rows = snapshot.get("invited") or []
    invite_link = str(snapshot.get('inviteLink') or '').strip()
    invite_link_code = escape(invite_link) if invite_link else '—'
    join_link = f'<a href="{escape(invite_link, quote=True)}">Join Roll Duel</a>' if invite_link else 'Join Roll Duel'
    lines = [
        "📨 <b>Invite friends</b>",
        "",
        "Share your invite straight into any chat.",
        "Use <b>Share invite</b> for the fastest Telegram-native flow.",
        "",
        f"<b>Your invite link</b>\n<code>{invite_link_code}</code>",
        "",
        "<b>Simple message ideas</b>",
        f"• Want to play a quick duel in Telegram? {join_link}",
        f"• I’m on Roll Duel right now — join me for a duel. {join_link}",
        f"• I’ve got the next duel ready. Think you can beat me? {join_link}",
        "",
        f"<b>Your invite code:</b> <code>{escape(str(snapshot.get('inviteCode') or '—'))}</code>",
        f"<b>Friends invited:</b> {snapshot.get('invitedCount', 0)}",
        f"<b>Invited by:</b> {escape(invited_by.get('displayName')) if invited_by and invited_by.get('displayName') else 'No referrer recorded'}",
    ]
    if invited_rows:
        lines.append("")
        lines.append("<b>Recent invited friends</b>")
        for item in invited_rows[:5]:
            display_name = escape(str(item.get('displayName') or item.get('userId')))
            lines.append(f"• {display_name} — {_format_timestamp(item.get('createdAt'))}")
    else:
        lines.extend(["", "No invited friends yet. Use Share invite for the fastest path, Show link for a raw link, or Get invite card for a forwardable bot card."])
    return "\n".join(lines)


def render_invite_card_text(snapshot: dict) -> str:
    invite_link = str(snapshot.get("inviteLink") or "").strip()
    join_link = f'<a href="{escape(invite_link, quote=True)}">Join Roll Duel</a>' if invite_link else 'Join Roll Duel'
    return (
        "🎲 <b>Invite to Roll Duel</b>\n\n"
        f"Want to play a quick duel in Telegram? {join_link}\n\n"
        "Forward this card to a friend, or let them tap the button below."
    )



def render_invite_link_text(snapshot: dict) -> str:
    invite_link = str(snapshot.get("inviteLink") or "").strip()
    invite_link_code = escape(invite_link) if invite_link else '—'
    return (
        "🔗 <b>Your invite link</b>\n\n"
        "Copy this link and drop it into any chat if you prefer a raw link over inline share.\n\n"
        f"<code>{invite_link_code}</code>"
    )



def render_inline_invite_share_text(snapshot: dict) -> str:
    invite_link = str(snapshot.get("inviteLink") or "").strip()
    join_link = f'<a href="{escape(invite_link, quote=True)}">Join Roll Duel</a>' if invite_link else 'Join Roll Duel'
    return (
        "🎲 <b>Join me on Roll Duel</b>\n\n"
        f"Want to play a quick duel in Telegram? {join_link}\n\n"
        "Fast TON dice duels inside Telegram."
    )


def render_profile_text(snapshot: dict) -> str:
    stats = snapshot.get("stats") or {}
    invite = snapshot.get("invite") or {}
    return (
        "👤 <b>Roll Duel Profile</b>\n\n"
        f"<b>Name:</b> {snapshot.get('displayName') or '—'}\n"
        f"<b>Username:</b> {_format_username(snapshot.get('username'))}\n"
        f"<b>Balance:</b> {format_balance_display(float(snapshot.get('balance') or 0))}\n\n"
        "<b>Real duel stats</b>\n"
        f"• Total duels: <b>{int(stats.get('totalDuels') or 0)}</b>\n"
        f"• Wins / losses / draws: <b>{int(stats.get('wins') or 0)}</b> / <b>{int(stats.get('losses') or 0)}</b> / <b>{int(stats.get('draws') or 0)}</b>\n"
        f"• Win rate: <b>{float(stats.get('winRate') or 0):.1f}%</b>\n"
        f"• Current streak: <b>{int(stats.get('currentStreak') or 0)}</b>\n"
        f"• Best streak: <b>{int(stats.get('bestStreak') or 0)}</b>\n"
        f"• TON won: <b>{float(stats.get('totalTonWon') or 0):.2f} TON</b>\n"
        f"• Friends invited: <b>{int(stats.get('inviteCount') or 0)}</b>\n\n"
        f"<b>Your invite code:</b> <code>{invite.get('inviteCode') or '—'}</code>"
    )

def render_duel_history_text(snapshot: dict) -> str:
    items = snapshot.get('items') or []
    if not items:
        return (
            "📜 <b>My Duels</b>\n\n"
            "No duels yet. Start a real duel or open Practice Mode to build your history."
        )

    lines = ["📜 <b>My Duels</b>", "", "Your latest duel activity:"]
    for item in items:
        mode_badge = "🧪 Practice" if item.get('isPractice') else "💎 Real"
        lines.extend([
            "",
            f"{mode_badge} • <b>{item.get('statusLabel') or 'Unknown'}</b>",
            f"• Opponent: <b>{item.get('opponent') or 'Unknown'}</b>",
            f"• Stake: <b>{item.get('stakeDisplay') or '—'}</b>",
            f"• Outcome: <b>{item.get('deltaDisplay') or '—'}</b>",
            f"• Time: {_format_timestamp(item.get('timestamp'))}",
        ])
    return "\n".join(lines)


def _workspace_posts_enabled(settings_or_row: dict) -> bool:
    return any(
        bool(int(settings_or_row.get(key) or 0)) if isinstance(settings_or_row.get(key), (int, bool)) or str(settings_or_row.get(key)).isdigit() else bool(settings_or_row.get(key))
        for key in ("post_duel_created_enabled", "post_duel_result_enabled", "leaderboard_posts_enabled", "weekly_summary_enabled")
    ) or any(
        bool(settings_or_row.get(key))
        for key in ("postDuelCreatedEnabled", "postDuelResultEnabled", "leaderboardPostsEnabled", "weeklySummaryEnabled")
    )


def _workspace_surface_state(item: dict) -> tuple[str, str]:
    status = str(item.get("status") or "").strip().lower()
    settings_active_raw = item.get("is_active")
    if settings_active_raw is None:
        settings_active_raw = item.get("settings", {}).get("isActive") if isinstance(item.get("settings"), dict) else None
    settings_active = True if settings_active_raw is None else bool(int(settings_active_raw)) if isinstance(settings_active_raw, int) else bool(settings_active_raw)
    posts_enabled = _workspace_posts_enabled(item.get("settings") or item)
    if status != "active" or not settings_active:
        return "offline", "🔴 Disconnected"
    if posts_enabled:
        return "ready", "🟢 Publish-ready"
    return "attention", "🟡 Setup needed"


def render_workspace_list_text(user_id: int) -> str:
    items = list_workspaces_for_user(user_id)
    lines = [
        "👥 <b>My Chats</b>",
        "",
        "Manage the groups where Roll Duel can publish duel, result, and leaderboard posts.",
    ]
    if not items:
        lines.extend([
            "",
            "No groups connected yet.",
            "Use <b>Connect Group</b> to create a secure one-time connect token.",
            "After you add Roll Duel to a group, send the token inside that group to finish the connection.",
        ])
        return "\n".join(lines)

    ready_count = 0
    attention_count = 0
    for item in items:
        state, _ = _workspace_surface_state(item)
        if state == "ready":
            ready_count += 1
        elif state == "attention":
            attention_count += 1

    lines.extend([
        "",
        f"<b>Connected groups:</b> {len(items)}",
        f"<b>Publish-ready:</b> {ready_count} • <b>Needs setup:</b> {attention_count}",
    ])
    for item in items[:8]:
        title = str(item.get("title") or "Untitled Group")
        default_mark = " ⭐" if bool(int(item.get("is_default") or 0)) else ""
        _, state_label = _workspace_surface_state(item)
        duel_posts = "ON" if bool(int(item.get("post_duel_created_enabled") or 0)) else "OFF"
        result_posts = "ON" if bool(int(item.get("post_duel_result_enabled") or 0)) else "OFF"
        leaderboard_posts = "ON" if bool(int(item.get("leaderboard_posts_enabled") or 0)) else "OFF"
        weekly_summary = "ON" if bool(int(item.get("weekly_summary_enabled") or 0)) else "OFF"
        lines.append(f"• <b>{title}</b>{default_mark} — {state_label}")
        lines.append(
            f"  duel {duel_posts} • result {result_posts} • leaderboard {leaderboard_posts} • weekly {weekly_summary}"
        )
    lines.extend(["", "Open a group card below to recheck connection health, publish, or disconnect."])
    return "\n".join(lines)


def render_workspace_connect_text(payload: dict) -> str:
    return (
        "👥 <b>Connect Group</b>\n\n"
        "1. Add <b>Roll Duel</b> to your Telegram group.\n"
        "2. Make sure <b>you</b> are a group admin.\n"
        "3. Send this command inside that group within the token window:\n\n"
        f"<code>{payload['command']}</code>\n\n"
        "The connect token is one-time and bound to your user.\n"
        f"It expires in about <b>{payload['ttlMinutes']} minutes</b>."
    )


def _format_chat_member_status(value: str | None) -> str:
    normalized = str(value or "unknown").strip().lower()
    labels = {
        "creator": "creator",
        "administrator": "administrator",
        "member": "member",
        "restricted": "restricted",
        "left": "left",
        "kicked": "removed",
        "unknown": "unknown",
    }
    return labels.get(normalized, normalized or "unknown")


async def get_workspace_runtime_status(bot: Bot | None, *, user_id: int, detail: dict) -> dict:
    settings = detail.get("settings") or {}
    status = {
        "health": "attention",
        "healthLabel": "🟡 Needs attention",
        "botStatus": None,
        "userStatus": None,
        "botIsAdmin": False,
        "userIsAdmin": False,
        "issues": [],
        "warnings": [],
        "nextAction": "Use the controls below to finish setup or recheck the connection.",
    }

    if str(detail.get("status") or "").strip().lower() != "active" or not settings.get("isActive", True):
        status.update({
            "health": "offline",
            "healthLabel": "🔴 Disconnected",
            "issues": ["This group is currently disconnected inside Roll Duel."],
            "nextAction": "Reconnect the group from My Chats before publishing again.",
        })
        return status

    if bot is None:
        if _workspace_posts_enabled(settings):
            status.update({
                "health": "ready",
                "healthLabel": "🟢 Connected",
                "nextAction": "You can recheck the connection or publish from this surface.",
            })
        else:
            status["issues"].append("No posting surfaces are enabled yet.")
            status["nextAction"] = "Enable at least one post type below before publishing."
        return status

    chat_id = int(detail["chatId"])
    try:
        me = await bot.get_me()
        bot_member = await bot.get_chat_member(chat_id, me.id)
        bot_status = str(bot_member.status)
        status["botStatus"] = bot_status
        status["botIsAdmin"] = bot_status in {"administrator", "creator"}
        if bot_status not in {"administrator", "creator", "member"}:
            status.update({
                "health": "offline",
                "healthLabel": "🔴 Group unavailable",
                "issues": ["Roll Duel is no longer an active member of this group."],
                "nextAction": "Add Roll Duel back to the group, then reconnect it from My Chats.",
            })
            return status
        if bot_status == "member":
            status["warnings"].append("Roll Duel is a normal group member. Publishing can work, but some groups may still require stronger rights.")
    except (BadRequest, Forbidden) as exc:
        status.update({
            "health": "offline",
            "healthLabel": "🔴 Group unavailable",
            "issues": [f"Roll Duel cannot reach this group right now: {exc}"],
            "nextAction": "Make sure the bot is still inside the group, then reconnect or recheck the chat.",
        })
        return status
    except Exception as exc:
        status.update({
            "health": "offline",
            "healthLabel": "🔴 Group unavailable",
            "issues": [f"Live group check failed: {exc}"],
            "nextAction": "Recheck the connection after the group becomes reachable again.",
        })
        return status

    try:
        user_member = await bot.get_chat_member(chat_id, int(user_id))
        user_status = str(user_member.status)
        status["userStatus"] = user_status
        status["userIsAdmin"] = user_status in {"administrator", "creator"}
        if user_status in {"left", "kicked"}:
            status["issues"].append("You are no longer an active member of this group.")
        elif not status["userIsAdmin"]:
            status["issues"].append("You are not a group admin right now.")
    except Exception as exc:
        status["issues"].append(f"Could not verify your current group admin status: {exc}")

    if not _workspace_posts_enabled(settings):
        status["issues"].append("No posting surfaces are enabled yet.")

    if status["issues"]:
        status["health"] = "attention" if status["health"] != "offline" else status["health"]
        status["healthLabel"] = "🟡 Needs attention" if status["health"] != "offline" else status["healthLabel"]
        if any("No posting surfaces" in issue for issue in status["issues"]):
            status["nextAction"] = "Enable at least one post type below, then send a test post or publish a preview."
        elif any("group admin" in issue.lower() for issue in status["issues"]):
            status["nextAction"] = "Make sure you still have group admin rights, then tap Recheck status."
        else:
            status["nextAction"] = "Resolve the issue above, then recheck the group before publishing."
    else:
        status.update({
            "health": "ready",
            "healthLabel": "🟢 Ready to publish",
            "nextAction": "This group looks ready. You can send a test post, publish a leaderboard, or fine-tune the settings below.",
        })
    return status


def render_workspace_disconnect_confirm_text(detail: dict) -> str:
    return (
        "🔌 <b>Disconnect group</b>\n\n"
        f"<b>Group:</b> {detail.get('title') or 'Untitled Group'}\n\n"
        "This removes the group from your active My Chats surface and turns off posting for this connection.\n\n"
        "You can connect the same group again later with a new connect token."
    )


def render_workspace_detail_text(detail: dict, runtime_status: dict | None = None) -> str:
    settings = detail.get("settings") or {}
    lines = [
        "👥 <b>Group settings</b>",
        "",
        f"<b>Title:</b> {detail.get('title') or 'Untitled Group'}",
        f"<b>Status:</b> {runtime_status.get('healthLabel') if runtime_status else str(detail.get('status') or 'unknown').title()}",
        f"<b>Default target:</b> {'Yes' if detail.get('isDefault') else 'No'}",
        "",
        "<b>Posting settings</b>",
        f"• Duel posts: {'ON' if settings.get('postDuelCreatedEnabled') else 'OFF'}",
        f"• Result posts: {'ON' if settings.get('postDuelResultEnabled') else 'OFF'}",
        f"• Leaderboard posts: {'ON' if settings.get('leaderboardPostsEnabled') else 'OFF'}",
        f"• Weekly summary: {'ON' if settings.get('weeklySummaryEnabled') else 'OFF'}",
        f"• Default leaderboard scope: {str(settings.get('defaultLeaderboardScope') or 'chat').title()}",
    ]

    if runtime_status:
        lines.extend([
            "",
            "<b>Live checks</b>",
            f"• Bot in group: {_format_chat_member_status(runtime_status.get('botStatus'))}",
            f"• Your status: {_format_chat_member_status(runtime_status.get('userStatus'))}",
            f"• Posting surface: {'Configured' if _workspace_posts_enabled(settings) else 'Setup needed'}",
        ])
        if runtime_status.get("issues"):
            lines.extend(["", "<b>Action needed</b>"])
            lines.extend([f"• {issue}" for issue in runtime_status.get("issues") or []])
        if runtime_status.get("warnings"):
            lines.extend(["", "<b>Heads-up</b>"])
            lines.extend([f"• {warning}" for warning in runtime_status.get("warnings") or []])
        lines.extend(["", runtime_status.get("nextAction") or "Use the controls below to manage this group."])
    else:
        lines.extend([
            "",
            "Manual leaderboard publishing is live here. Use Recheck status before publishing if this group changed recently. Channel mode is still evaluation-only.",
        ])

    return "\n".join(lines)




def _format_giveaway_status(status: str | None) -> str:
    normalized = str(status or "").upper()
    labels = {
        "DRAFT": "📝 Draft",
        "ACTIVE": "🟢 Active",
        "ENDED": "🛑 Ended",
        "WINNERS_DRAWN": "🎉 Winners drawn",
        "RESULTS_PUBLISHED": "📣 Results published",
        "CANCELLED": "⚪ Cancelled",
    }
    return labels.get(normalized, normalized.title() or "Unknown")



def _format_giveaway_deadline(value) -> str:
    if not value:
        return "Not set"
    return _format_timestamp(value)



def _parse_giveaway_deadline_input(raw: str):
    value = str(raw or "").strip().lower()
    if not value:
        raise GiveawayError("missing_giveaway_deadline", "Send a deadline in UTC, for example 24h or 2026-04-20 18:00.", 400)
    now = datetime.utcnow()
    if re.fullmatch(r"\d+\s*h", value):
        hours = int(re.sub(r"\D", "", value))
        dt = now + timedelta(hours=hours)
    elif re.fullmatch(r"\d+\s*d", value):
        days = int(re.sub(r"\D", "", value))
        dt = now + timedelta(days=days)
    else:
        cleaned = value.replace("utc", "").strip()
        dt = None
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S"):
            try:
                dt = datetime.strptime(cleaned, fmt)
                break
            except ValueError:
                continue
        if dt is None:
            raise GiveawayError("invalid_giveaway_deadline", "Use 24h, 48h, 7d, or YYYY-MM-DD HH:MM in UTC.", 400)
    if dt <= now + timedelta(minutes=5):
        raise GiveawayError("invalid_giveaway_deadline", "Deadline must be at least 5 minutes in the future.", 400)
    return dt.replace(microsecond=0)



def render_giveaway_text(snapshot: dict) -> str:
    workspace = snapshot.get("workspace") or {}
    giveaway = snapshot.get("giveaway") or {}
    stats = snapshot.get("stats") or {}
    winners = snapshot.get("winners") or []
    if not giveaway:
        return (
            "🎁 <b>Giveaway</b>\n\n"
            f"<b>Group:</b> {escape(str(workspace.get('title') or 'Untitled Group'))}\n\n"
            "No giveaway is set up for this group yet.\n\n"
            "Create a draft first, then fill in the basics, activate it, end it manually, and draw winners when you are ready."
        )

    lines = [
        "🎁 <b>Giveaway</b>",
        "",
        f"<b>Group:</b> {escape(str(workspace.get('title') or giveaway.get('workspace_id') or 'Untitled Group'))}",
        f"<b>Title:</b> {escape(str(giveaway.get('title') or 'Untitled giveaway'))}",
        f"<b>Prize:</b> {escape(str(giveaway.get('prize_text') or 'Not set'))}",
        f"<b>Winners:</b> {int(giveaway.get('winners_count') or 0)}",
        f"<b>Deadline:</b> {_format_giveaway_deadline(giveaway.get('ends_at'))}",
        f"<b>Status:</b> {_format_giveaway_status(giveaway.get('status'))}",
        f"<b>Live post:</b> {'Published' if giveaway.get('published_message_id') else 'Not published'}",
        f"<b>Results post:</b> {'Published' if giveaway.get('results_message_id') else 'Not published'}",
        "",
        "<b>Stats</b>",
        f"• Entries: {int(stats.get('entriesCount') or 0)}",
        f"• Eligible: {int(stats.get('eligibleCount') or 0)}",
        f"• Ineligible: {int(stats.get('ineligibleCount') or 0)}",
        f"• Winners selected: {int(stats.get('winnersSelectedCount') or 0)}",
    ]
    status = str(giveaway.get("status") or "").upper()
    if status == "DRAFT":
        lines.extend(["", "Finish the basics, then activate this giveaway when everything looks right."])
    elif status == "ACTIVE":
        lines.extend(["", "This giveaway is live. Publish it in the group, keep collecting entries, then end it manually before drawing winners."])
    elif status == "ENDED":
        if int(stats.get('entriesCount') or 0) > 0:
            lines.extend(["", "Entries are closed. You can now draw winners."])
        else:
            lines.extend(["", "No entries were recorded for this giveaway.", "Resolve it by cancelling this round or publishing a no-winner result, then start the next one."])
    elif status == "WINNERS_DRAWN":
        lines.extend(["", "<b>Winners</b>"])
        if winners:
            for row in winners[:10]:
                lines.append(f"• #{int(row.get('place') or 0)} — user {int(row.get('user_id') or 0)}")
            lines.extend(["", "Publish the results in the group when you are ready."])
        else:
            lines.append("• No winners were selected.")
            lines.extend(["", "Publish a no-winner result to close this round cleanly."])
    elif status == "RESULTS_PUBLISHED":
        if int(stats.get('entriesCount') or 0) == 0:
            lines.extend(["", "This round closed with no entries. You can create the next giveaway when you are ready."])
        else:
            lines.extend(["", "This giveaway is complete. You can create the next one when you are ready."])
    elif status == "CANCELLED":
        lines.extend(["", "This giveaway was cancelled. You can start a fresh one for this group."])
    return "\n".join(lines)


def render_giveaway_edit_prompt(field_name: str, giveaway_title: str | None = None) -> str:
    title = escape(str(giveaway_title or "this giveaway"))
    prompts = {
        "title": f"🎁 <b>Edit title</b>\n\nCurrent giveaway: <b>{title}</b>\n\nSend the new title in one message.",
        "prize": f"🎁 <b>Edit prize</b>\n\nCurrent giveaway: <b>{title}</b>\n\nSend the new prize text in one message.",
        "winners": f"🎁 <b>Edit winners count</b>\n\nCurrent giveaway: <b>{title}</b>\n\nSend a whole number like <b>1</b>, <b>3</b>, or <b>5</b>.",
        "deadline": f"🎁 <b>Edit deadline</b>\n\nCurrent giveaway: <b>{title}</b>\n\nSend the deadline in UTC.\nExamples:\n• <code>24h</code>\n• <code>48h</code>\n• <code>7d</code>\n• <code>2026-04-20 18:00</code>",
    }
    return prompts[field_name]


def render_giveaway_confirm_text(action: str, snapshot: dict) -> str:
    giveaway = snapshot.get("giveaway") or {}
    stats = snapshot.get("stats") or {}
    title = escape(str(giveaway.get("title") or "Untitled giveaway"))
    status = _format_giveaway_status(giveaway.get("status"))
    mapping = {
        "activate": "Activate this giveaway and start accepting entries?",
        "end": "End this giveaway now? New entries will stop immediately.",
        "draw": "Draw winners now? This action is final for this giveaway.",
        "results": "Mark results as published now?",
        "cancel": "Cancel this giveaway now? This cannot be undone from the bot.",
    }
    if action == "cancel" and str(giveaway.get("status") or "").upper() == "ENDED" and int(stats.get("entriesCount") or 0) == 0:
        mapping["cancel"] = "Cancel this empty giveaway and clear the slot for the next round?"
    return f"🎁 <b>{title}</b>\n\n<b>Status:</b> {status}\n\n{mapping[action]}"


def _format_giveaway_public_deadline(value) -> str:
    formatted = _format_giveaway_deadline(value)
    return formatted if formatted != "Not set" else "TBD"


def _format_winner_public_label(row: dict) -> str:
    username = str(row.get("username") or "").strip()
    if username:
        return f"@{username}"
    first_name = str(row.get("first_name") or "").strip()
    if first_name:
        return first_name
    return f"user {int(row.get('user_id') or 0)}"


def render_public_giveaway_post_text(snapshot: dict) -> str:
    workspace = snapshot.get("workspace") or {}
    giveaway = snapshot.get("giveaway") or {}
    stats = snapshot.get("stats") or {}
    title = escape(str(giveaway.get("title") or "Untitled giveaway"))
    prize = escape(str(giveaway.get("prize_text") or "Prize will be announced"))
    group_title = escape(str(workspace.get("title") or "this group"))
    entries_count = int(stats.get("entriesCount") or 0)
    return (
        "🎁 <b>Giveaway</b>\n\n"
        f"<b>{title}</b>\n"
        f"Prize: {prize}\n"
        f"Winners: {int(giveaway.get('winners_count') or 0)}\n"
        f"Deadline: {_format_giveaway_public_deadline(giveaway.get('ends_at'))}\n"
        f"Group: {group_title}\n"
        f"Entries so far: {entries_count}\n\n"
        "Live now. Tap below to join."
    )


def render_public_giveaway_result_text(snapshot: dict) -> str:
    giveaway = snapshot.get("giveaway") or {}
    stats = snapshot.get("stats") or {}
    winners = snapshot.get("winners") or []
    title = escape(str(giveaway.get("title") or "Untitled giveaway"))
    prize = escape(str(giveaway.get("prize_text") or "Prize"))
    total_entries = int(stats.get("entriesCount") or 0)
    requested_winners = int(giveaway.get("winners_count") or 0)
    lines = [
        "🏁 <b>Giveaway finished</b>",
        "",
        f"<b>{title}</b>",
        f"Prize: {prize}",
        f"Total entries: {total_entries}",
        "",
        "<b>Winners</b>",
    ]
    if winners:
        for row in winners[:10]:
            lines.append(f"• #{int(row.get('place') or 0)} — {escape(_format_winner_public_label(row))}")
    else:
        lines.append("• This round had no winners.")
    if winners and len(winners) < requested_winners:
        lines.extend(["", "Not enough valid entries to fill all winner slots."])
    elif total_entries == 0:
        lines.extend(["", "No valid entries were recorded for this giveaway."])
    return "\n".join(lines)


async def show_giveaway_detail(target, *, user_id: int, workspace_id: str | None = None, giveaway_id: str | None = None, edit: bool = True):
    try:
        snapshot = get_giveaway_owner_snapshot(owner_user_id=user_id, workspace_id=workspace_id, giveaway_id=giveaway_id)
    except GiveawayError as exc:
        if hasattr(target, "edit_message_text") and edit:
            await target.edit_message_text(
                f"❌ {exc.message}",
                parse_mode=ParseMode.HTML,
                reply_markup=get_workspace_list_keyboard(list_workspaces_for_user(user_id)),
            )
        else:
            await target.reply_text(
                f"❌ {exc.message}",
                parse_mode=ParseMode.HTML,
                reply_markup=get_workspace_list_keyboard(list_workspaces_for_user(user_id)),
            )
        return
    text = render_giveaway_text(snapshot)
    keyboard = get_giveaway_detail_keyboard(snapshot)
    if hasattr(target, "edit_message_text") and edit:
        await target.edit_message_text(text, parse_mode=ParseMode.HTML, reply_markup=keyboard, disable_web_page_preview=True)
    else:
        await target.reply_text(text, parse_mode=ParseMode.HTML, reply_markup=keyboard, disable_web_page_preview=True)


def _is_stale_callback_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return (
        "query is too old" in message
        or "response timeout expired" in message
        or "query id is invalid" in message
        or "query_id_invalid" in message
    )


async def safe_answer_callback(query, *args, **kwargs) -> bool:
    try:
        await query.answer(*args, **kwargs)
        return True
    except BadRequest as exc:
        if _is_stale_callback_error(exc):
            logger.info("Ignoring stale callback query for user %s: %s", query.from_user.id, exc)
            return False
        raise



def _check_product_access(user_id: int, action: str) -> tuple[bool, str | None]:
    if platform_settings.get_bool("maintenance_mode"):
        return False, "🛠️ Service is temporarily unavailable while maintenance is in progress."
    if action == "duel" and not platform_settings.get_bool("duels_enabled"):
        return False, "🛠️ Creating and joining duels is temporarily unavailable."
    if action == "withdraw" and not platform_settings.get_bool("withdrawals_enabled"):
        return False, "🛠️ Withdrawals are temporarily unavailable."
    if action == "deposit" and not platform_settings.get_bool("deposits_enabled"):
        return False, "🛠️ Deposits are temporarily unavailable."
    allowed, reason = risk_service.can_user_perform(user_id, action)
    if not allowed:
        return False, f"❌ {reason}"
    return True, None


async def send_reminder(context, game_id, user_id):
    # Проверяем, бросил ли игрок кубик
    active_game = get_active_game(user_id)
    if not active_game or active_game['game_id'] != game_id:
        return
    if (user_id == active_game['player1_id'] and active_game['player1_roll'] > 0) or \
       (user_id == active_game['player2_id'] and active_game['player2_roll'] > 0):
        return
    try:
        await context.bot.send_message(
            chat_id=user_id,
            text="⏰ You have 30 seconds left to send your dice roll!"
        )
    except Exception as e:
        logger.error(f"Ошибка отправки напоминания игроку {user_id}: {e}")

async def handle_timeout(context, game_id, player1_id, player2_id):
    # Получаем актуальное состояние игры
    game = get_active_game(player1_id) or get_active_game(player2_id)
    if not game or game['game_id'] != game_id:
        return

    result = settle_timeout_game(game_id)
    if not result.get('ok'):
        logger.error(f"Ошибка тайм-аут завершения игры {game_id}: {result.get('error')}")
        return

    if result.get('outcome') == 'cancelled':
        msg = "⏰ Time expired. The duel was cancelled and both stakes were returned."
        try:
            await context.bot.send_message(chat_id=player1_id, text=msg, reply_markup=remove_reply_keyboard())
            await context.bot.send_message(chat_id=player2_id, text=msg, reply_markup=remove_reply_keyboard())
            await context.bot.send_message(chat_id=player1_id, text=render_main_menu_text(), reply_markup=_main_menu_markup(player1_id))
            await context.bot.send_message(chat_id=player2_id, text=render_main_menu_text(), reply_markup=_main_menu_markup(player2_id))
        except Exception as e:
            logger.error(f"Ошибка отправки уведомления об отмене: {e}")
    elif result.get('outcome') == 'player1_win':
        msg_win = "⏰ Time expired. You win because your opponent did not roll in time."
        msg_lose = "❌ You did not roll in time, so the duel was closed."
        try:
            await context.bot.send_message(chat_id=player1_id, text=msg_win)
            await context.bot.send_message(chat_id=player2_id, text=msg_lose, reply_markup=remove_reply_keyboard())
            await context.bot.send_message(chat_id=player2_id, text=render_main_menu_text(), reply_markup=_main_menu_markup(player2_id))
            await context.bot.send_message(chat_id=player1_id, text=render_main_menu_text(), reply_markup=_main_menu_markup(player1_id))
        except Exception as e:
            logger.error(f"Ошибка отправки уведомления о победе/проигрыше: {e}")
    elif result.get('outcome') == 'player2_win':
        msg_win = "⏰ Time expired. You win because your opponent did not roll in time."
        msg_lose = "❌ You did not roll in time, so the duel was closed."
        try:
            await context.bot.send_message(chat_id=player2_id, text=msg_win)
            await context.bot.send_message(chat_id=player1_id, text=msg_lose, reply_markup=remove_reply_keyboard())
            await context.bot.send_message(chat_id=player1_id, text=render_main_menu_text(), reply_markup=_main_menu_markup(player1_id))
            await context.bot.send_message(chat_id=player2_id, text=render_main_menu_text(), reply_markup=_main_menu_markup(player2_id))
        except Exception as e:
            logger.error(f"Ошибка отправки уведомления о победе/проигрыше: {e}")

    try:
        await publish_result_to_default_workspaces(context.bot, participant_user_ids=[player1_id, player2_id], game_id=game_id)
    except Exception as e:
        logger.error(f"Ошибка публикации тайм-аут результата в группы: {e}")

    _clear_timer_scope(game_id, [player1_id, player2_id])

async def start_timers(context, game_id, player1_id, player2_id):
    for uid in [player1_id, player2_id]:
        # Напоминание через 30 секунд
        reminder_job = scheduler.add_job(
            send_reminder,
            'date',
            run_date=datetime.now() + timedelta(seconds=30),
            args=[context, game_id, uid],
            id=f"reminder_{game_id}_{uid}"
        )
        # Тайм-аут через 1 минуту
        timeout_job = scheduler.add_job(
            handle_timeout,
            'date',
            run_date=datetime.now() + timedelta(seconds=60),
            args=[context, game_id, player1_id, player2_id],
            id=f"timeout_{game_id}_{uid}"
        )
        _store_timer_job(game_id, uid, 'reminder', reminder_job)
        _store_timer_job(game_id, uid, 'timeout', timeout_job)

async def send_practice_reminder(context, practice_game_id, user_id):
    active_game = get_active_practice_game(user_id)
    if not active_game or int(active_game['practice_game_id']) != int(practice_game_id):
        return
    if (user_id == active_game['player1_id'] and active_game['player1_roll'] > 0) or        (user_id == active_game.get('player2_id') and active_game['player2_roll'] > 0):
        return
    try:
        await context.bot.send_message(
            chat_id=user_id,
            text="⏰ You have 30 seconds left to send your dice roll in the practice duel!",
        )
    except Exception as e:
        logger.error(f"Error sending practice reminder to {user_id}: {e}")


async def handle_practice_timeout(context, practice_game_id, player1_id, player2_id):
    game = get_active_practice_game(player1_id) or get_active_practice_game(player2_id)
    if not game or int(game['practice_game_id']) != int(practice_game_id):
        return
    p1_roll = int(game['player1_roll'] or 0)
    p2_roll = int(game['player2_roll'] or 0)
    if p1_roll > 0 and p2_roll == 0:
        settle_result = settle_practice_game(practice_game_id, player1_id, reason='timeout')
        if settle_result.get('ok'):
            try:
                await context.bot.send_message(chat_id=player1_id, text="⏰ Practice duel timeout. You win because your opponent did not roll in time.")
                await context.bot.send_message(chat_id=player2_id, text="❌ Practice duel timeout. You did not roll in time.", reply_markup=remove_reply_keyboard())
            except Exception as e:
                logger.error(f"Error notifying practice timeout win/lose: {e}")
    elif p2_roll > 0 and p1_roll == 0:
        settle_result = settle_practice_game(practice_game_id, player2_id, reason='timeout')
        if settle_result.get('ok'):
            try:
                await context.bot.send_message(chat_id=player2_id, text="⏰ Practice duel timeout. You win because your opponent did not roll in time.")
                await context.bot.send_message(chat_id=player1_id, text="❌ Practice duel timeout. You did not roll in time.", reply_markup=remove_reply_keyboard())
            except Exception as e:
                logger.error(f"Error notifying practice timeout win/lose: {e}")
    else:
        settle_result = settle_practice_game(practice_game_id, None, reason='timeout')
        if settle_result.get('ok'):
            try:
                await context.bot.send_message(chat_id=player1_id, text="⏰ Practice duel timed out. Demo stakes were returned.", reply_markup=remove_reply_keyboard())
                await context.bot.send_message(chat_id=player2_id, text="⏰ Practice duel timed out. Demo stakes were returned.", reply_markup=remove_reply_keyboard())
            except Exception as e:
                logger.error(f"Error notifying practice timeout cancel: {e}")
    try:
        await context.bot.send_message(chat_id=player1_id, text="🧪 Ready for another practice duel?", reply_markup=get_practice_menu_keyboard())
        await context.bot.send_message(chat_id=player2_id, text="🧪 Ready for another practice duel?", reply_markup=get_practice_menu_keyboard())
    except Exception:
        pass
    practice_key = f"practice:{practice_game_id}"
    _clear_timer_scope(practice_key, [player1_id, player2_id])


async def start_practice_timers(context, practice_game_id, player1_id, player2_id):
    practice_key = f"practice:{practice_game_id}"
    for uid in [player1_id, player2_id]:
        reminder_job = scheduler.add_job(
            send_practice_reminder,
            'date',
            run_date=datetime.now() + timedelta(seconds=30),
            args=[context, practice_game_id, uid],
            id=f"practice_reminder_{practice_game_id}_{uid}",
        )
        timeout_job = scheduler.add_job(
            handle_practice_timeout,
            'date',
            run_date=datetime.now() + timedelta(seconds=60),
            args=[context, practice_game_id, player1_id, player2_id],
            id=f"practice_timeout_{practice_game_id}_{uid}",
        )
        _store_timer_job(practice_key, uid, 'reminder', reminder_job)
        _store_timer_job(practice_key, uid, 'timeout', timeout_job)


async def cancel_timers(game_id, user_id):
    _clear_timer_user(game_id, user_id)

def _render_start_landing_text(*, start_arg: str | None, attribution: dict | None) -> str:
    parsed = parse_share_start_param(start_arg)
    lines = [render_main_menu_text()]
    if attribution and attribution.get("attributionStatus") == "created":
        inviter = ((attribution.get("invitedBy") or {}).get("displayName") or "your friend")
        lines.extend([
            "",
            f"✅ <b>Invite linked:</b> you joined from {inviter}.",
        ])
    elif attribution and attribution.get("attributionStatus") == "existing":
        lines.extend([
            "",
            "ℹ️ <b>Invite already linked:</b> your referral was already recorded earlier.",
        ])
    elif attribution and str(attribution.get("attributionStatus") or "").startswith("invalid_"):
        lines.extend([
            "",
            "⚠️ <b>Invite link ignored:</b> this start link is not valid for referral credit.",
        ])

    if parsed.get("kind") == "duel":
        lines.extend([
            "",
            "🔗 <b>Duel share detected:</b> use <b>Find Duel</b> from the classic menu to browse open duels.",
        ])
    elif parsed.get("kind") == "result":
        lines.extend([
            "",
            "🏁 <b>Result share detected:</b> the classic bot is primary now — open <b>Find Duel</b> or <b>Create Duel</b> below.",
        ])
    return "\n".join(lines)


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle /start and show the classic bot menu."""
    cleanup_expired_user_runtime_states()
    user = update.effective_user
    user_states.pop(user.id, None)
    create_or_update_user(user.id, user.username, user.first_name)
    start_arg = context.args[0].strip() if context.args else ''
    attribution = None
    normalized_arg = start_arg.lower()
    if normalized_arg and normalized_arg not in {'menu', 'create', 'find', 'leaderboard', 'profile', 'invite', 'groups', 'help', 'balance', 'support', 'app', 'practice', 'history'}:
        attribution = attempt_referral_attribution(invited_user_id=user.id, start_param=start_arg)

    if normalized_arg == 'practice':
        await update.message.reply_text(
            render_practice_menu_text(user.id),
            reply_markup=get_practice_menu_keyboard(),
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=True,
        )
        return
    if normalized_arg == 'history':
        snapshot = get_duel_history(user.id, limit=10)
        await update.message.reply_text(
            render_duel_history_text(snapshot),
            reply_markup=get_duel_history_keyboard(bool(snapshot.get('items'))),
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=True,
        )
        return

    text = _render_start_landing_text(start_arg=start_arg, attribution=attribution)
    await update.message.reply_text(
        text,
        reply_markup=_main_menu_markup(user.id),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


async def app_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Send a one-tap Mini App launcher from the slash-command menu."""
    user = update.effective_user
    user_states.pop(user.id, None)
    create_or_update_user(user.id, user.username, user.first_name)
    await update.message.reply_text(
        render_open_app_text(),
        reply_markup=get_open_app_keyboard(),
        parse_mode=ParseMode.HTML,
    )


async def practice_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_states.pop(user.id, None)
    create_or_update_user(user.id, user.username, user.first_name)
    await update.message.reply_text(
        render_practice_menu_text(user.id),
        reply_markup=get_practice_menu_keyboard(),
        parse_mode=ParseMode.HTML,
    )


async def show_workspace_list(target, *, user_id: int, edit: bool = True):
    text = render_workspace_list_text(user_id)
    keyboard = get_workspace_list_keyboard(list_workspaces_for_user(user_id))
    if edit:
        await target.edit_message_text(text, parse_mode=ParseMode.HTML, reply_markup=keyboard)
    else:
        await target.reply_text(text, parse_mode=ParseMode.HTML, reply_markup=keyboard)


async def show_workspace_detail(target, *, user_id: int, workspace_id: str, edit: bool = True, bot: Bot | None = None):
    detail = get_workspace_detail(user_id, workspace_id)
    if not detail:
        if edit:
            await target.edit_message_text(
                "❌ Group not found.",
                reply_markup=get_workspace_list_keyboard(list_workspaces_for_user(user_id)),
            )
        else:
            await target.reply_text(
                "❌ Group not found.",
                reply_markup=get_workspace_list_keyboard(list_workspaces_for_user(user_id)),
            )
        return
    runtime_status = await get_workspace_runtime_status(bot, user_id=user_id, detail=detail)
    text = render_workspace_detail_text(detail, runtime_status=runtime_status)
    keyboard = get_workspace_settings_keyboard(detail)
    if edit:
        await target.edit_message_text(text, parse_mode=ParseMode.HTML, reply_markup=keyboard, disable_web_page_preview=True)
    else:
        await target.reply_text(text, parse_mode=ParseMode.HTML, reply_markup=keyboard, disable_web_page_preview=True)


async def handle_leaderboard_callback(query, context, *, scope: str = "global"):
    user_id = query.from_user.id
    snapshot = get_leaderboard_snapshot(user_id)
    normalized_scope = str(scope or "global").strip().lower()
    if normalized_scope == "leaderboard":
        normalized_scope = "global"
    if normalized_scope == "chat":
        normalized_scope = "workspace"
    await query.edit_message_text(
        render_leaderboard_text(snapshot, scope=normalized_scope),
        parse_mode=ParseMode.HTML,
        reply_markup=get_leaderboard_keyboard(normalized_scope, workspace_available=bool((snapshot.get("workspace") or {}).get("available"))),
        disable_web_page_preview=True,
    )


async def leaderboard_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_states.pop(user.id, None)
    create_or_update_user(user.id, user.username, user.first_name)
    snapshot = get_leaderboard_snapshot(user.id)
    await update.message.reply_text(
        render_leaderboard_text(snapshot, scope="global"),
        parse_mode=ParseMode.HTML,
        reply_markup=get_leaderboard_keyboard("global", workspace_available=bool((snapshot.get("workspace") or {}).get("available"))),
        disable_web_page_preview=True,
    )


async def create_duel_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_states.pop(user.id, None)
    create_or_update_user(user.id, user.username, user.first_name)
    allowed, error_text = _check_product_access(user.id, 'duel')
    if not allowed:
        await update.message.reply_text(error_text)
        return
    active_kind, _ = _get_active_duel_context(user.id)
    if active_kind:
        await update.message.reply_text(
            _describe_active_duel_conflict(active_kind),
            reply_markup=get_back_button(),
        )
        return
    await update.message.reply_text(
        "💰 <b>Create Duel</b>\n\nChoose a TON stake for the new duel:",
        reply_markup=get_bet_amount_keyboard(),
        parse_mode=ParseMode.HTML,
    )


async def find_duel_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_states.pop(user.id, None)
    create_or_update_user(user.id, user.username, user.first_name)
    allowed, error_text = _check_product_access(user.id, 'duel')
    if not allowed:
        await update.message.reply_text(error_text)
        return
    active_kind, _ = _get_active_duel_context(user.id)
    if active_kind:
        await update.message.reply_text(
            _describe_active_duel_conflict(active_kind),
            reply_markup=get_back_button(),
        )
        return
    waiting_games = get_waiting_games()
    text = "🔍 <b>Find Duel</b>\n\n"
    text += "Open duels:" if waiting_games else "😔 No open duels yet.\nCreate one to start the lobby."
    await update.message.reply_text(
        text,
        reply_markup=get_waiting_games_keyboard(waiting_games, user.id),
        parse_mode=ParseMode.HTML,
    )


async def handle_practice_mode_callback(query, context):
    await query.edit_message_text(
        render_practice_menu_text(query.from_user.id),
        parse_mode=ParseMode.HTML,
        reply_markup=get_practice_menu_keyboard(),
    )


async def handle_create_practice_game(query, context):
    allowed, error_text = _check_product_access(query.from_user.id, 'duel')
    if not allowed:
        await safe_answer_callback(query, error_text, show_alert=True)
        return
    active_kind, _ = _get_active_duel_context(query.from_user.id)
    if active_kind:
        await query.edit_message_text(
            _describe_active_duel_conflict(active_kind),
            reply_markup=get_back_button(),
        )
        return
    await query.edit_message_text(
        "🧪 <b>Create Practice Duel</b>\n\nChoose a Demo TON stake for the new practice duel:",
        reply_markup=get_practice_bet_amount_keyboard(),
        parse_mode=ParseMode.HTML,
    )


async def handle_practice_bet_selection(query, context):
    user_id = query.from_user.id
    callback_data = query.data
    stake_amount = float(callback_data.replace("pbet_", ""))
    create_result = create_practice_game(user_id, stake_amount)
    if not create_result.get('ok'):
        await query.edit_message_text(
            f"❌ {create_result.get('error', 'Could not create the practice duel.')}",
            reply_markup=get_practice_bet_amount_keyboard(),
        )
        return
    practice_game_id = int(create_result['practice_game_id'])
    success_text = (
        "✅ <b>Practice Duel created.</b>\n\n"
        f"🧪 Practice Duel ID: {practice_game_id}\n"
        f"💎 Stake: {_format_practice_amount(stake_amount)}\n"
        f"💼 Remaining practice balance: {get_practice_balance(user_id):.2f} Demo TON\n"
        "⏳ Waiting for another player...\n\n"
        "This duel uses demo balance only."
    )
    msg = await query.edit_message_text(
        success_text,
        reply_markup=get_practice_game_created_keyboard(practice_game_id),
        parse_mode=ParseMode.HTML,
    )
    set_practice_room_message_id(practice_game_id, msg.message_id)


async def handle_find_practice_game(query, context):
    allowed, error_text = _check_product_access(query.from_user.id, 'duel')
    if not allowed:
        await safe_answer_callback(query, error_text, show_alert=True)
        return
    active_kind, _ = _get_active_duel_context(query.from_user.id)
    if active_kind:
        await query.edit_message_text(
            _describe_active_duel_conflict(active_kind),
            reply_markup=get_back_button(),
        )
        return
    waiting_games = get_waiting_practice_games()
    text = "🔍 <b>Find Practice Duel</b>\n\n"
    text += "Open practice duels:" if waiting_games else "😔 No open practice duels yet.\nCreate one to start the demo lobby."
    await query.edit_message_text(
        text,
        reply_markup=get_waiting_practice_games_keyboard(waiting_games, query.from_user.id),
        parse_mode=ParseMode.HTML,
    )


async def handle_join_practice_game_request(query, context):
    practice_game_id = int(query.data.replace("pjoin_game_", ""))
    user_id = query.from_user.id
    allowed, error_text = _check_product_access(user_id, 'duel')
    if not allowed:
        await safe_answer_callback(query, text=error_text, show_alert=True)
        return
    active_kind, _ = _get_active_duel_context(user_id)
    if active_kind:
        await query.edit_message_text(
            _describe_active_duel_conflict(active_kind),
            reply_markup=get_back_button(),
        )
        return
    waiting_games = get_waiting_practice_games()
    game_info = None
    for game in waiting_games:
        if int(game['practice_game_id']) == practice_game_id:
            game_info = game
            break
    if not game_info:
        await query.edit_message_text(
            "❌ This practice duel is no longer available.",
            reply_markup=get_practice_menu_keyboard(),
        )
        return
    balance = get_practice_balance(user_id)
    stake_amount = float(game_info['stake_amount'])
    if balance < stake_amount:
        await query.edit_message_text(
            f"❌ Insufficient practice balance.\n\n💎 Available: {balance:.2f} Demo TON",
            reply_markup=get_practice_balance_keyboard(),
        )
        return
    text = (
        "🧪 <b>Join Practice Duel</b>\n\n"
        f"👤 Opponent: {game_info['first_name']}\n"
        f"💎 Stake: {_format_practice_amount(stake_amount)}\n"
        f"💼 Your practice balance: {balance:.2f} Demo TON\n\n"
        "Confirm the practice join:"
    )
    await query.edit_message_text(
        text,
        reply_markup=get_practice_game_confirmation_keyboard(practice_game_id, stake_amount),
        parse_mode=ParseMode.HTML,
    )


async def handle_confirm_join_practice(query, context):
    practice_game_id = int(query.data.replace("pconfirm_join_", ""))
    user_id = query.from_user.id
    waiting_games = get_waiting_practice_games()
    game_info = None
    for game in waiting_games:
        if int(game['practice_game_id']) == practice_game_id:
            game_info = game
            break
    if not game_info:
        await query.edit_message_text(
            "❌ This practice duel is no longer available.",
            reply_markup=get_waiting_practice_games_keyboard([], user_id),
        )
        return
    join_result = join_practice_game(practice_game_id, user_id)
    if not join_result.get('ok'):
        await query.edit_message_text(
            f"❌ {join_result.get('error', 'Could not join the practice duel.')}",
            reply_markup=get_practice_menu_keyboard(),
        )
        return
    game_text = (
        "🧪 <b>Practice Duel started.</b>\n\n"
        f"🧪 Practice Duel #{practice_game_id}\n"
        f"💎 Stake: {_format_practice_amount(game_info['stake_amount'])}\n\n"
        "Both players can send a fresh 🎲 dice roll now. No real TON is used."
    )
    await query.edit_message_text(game_text, parse_mode=ParseMode.HTML)
    await context.bot.send_message(
        chat_id=user_id,
        text="🎲 Send your next dice roll in this chat for the practice duel:",
        reply_markup=get_game_keyboard(),
    )
    try:
        await context.bot.send_message(chat_id=game_info['player1_id'], text=game_text, parse_mode=ParseMode.HTML)
        await context.bot.send_message(
            chat_id=game_info['player1_id'],
            text="🎲 Send your next dice roll in this chat for the practice duel:",
            reply_markup=get_game_keyboard(),
        )
    except Exception as e:
        logger.error(f"Error notifying practice duel owner: {e}")
    room_message_id = get_practice_room_message_id(practice_game_id)
    if room_message_id:
        try:
            await context.bot.delete_message(chat_id=game_info['player1_id'], message_id=room_message_id)
        except Exception as e:
            logger.error(f"Error deleting practice room message: {e}")
    await start_practice_timers(context, practice_game_id, game_info['player1_id'], user_id)


async def handle_cancel_practice_game(query, context):
    practice_game_id = int(query.data.replace("pcancel_game_", ""))
    user_id = query.from_user.id
    waiting_games = get_waiting_practice_games()
    game_info = None
    for game in waiting_games:
        if int(game['practice_game_id']) == practice_game_id and int(game['player1_id']) == int(user_id):
            game_info = game
            break
    if not game_info:
        await query.edit_message_text(
            "❌ Practice duel not found or it has already started.",
            reply_markup=get_back_button(),
        )
        return
    cancel_result = cancel_waiting_practice_game(practice_game_id, user_id)
    if cancel_result.get('ok'):
        await query.edit_message_text(
            f"✅ Practice duel cancelled.\n💎 Stake {_format_practice_amount(game_info['stake_amount'])} was returned to your practice balance.",
            reply_markup=get_practice_menu_keyboard(),
        )
    else:
        await query.edit_message_text(
            f"❌ {cancel_result.get('error', 'Could not cancel the practice duel.')}",
            reply_markup=get_practice_menu_keyboard(),
        )


async def handle_practice_balance_callback(query, context):
    await query.edit_message_text(
        render_practice_balance_text(query.from_user.id),
        reply_markup=get_practice_balance_keyboard(),
        parse_mode=ParseMode.HTML,
    )


async def handle_practice_about_callback(query, context):
    await query.edit_message_text(
        render_practice_about_text(),
        reply_markup=get_practice_menu_keyboard(),
        parse_mode=ParseMode.HTML,
    )


async def groups_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_states.pop(user.id, None)
    create_or_update_user(user.id, user.username, user.first_name)
    await show_workspace_list(update.message, user_id=user.id, edit=False)


async def connect_group_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    message = update.message
    user = update.effective_user
    if not message or not user:
        return
    create_or_update_user(user.id, user.username, user.first_name)

    if message.chat.type == 'private':
        payload = create_connect_request(user.id)
        await message.reply_text(
            render_workspace_connect_text(payload),
            parse_mode=ParseMode.HTML,
            reply_markup=get_workspace_connect_keyboard(),
        )
        return

    if message.chat.type not in {'group', 'supergroup'}:
        await message.reply_text("❌ Only Telegram groups are supported in this step.")
        return

    token = context.args[0].strip() if context.args else ''
    if not token:
        await message.reply_text("❌ Missing connect token. Create one from the bot menu in private chat.")
        return

    try:
        user_member = await context.bot.get_chat_member(message.chat.id, user.id)
    except Exception as exc:
        await message.reply_text(f"❌ Could not verify your admin status: {exc}")
        return
    if str(user_member.status) not in {'administrator', 'creator'}:
        await message.reply_text("❌ You must be a group admin to connect this chat.")
        return

    try:
        detail = activate_connect_request(
            token=token,
            user_id=user.id,
            chat_id=message.chat.id,
            chat_title=message.chat.title or 'Untitled Group',
            chat_type=message.chat.type,
        )
    except WorkspaceError as exc:
        await message.reply_text(f"❌ {exc.message}")
        return

    await message.reply_text(
        "✅ Roll Duel is now connected to this group. Configure posting from the private bot chat.",
        parse_mode=ParseMode.HTML,
    )
    try:
        runtime_status = await get_workspace_runtime_status(context.bot, user_id=user.id, detail=detail)
        await context.bot.send_message(
            chat_id=user.id,
            text=render_workspace_detail_text(detail, runtime_status=runtime_status),
            parse_mode=ParseMode.HTML,
            reply_markup=get_workspace_settings_keyboard(detail),
            disable_web_page_preview=True,
        )
    except Exception as exc:
        logger.warning("Could not DM workspace settings to user %s: %s", user.id, exc)


def _format_admin_user_card(row) -> str:
    info = f"<b>Пользователь #{row['user_id']}</b>\n"
    info += f"Имя: {row['first_name'] or '-'}\n"
    info += f"Username: @{row['username'] or '-'}\n"
    info += f"Баланс: {row['balance']:.2f} TON\n"
    info += f"Статус: {'Заблокирован' if row['is_blocked'] else 'Активен'}\n"
    info += f"Игр сыграно: {row['games_played']}\n"
    info += f"Побед: {row['games_won']}\n"
    info += f"Дата регистрации: {row['created_at']} (UTC)"
    return info


def _fetch_admin_user_row(target_id: int, *, include_profit: bool = False):
    fields = "user_id, username, first_name, balance, is_blocked, games_played, games_won, created_at"
    if include_profit:
        fields = "user_id, username, first_name, balance, games_played, games_won, profit, created_at"
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(f"SELECT {fields} FROM users WHERE user_id = ?", (target_id,))
        return cursor.fetchone()
    finally:
        conn.close()


def _load_admin_settings_flags() -> tuple[bool, bool]:
    return platform_settings.get_bool('duels_enabled'), platform_settings.get_bool('withdrawals_enabled')


def _admin_broadcasts_hub_keyboard(admin_web_url: str | None = None) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [[InlineKeyboardButton("➕ New draft", callback_data="admin_bc_new")]]
    active = broadcast_service.get_active_broadcast()
    if active:
        rows.append([InlineKeyboardButton("▶️ Open active", callback_data=f"admin_bc_open|{active['broadcast_id']}")])
    for item in broadcast_service.list_recent_broadcasts(limit=4):
        rows.append([
            InlineKeyboardButton(
                f"📣 {str(item.get('status') or 'draft').title()} · {str(item.get('broadcast_id') or '')[:8]}",
                callback_data=f"admin_bc_open|{item['broadcast_id']}",
            )
        ])
    if admin_web_url:
        rows.append([InlineKeyboardButton("🌐 Open web admin", url=admin_web_url)])
    rows.append([InlineKeyboardButton("◀️ Back", callback_data="admin_panel")])
    return InlineKeyboardMarkup(rows)


def _admin_broadcast_audience_keyboard(broadcast_id: str) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    current_row: list[InlineKeyboardButton] = []
    for key, label in broadcast_service.AUDIENCE_CHOICES.items():
        current_row.append(InlineKeyboardButton(label[:28], callback_data=f"admin_bc_aud|{broadcast_id}|{key}"))
        if len(current_row) == 2:
            rows.append(current_row)
            current_row = []
    if current_row:
        rows.append(current_row)
    rows.append([InlineKeyboardButton("◀️ Back", callback_data=f"admin_bc_open|{broadcast_id}")])
    return InlineKeyboardMarkup(rows)


def _admin_notice_hub_keyboard(admin_web_url: str | None = None) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = [[InlineKeyboardButton("➕ New notice", callback_data="admin_notice_new")]]
    active = notice_service.get_active_notice()
    if active:
        rows.append([InlineKeyboardButton("📢 Open active", callback_data=f"admin_notice_open|{active['notice_id']}")])
    for item in notice_service.list_recent_notices(limit=4):
        rows.append([
            InlineKeyboardButton(
                f"📢 {str(item.get('status') or 'draft').title()} · v{int(item.get('version') or 0)}",
                callback_data=f"admin_notice_open|{item['notice_id']}",
            )
        ])
    if admin_web_url:
        rows.append([InlineKeyboardButton("🌐 Open web admin", url=admin_web_url)])
    rows.append([InlineKeyboardButton("◀️ Back", callback_data="admin_panel")])
    return InlineKeyboardMarkup(rows)


def _admin_notice_target_keyboard(notice_id: str) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    current_row: list[InlineKeyboardButton] = []
    for key, label in notice_service.TARGET_CHOICES.items():
        current_row.append(InlineKeyboardButton(label[:28], callback_data=f"admin_notice_target|{notice_id}|{key}"))
        if len(current_row) == 2:
            rows.append(current_row)
            current_row = []
    if current_row:
        rows.append(current_row)
    rows.append([InlineKeyboardButton("◀️ Back", callback_data=f"admin_notice_open|{notice_id}")])
    return InlineKeyboardMarkup(rows)


def _admin_notice_severity_keyboard(notice_id: str) -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(label, callback_data=f"admin_notice_severity|{notice_id}|{key}")] for key, label in notice_service.SEVERITY_CHOICES.items()]
    rows.append([InlineKeyboardButton("◀️ Back", callback_data=f"admin_notice_open|{notice_id}")])
    return InlineKeyboardMarkup(rows)


def _admin_notice_cta_keyboard(notice_id: str) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    current_row: list[InlineKeyboardButton] = []
    for key, meta in notice_service.CTA_CHOICES.items():
        label = meta[0]
        current_row.append(InlineKeyboardButton(label[:28], callback_data=f"admin_notice_cta|{notice_id}|{key}"))
        if len(current_row) == 2:
            rows.append(current_row)
            current_row = []
    if current_row:
        rows.append(current_row)
    rows.append([InlineKeyboardButton("◀️ Back", callback_data=f"admin_notice_open|{notice_id}")])
    return InlineKeyboardMarkup(rows)


def _admin_notice_expiry_keyboard(notice_id: str) -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(label, callback_data=f"admin_notice_expiry|{notice_id}|{key}")] for key, (label, _days) in notice_service.EXPIRY_CHOICES.items()]
    rows.append([InlineKeyboardButton("◀️ Back", callback_data=f"admin_notice_open|{notice_id}")])
    return InlineKeyboardMarkup(rows)


@require_admin_callback
async def _admin_callback_broadcasts(query, context, *, user_id: int, callback_data: str):
    await query.edit_message_text(
        _render_tg_admin_broadcasts_text(),
        reply_markup=_admin_broadcasts_hub_keyboard(_admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_bc_new(query, context, *, user_id: int, callback_data: str):
    draft = broadcast_service.create_broadcast_draft(operator_id=str(user_id))
    await query.edit_message_text(
        _render_tg_admin_broadcast_detail_text(draft),
        reply_markup=get_admin_broadcast_detail_keyboard(str(draft['broadcast_id']), str(draft.get('status') or 'draft'), _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_bc_open(query, context, *, user_id: int, callback_data: str):
    _prefix, broadcast_id = callback_data.split('|', 1)
    row = broadcast_service.get_broadcast(broadcast_id)
    await query.edit_message_text(
        _render_tg_admin_broadcast_detail_text(row),
        reply_markup=get_admin_broadcast_detail_keyboard(broadcast_id, str((row or {}).get('status') or 'draft'), _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_bc_text(query, context, *, user_id: int, callback_data: str):
    _prefix, broadcast_id = callback_data.split('|', 1)
    user_states[user_id] = f"admin_bc_text:{broadcast_id}"
    await query.edit_message_text(
        "📣 <b>Broadcast text</b>\n\nОтправьте следующий текст в чат с ботом. Он станет content текущего broadcast draft.",
        reply_markup=get_admin_broadcast_detail_keyboard(broadcast_id, 'draft', _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_bc_audience_menu(query, context, *, user_id: int, callback_data: str):
    _prefix, broadcast_id = callback_data.split('|', 1)
    await query.edit_message_text(
        "📣 <b>Choose audience</b>\n\nВыберите узкий cohort для v1 broadcast.",
        reply_markup=_admin_broadcast_audience_keyboard(broadcast_id),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_bc_audience_set(query, context, *, user_id: int, callback_data: str):
    _prefix, broadcast_id, audience = callback_data.split('|', 2)
    result = broadcast_service.set_broadcast_audience(broadcast_id, audience=audience, operator_id=str(user_id))
    row = result.get('broadcast') if result.get('ok') else broadcast_service.get_broadcast(broadcast_id)
    await query.edit_message_text(
        _render_tg_admin_broadcast_detail_text(row) + ("\n\nAudience updated." if result.get('ok') else "\n\nAudience update failed."),
        reply_markup=get_admin_broadcast_detail_keyboard(broadcast_id, str((row or {}).get('status') or 'draft'), _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_bc_preview(query, context, *, user_id: int, callback_data: str):
    _prefix, broadcast_id = callback_data.split('|', 1)
    row = broadcast_service.get_broadcast(broadcast_id)
    await query.edit_message_text(
        _render_tg_admin_broadcast_detail_text(row),
        reply_markup=get_admin_broadcast_detail_keyboard(broadcast_id, str((row or {}).get('status') or 'draft'), _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_bc_launch(query, context, *, user_id: int, callback_data: str):
    _prefix, broadcast_id = callback_data.split('|', 1)
    row = broadcast_service.get_broadcast(broadcast_id)
    await query.edit_message_text(
        _render_tg_admin_broadcast_detail_text(row) + "\n\n<b>Confirm launch</b>\nThis will start backend delivery for this cohort.",
        reply_markup=get_yes_no_keyboard(f"admin_bc_launch_confirm|{broadcast_id}", f"admin_bc_open|{broadcast_id}"),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_bc_launch_confirm(query, context, *, user_id: int, callback_data: str):
    _prefix, broadcast_id = callback_data.split('|', 1)
    result = broadcast_service.launch_broadcast(broadcast_id, operator_id=str(user_id))
    row = broadcast_service.get_broadcast(broadcast_id)
    suffix = "\n\n✅ Broadcast launched." if result.get('ok') else f"\n\n❌ {escape(str(result.get('error') or 'broadcast_launch_failed'))}"
    await query.edit_message_text(
        _render_tg_admin_broadcast_detail_text(row) + suffix,
        reply_markup=get_admin_broadcast_detail_keyboard(broadcast_id, str((row or {}).get('status') or 'draft'), _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_bc_stop(query, context, *, user_id: int, callback_data: str):
    _prefix, broadcast_id = callback_data.split('|', 1)
    row = broadcast_service.get_broadcast(broadcast_id)
    await query.edit_message_text(
        _render_tg_admin_broadcast_detail_text(row) + "\n\n<b>Confirm stop</b>\nThis stops further delivery for the active broadcast.",
        reply_markup=get_yes_no_keyboard(f"admin_bc_stop_confirm|{broadcast_id}", f"admin_bc_open|{broadcast_id}"),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_bc_stop_confirm(query, context, *, user_id: int, callback_data: str):
    _prefix, broadcast_id = callback_data.split('|', 1)
    result = broadcast_service.stop_broadcast(broadcast_id, operator_id=str(user_id))
    row = broadcast_service.get_broadcast(broadcast_id)
    suffix = "\n\n✅ Broadcast stopped." if result.get('ok') else f"\n\n❌ {escape(str(result.get('error') or 'broadcast_stop_failed'))}"
    await query.edit_message_text(
        _render_tg_admin_broadcast_detail_text(row) + suffix,
        reply_markup=get_admin_broadcast_detail_keyboard(broadcast_id, str((row or {}).get('status') or 'stopped'), _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_bc_retry(query, context, *, user_id: int, callback_data: str):
    _prefix, broadcast_id = callback_data.split('|', 1)
    row = broadcast_service.get_broadcast(broadcast_id)
    await query.edit_message_text(
        _render_tg_admin_broadcast_detail_text(row) + "\n\n<b>Confirm retry</b>\nThis will resume failed/retry-pending deliveries right now.",
        reply_markup=get_yes_no_keyboard(f"admin_bc_retry_confirm|{broadcast_id}", f"admin_bc_open|{broadcast_id}"),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_bc_retry_confirm(query, context, *, user_id: int, callback_data: str):
    _prefix, broadcast_id = callback_data.split('|', 1)
    result = broadcast_service.retry_failed_deliveries_now(broadcast_id, operator_id=str(user_id))
    row = broadcast_service.get_broadcast(broadcast_id)
    if result.get('ok'):
        retryable_count = int(result.get('retryable_count') or 0)
        suffix = f"\n\n✅ Retry window reopened for <b>{retryable_count}</b> failed/pending deliveries."
    else:
        suffix = f"\n\n❌ {escape(str(result.get('error') or 'broadcast_retry_failed'))}"
    await query.edit_message_text(
        _render_tg_admin_broadcast_detail_text(row) + suffix,
        reply_markup=get_admin_broadcast_detail_keyboard(broadcast_id, str((row or {}).get('status') or 'running'), _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_bc_cancel(query, context, *, user_id: int, callback_data: str):
    _prefix, broadcast_id = callback_data.split('|', 1)
    row = broadcast_service.get_broadcast(broadcast_id)
    await query.edit_message_text(
        _render_tg_admin_broadcast_detail_text(row) + "\n\n<b>Confirm cancel</b>\nDraft will be closed and kept for audit/history.",
        reply_markup=get_yes_no_keyboard(f"admin_bc_cancel_confirm|{broadcast_id}", f"admin_bc_open|{broadcast_id}"),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_bc_cancel_confirm(query, context, *, user_id: int, callback_data: str):
    _prefix, broadcast_id = callback_data.split('|', 1)
    result = broadcast_service.stop_broadcast(broadcast_id, operator_id=str(user_id))
    row = broadcast_service.get_broadcast(broadcast_id)
    suffix = "\n\n✅ Draft cancelled." if result.get('ok') else f"\n\n❌ {escape(str(result.get('error') or 'broadcast_cancel_failed'))}"
    await query.edit_message_text(
        _render_tg_admin_broadcast_detail_text(row) + suffix,
        reply_markup=get_admin_broadcast_detail_keyboard(broadcast_id, str((row or {}).get('status') or 'stopped'), _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_notice(query, context, *, user_id: int, callback_data: str):
    await query.edit_message_text(
        _render_tg_admin_notice_text(),
        reply_markup=_admin_notice_hub_keyboard(_admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_notice_new(query, context, *, user_id: int, callback_data: str):
    draft = notice_service.create_notice_draft(operator_id=str(user_id))
    await query.edit_message_text(
        _render_tg_admin_notice_detail_text(draft),
        reply_markup=get_admin_notice_detail_keyboard(str(draft['notice_id']), str(draft.get('status') or 'draft'), _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_notice_open(query, context, *, user_id: int, callback_data: str):
    _prefix, notice_id = callback_data.split('|', 1)
    row = notice_service.get_notice(notice_id)
    await query.edit_message_text(
        _render_tg_admin_notice_detail_text(row),
        reply_markup=get_admin_notice_detail_keyboard(notice_id, str((row or {}).get('status') or 'draft'), _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_notice_text(query, context, *, user_id: int, callback_data: str):
    _prefix, notice_id = callback_data.split('|', 1)
    user_states[user_id] = f"admin_notice_text:{notice_id}"
    await query.edit_message_text(
        "📢 <b>Notice text</b>\n\nОтправьте следующий текст в чат с ботом. Он станет body текущего notice draft.",
        reply_markup=get_admin_notice_detail_keyboard(notice_id, 'draft', _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_notice_severity_menu(query, context, *, user_id: int, callback_data: str):
    _prefix, notice_id = callback_data.split('|', 1)
    await query.edit_message_text(
        "📢 <b>Choose severity</b>",
        reply_markup=_admin_notice_severity_keyboard(notice_id),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_notice_severity_set(query, context, *, user_id: int, callback_data: str):
    _prefix, notice_id, severity = callback_data.split('|', 2)
    result = notice_service.set_notice_meta(notice_id, operator_id=str(user_id), severity=severity)
    row = result.get('notice') if result.get('ok') else notice_service.get_notice(notice_id)
    await query.edit_message_text(
        _render_tg_admin_notice_detail_text(row) + ("\n\nSeverity updated." if result.get('ok') else "\n\nSeverity update failed."),
        reply_markup=get_admin_notice_detail_keyboard(notice_id, str((row or {}).get('status') or 'draft'), _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_notice_target_menu(query, context, *, user_id: int, callback_data: str):
    _prefix, notice_id = callback_data.split('|', 1)
    await query.edit_message_text(
        "📢 <b>Choose target</b>",
        reply_markup=_admin_notice_target_keyboard(notice_id),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_notice_target_set(query, context, *, user_id: int, callback_data: str):
    _prefix, notice_id, target = callback_data.split('|', 2)
    result = notice_service.set_notice_meta(notice_id, operator_id=str(user_id), target=target)
    row = result.get('notice') if result.get('ok') else notice_service.get_notice(notice_id)
    await query.edit_message_text(
        _render_tg_admin_notice_detail_text(row) + ("\n\nTarget updated." if result.get('ok') else "\n\nTarget update failed."),
        reply_markup=get_admin_notice_detail_keyboard(notice_id, str((row or {}).get('status') or 'draft'), _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_notice_cta_menu(query, context, *, user_id: int, callback_data: str):
    _prefix, notice_id = callback_data.split('|', 1)
    await query.edit_message_text(
        "📢 <b>Choose CTA</b>",
        reply_markup=_admin_notice_cta_keyboard(notice_id),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_notice_cta_set(query, context, *, user_id: int, callback_data: str):
    _prefix, notice_id, cta_key = callback_data.split('|', 2)
    result = notice_service.set_notice_meta(notice_id, operator_id=str(user_id), cta_key=cta_key)
    row = result.get('notice') if result.get('ok') else notice_service.get_notice(notice_id)
    await query.edit_message_text(
        _render_tg_admin_notice_detail_text(row) + ("\n\nCTA updated." if result.get('ok') else "\n\nCTA update failed."),
        reply_markup=get_admin_notice_detail_keyboard(notice_id, str((row or {}).get('status') or 'draft'), _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_notice_expiry_menu(query, context, *, user_id: int, callback_data: str):
    _prefix, notice_id = callback_data.split('|', 1)
    await query.edit_message_text(
        "📢 <b>Choose expiry</b>",
        reply_markup=_admin_notice_expiry_keyboard(notice_id),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_notice_expiry_set(query, context, *, user_id: int, callback_data: str):
    _prefix, notice_id, expiry_key = callback_data.split('|', 2)
    result = notice_service.set_notice_meta(notice_id, operator_id=str(user_id), expiry_key=expiry_key)
    row = result.get('notice') if result.get('ok') else notice_service.get_notice(notice_id)
    await query.edit_message_text(
        _render_tg_admin_notice_detail_text(row) + ("\n\nExpiry updated." if result.get('ok') else "\n\nExpiry update failed."),
        reply_markup=get_admin_notice_detail_keyboard(notice_id, str((row or {}).get('status') or 'draft'), _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_notice_preview(query, context, *, user_id: int, callback_data: str):
    _prefix, notice_id = callback_data.split('|', 1)
    row = notice_service.get_notice(notice_id)
    await query.edit_message_text(
        _render_tg_admin_notice_detail_text(row),
        reply_markup=get_admin_notice_detail_keyboard(notice_id, str((row or {}).get('status') or 'draft'), _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_notice_publish(query, context, *, user_id: int, callback_data: str):
    _prefix, notice_id = callback_data.split('|', 1)
    row = notice_service.get_notice(notice_id)
    await query.edit_message_text(
        _render_tg_admin_notice_detail_text(row) + "\n\n<b>Confirm publish</b>\nPublishing a new version resets seen-state via the new notice id/version.",
        reply_markup=get_yes_no_keyboard(f"admin_notice_publish_confirm|{notice_id}", f"admin_notice_open|{notice_id}"),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_notice_publish_confirm(query, context, *, user_id: int, callback_data: str):
    _prefix, notice_id = callback_data.split('|', 1)
    result = notice_service.publish_notice(notice_id, operator_id=str(user_id))
    row = notice_service.get_notice(notice_id)
    suffix = "\n\n✅ Notice published." if result.get('ok') else f"\n\n❌ {escape(str(result.get('error') or 'notice_publish_failed'))}"
    await query.edit_message_text(
        _render_tg_admin_notice_detail_text(row) + suffix,
        reply_markup=get_admin_notice_detail_keyboard(notice_id, str((row or {}).get('status') or 'active'), _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_notice_deactivate(query, context, *, user_id: int, callback_data: str):
    _prefix, notice_id = callback_data.split('|', 1)
    row = notice_service.get_notice(notice_id)
    await query.edit_message_text(
        _render_tg_admin_notice_detail_text(row) + "\n\n<b>Confirm deactivate</b>\nCurrent notice will stop showing to users.",
        reply_markup=get_yes_no_keyboard(f"admin_notice_deactivate_confirm|{notice_id}", f"admin_notice_open|{notice_id}"),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_notice_deactivate_confirm(query, context, *, user_id: int, callback_data: str):
    _prefix, notice_id = callback_data.split('|', 1)
    result = notice_service.deactivate_notice(notice_id, operator_id=str(user_id))
    row = notice_service.get_notice(notice_id)
    suffix = "\n\n✅ Notice deactivated." if result.get('ok') else f"\n\n❌ {escape(str(result.get('error') or 'notice_deactivate_failed'))}"
    await query.edit_message_text(
        _render_tg_admin_notice_detail_text(row) + suffix,
        reply_markup=get_admin_notice_detail_keyboard(notice_id, str((row or {}).get('status') or 'inactive'), _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


async def _callback_notice_open(query, context, *, user_id: int):
    row = notice_service.get_current_notice_for_user(user_id)
    if row:
        notice_service.mark_notice_seen(user_id, str(row.get('notice_id')))
    cta_label, cta_callback = _notice_cta_payload(row)
    await query.edit_message_text(
        _render_user_notice_text(row),
        reply_markup=get_notice_view_keyboard(cta_label=cta_label, cta_callback=cta_callback),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_users(query, context, *, user_id: int, callback_data: str):
    await query.edit_message_text(
        "👥 <b>User lookup shortcut</b>\n\nВведите числовой ID пользователя, чтобы быстро открыть receipt и затем перейти в web admin User Card.",
        reply_markup=get_admin_shortcuts_keyboard("admin_users", _admin_web_url('/users')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )
    user_states[user_id] = "admin_waiting_user_id"


@require_admin_callback
async def _admin_callback_panel(query, context, *, user_id: int, callback_data: str):
    await query.edit_message_text(
        _render_tg_admin_overview_text(user_id),
        reply_markup=get_admin_panel_keyboard(_admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_overview(query, context, *, user_id: int, callback_data: str):
    await query.edit_message_text(
        _render_tg_admin_overview_text(user_id),
        reply_markup=get_admin_shortcuts_keyboard("admin_overview", _admin_web_url('/')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_withdrawals_shortcuts(query, context, *, user_id: int, callback_data: str):
    await query.edit_message_text(
        _render_tg_admin_withdrawals_text(),
        reply_markup=get_admin_shortcuts_keyboard("admin_withdrawals", _admin_web_url('/withdrawals')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_runtime_shortcuts(query, context, *, user_id: int, callback_data: str):
    await query.edit_message_text(
        _render_tg_admin_runtime_text(),
        reply_markup=get_admin_shortcuts_keyboard("admin_runtime", _admin_web_url('/runtime')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_help_shortcuts(query, context, *, user_id: int, callback_data: str):
    await query.edit_message_text(
        _render_tg_admin_help_text(),
        reply_markup=get_admin_shortcuts_keyboard("admin_help", _admin_web_url('/help')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_liabilities(query, context, *, user_id: int, callback_data: str):
    await query.edit_message_text(
        _render_tg_admin_liabilities_text(),
        reply_markup=get_admin_shortcuts_keyboard("admin_liabilities", _admin_web_url('/liabilities')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


@require_admin_callback
async def _admin_callback_balance(query, context, *, user_id: int, callback_data: str):
    await _admin_callback_liabilities(query, context, user_id=user_id, callback_data=callback_data)


@require_admin_callback
async def _admin_callback_block_user(query, context, *, user_id: int, callback_data: str):
    target_id = int(callback_data.replace("admin_block_", ""))
    risk_service.freeze_user(target_id, operator_id=str(user_id), reason='legacy_admin_block')
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET is_blocked = 1 WHERE user_id = ?", (target_id,))
        conn.commit()
    finally:
        conn.close()
    try:
        await context.bot.send_message(
            chat_id=target_id,
            text="Ваш аккаунт заблокирован администрацией. Если это ошибка, свяжитесь с поддержкой."
        )
    except Exception:
        pass
    row = _fetch_admin_user_row(target_id)
    await query.edit_message_text(
        _format_admin_user_card(row),
        reply_markup=get_admin_user_keyboard(row['user_id'], bool(row['is_blocked'])),
        parse_mode=ParseMode.HTML
    )


@require_admin_callback
async def _admin_callback_unblock_user(query, context, *, user_id: int, callback_data: str):
    target_id = int(callback_data.replace("admin_unblock_", ""))
    risk_service.unfreeze_user(target_id, operator_id=str(user_id), reason='legacy_admin_unblock')
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET is_blocked = 0 WHERE user_id = ?", (target_id,))
        conn.commit()
    finally:
        conn.close()
    try:
        await context.bot.send_message(
            chat_id=target_id,
            text="Ваш аккаунт разблокирован. Теперь вы снова можете пользоваться ботом."
        )
    except Exception:
        pass
    row = _fetch_admin_user_row(target_id)
    await query.edit_message_text(
        _format_admin_user_card(row),
        reply_markup=get_admin_user_keyboard(row['user_id'], bool(row['is_blocked'])),
        parse_mode=ParseMode.HTML
    )


@require_admin_callback
async def _admin_callback_change_balance(query, context, *, user_id: int, callback_data: str):
    target_id = int(callback_data.replace("admin_change_balance_", ""))
    await query.edit_message_text(
        f"Введите сумму для изменения баланса пользователя #{target_id} (можно отрицательную):",
        reply_markup=get_admin_user_keyboard(target_id, False)
    )
    user_states[user_id] = f"admin_waiting_balance_{target_id}"


@require_admin_callback
async def _admin_callback_stats(query, context, *, user_id: int, callback_data: str):
    target_id = int(callback_data.replace("admin_stats_", ""))
    row = _fetch_admin_user_row(target_id, include_profit=True)
    if not row:
        await query.edit_message_text("Пользователь не найден.", reply_markup=get_admin_panel_keyboard(_admin_web_url()))
        return
    winrate = (row['games_won'] / row['games_played'] * 100) if row['games_played'] > 0 else 0
    stats = f"<b>Статистика пользователя #{row['user_id']}</b>\n"
    stats += f"Имя: {row['first_name'] or '-'}\n"
    stats += f"Username: @{row['username'] or '-'}\n"
    stats += f"Баланс: {row['balance']:.2f} TON\n"
    stats += f"Игр сыграно: {row['games_played']}\n"
    stats += f"Побед: {row['games_won']}\n"
    stats += f"Winrate: {winrate:.1f}%\n"
    stats += f"Profit: {row['profit']:.2f} TON\n"
    stats += f"Дата регистрации: {row['created_at']} (UTC)"
    await query.edit_message_text(
        stats,
        reply_markup=get_admin_user_keyboard(row['user_id'], False),
        parse_mode=ParseMode.HTML
    )


@require_admin_callback
async def _admin_callback_broadcast(query, context, *, user_id: int, callback_data: str):
    await _admin_callback_broadcasts(query, context, user_id=user_id, callback_data="admin_broadcasts")


@require_admin_callback
async def _admin_callback_settings(query, context, *, user_id: int, callback_data: str):
    allow_create_game, allow_withdraw = _load_admin_settings_flags()
    await query.edit_message_text(
        "<b>Настройки</b>",
        reply_markup=get_admin_settings_keyboard(allow_create_game, allow_withdraw),
        parse_mode=ParseMode.HTML
    )


@require_admin_callback
async def _admin_callback_toggle_create_game(query, context, *, user_id: int, callback_data: str):
    current = platform_settings.get_bool('duels_enabled')
    platform_settings.set_setting('duels_enabled', not current, operator_id=str(user_id), note='legacy_toggle_create_game')
    allow_create_game, allow_withdraw = _load_admin_settings_flags()
    await query.edit_message_text(
        "<b>Настройки</b>",
        reply_markup=get_admin_settings_keyboard(allow_create_game, allow_withdraw),
        parse_mode=ParseMode.HTML
    )


@require_admin_callback
async def _admin_callback_toggle_withdraw(query, context, *, user_id: int, callback_data: str):
    current = platform_settings.get_bool('withdrawals_enabled')
    platform_settings.set_setting('withdrawals_enabled', not current, operator_id=str(user_id), note='legacy_toggle_withdraw')
    allow_create_game, allow_withdraw = _load_admin_settings_flags()
    await query.edit_message_text(
        "<b>Настройки</b>",
        reply_markup=get_admin_settings_keyboard(allow_create_game, allow_withdraw),
        parse_mode=ParseMode.HTML
    )


@require_admin_callback
async def _admin_callback_cancel_waiting_games(query, context, *, user_id: int, callback_data: str):
    await query.edit_message_text(
        "Вы уверены, что хотите отменить все ожидающие игры? Это действие нельзя отменить.",
        reply_markup=get_yes_no_keyboard(
            yes_callback="confirm_cancel_all_waiting_games",
            no_callback="admin_settings"
        )
    )


@require_admin_callback
async def _admin_callback_confirm_cancel_waiting_games(query, context, *, user_id: int, callback_data: str):
    from database import cancel_all_waiting_games

    count, user_ids = cancel_all_waiting_games()
    allow_create_game, allow_withdraw = _load_admin_settings_flags()
    await query.edit_message_text(
        f"✅ Все ожидающие игры отменены. Возвращено ставок: {count}.",
        reply_markup=get_admin_settings_keyboard(allow_create_game, allow_withdraw)
    )
    await notify_cancelled_waiting_games(context, user_ids)


@require_admin_callback
async def _admin_callback_logout(query, context, *, user_id: int, callback_data: str):
    user_states.pop(user_id, None)
    await handle_main_menu(query, context)


@require_admin_callback
async def _admin_callback_export(query, context, *, user_id: int, callback_data: str):
    from export_to_excel import export_all_to_excel
    import os

    filename = 'export.xlsx'
    export_all_to_excel(filename)
    with open(filename, 'rb') as f:
        await context.bot.send_document(chat_id=user_id, document=f, filename=filename)
    await query.edit_message_text(
        "Экспорт завершён, файл отправлен.",
        reply_markup=get_admin_panel_keyboard()
    )
    try:
        os.remove(filename)
    except Exception:
        pass


ADMIN_CALLBACK_EXACT_HANDLERS = {
    "admin_users": _admin_callback_users,
    "admin_panel": _admin_callback_panel,
    "admin_overview": _admin_callback_overview,
    "admin_withdrawals": _admin_callback_withdrawals_shortcuts,
    "admin_runtime": _admin_callback_runtime_shortcuts,
    "admin_liabilities": _admin_callback_liabilities,
    "admin_help": _admin_callback_help_shortcuts,
    "admin_balance": _admin_callback_balance,
    "admin_broadcast": _admin_callback_broadcast,
    "admin_broadcasts": _admin_callback_broadcasts,
    "admin_bc_new": _admin_callback_bc_new,
    "admin_notice": _admin_callback_notice,
    "admin_notice_new": _admin_callback_notice_new,
    "admin_settings": _admin_callback_settings,
    "toggle_create_game": _admin_callback_toggle_create_game,
    "toggle_withdraw": _admin_callback_toggle_withdraw,
    "cancel_all_waiting_games": _admin_callback_cancel_waiting_games,
    "confirm_cancel_all_waiting_games": _admin_callback_confirm_cancel_waiting_games,
    "admin_logout": _admin_callback_logout,
    "admin_export": _admin_callback_export,
}

ADMIN_CALLBACK_PREFIX_HANDLERS = (
    ("admin_bc_open|", _admin_callback_bc_open),
    ("admin_bc_text|", _admin_callback_bc_text),
    ("admin_bc_audience_menu|", _admin_callback_bc_audience_menu),
    ("admin_bc_aud|", _admin_callback_bc_audience_set),
    ("admin_bc_preview|", _admin_callback_bc_preview),
    ("admin_bc_launch|", _admin_callback_bc_launch),
    ("admin_bc_launch_confirm|", _admin_callback_bc_launch_confirm),
    ("admin_bc_stop|", _admin_callback_bc_stop),
    ("admin_bc_stop_confirm|", _admin_callback_bc_stop_confirm),
    ("admin_bc_retry|", _admin_callback_bc_retry),
    ("admin_bc_retry_confirm|", _admin_callback_bc_retry_confirm),
    ("admin_bc_cancel|", _admin_callback_bc_cancel),
    ("admin_bc_cancel_confirm|", _admin_callback_bc_cancel_confirm),
    ("admin_notice_open|", _admin_callback_notice_open),
    ("admin_notice_text|", _admin_callback_notice_text),
    ("admin_notice_severity_menu|", _admin_callback_notice_severity_menu),
    ("admin_notice_severity|", _admin_callback_notice_severity_set),
    ("admin_notice_target_menu|", _admin_callback_notice_target_menu),
    ("admin_notice_target|", _admin_callback_notice_target_set),
    ("admin_notice_cta_menu|", _admin_callback_notice_cta_menu),
    ("admin_notice_cta|", _admin_callback_notice_cta_set),
    ("admin_notice_expiry_menu|", _admin_callback_notice_expiry_menu),
    ("admin_notice_expiry|", _admin_callback_notice_expiry_set),
    ("admin_notice_preview|", _admin_callback_notice_preview),
    ("admin_notice_publish|", _admin_callback_notice_publish),
    ("admin_notice_publish_confirm|", _admin_callback_notice_publish_confirm),
    ("admin_notice_deactivate|", _admin_callback_notice_deactivate),
    ("admin_notice_deactivate_confirm|", _admin_callback_notice_deactivate_confirm),
    ("admin_block_", _admin_callback_block_user),
    ("admin_unblock_", _admin_callback_unblock_user),
    ("admin_change_balance_", _admin_callback_change_balance),
    ("admin_stats_", _admin_callback_stats),
)


async def _dispatch_admin_callback(query, context, *, user_id: int, callback_data: str) -> bool:
    handler = ADMIN_CALLBACK_EXACT_HANDLERS.get(callback_data)
    if handler is not None:
        await handler(query, context, user_id=user_id, callback_data=callback_data)
        return True
    for prefix, prefix_handler in ADMIN_CALLBACK_PREFIX_HANDLERS:
        if callback_data.startswith(prefix):
            await prefix_handler(query, context, user_id=user_id, callback_data=callback_data)
            return True
    return False




async def handle_callback_query(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик callback запросов от inline кнопок"""
    query = update.callback_query
    # await safe_answer_callback(query)  # Удалено, чтобы всплывающие уведомления работали корректно
    
    user_id = query.from_user.id
    callback_data = query.data
    
    # Создаем или обновляем пользователя
    create_or_update_user(user_id, query.from_user.username, query.from_user.first_name)
    
    # Проверка блокировки пользователя
    from database import get_connection
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT is_blocked FROM users WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    if row and row["is_blocked"]:
        return  # Молчим для заблокированных
    
    try:
        if await _dispatch_admin_callback(query, context, user_id=user_id, callback_data=callback_data):
            return
        if callback_data == "notice_open":
            await safe_answer_callback(query)
            await _callback_notice_open(query, context, user_id=user_id)
            return
        if callback_data == "create_game":
            await handle_create_game(query, context)
        elif callback_data == "find_game":
            await handle_find_game(query, context)
        elif callback_data == "practice_mode":
            await safe_answer_callback(query)
            await handle_practice_mode_callback(query, context)
            return
        elif callback_data == "practice_create":
            await safe_answer_callback(query)
            await handle_create_practice_game(query, context)
            return
        elif callback_data == "practice_find":
            await safe_answer_callback(query)
            await handle_find_practice_game(query, context)
            return
        elif callback_data == "practice_balance":
            await safe_answer_callback(query)
            await handle_practice_balance_callback(query, context)
            return
        elif callback_data == "practice_about":
            await safe_answer_callback(query)
            await handle_practice_about_callback(query, context)
            return
        elif callback_data.startswith("pbet_"):
            await safe_answer_callback(query)
            await handle_practice_bet_selection(query, context)
            return
        elif callback_data.startswith("pjoin_game_"):
            await safe_answer_callback(query)
            await handle_join_practice_game_request(query, context)
            return
        elif callback_data.startswith("pconfirm_join_"):
            await safe_answer_callback(query)
            await handle_confirm_join_practice(query, context)
            return
        elif callback_data.startswith("pcancel_game_"):
            await safe_answer_callback(query)
            await handle_cancel_practice_game(query, context)
            return
        elif callback_data == "balance":
            await handle_balance_callback(query, context)
            return
        elif callback_data == "deposit":
            allowed, error_text = _check_product_access(user_id, 'deposit')
            if not allowed:
                await safe_answer_callback(query, error_text, show_alert=True)
                return
            await safe_answer_callback(query)
            await query.edit_message_text(
                "💸 Enter the deposit amount (minimum 0.1 TON).\nCryptoBot invoice fee: 3%.",
                reply_markup=get_back_button()
            )
            user_states[user_id] = 'waiting_deposit_amount'
            return
        elif callback_data == "withdraw":
            allowed, error_text = _check_product_access(user_id, 'withdraw')
            if not allowed:
                await safe_answer_callback(query, error_text, show_alert=True)
                return
            # Проверка на активную или ожидающую игру
            active_game = get_active_game(user_id)
            if active_game:
                await safe_answer_callback(query, 
                    "❌ You cannot withdraw while an active duel is open. Finish it first.",
                    show_alert=True
                )
                return
            await safe_answer_callback(query)
            await query.edit_message_text(
                "💸 Enter the withdrawal amount. Minimum — 0.5 TON.\nWithdrawals are sent back to your CryptoBot balance.",
                reply_markup=get_back_button()
            )
            user_states[user_id] = 'waiting_withdraw_amount'
            return
        elif callback_data == "stats":
            await handle_stats_callback(query, context)
        elif callback_data == "help":
            await query.edit_message_text(
                render_help_text(),
                parse_mode=ParseMode.HTML,
                reply_markup=get_help_keyboard(),
            )
            return
        elif callback_data == "support" or callback_data == "donate_menu":
            await query.edit_message_text(
                render_support_text(),
                parse_mode=ParseMode.HTML,
                reply_markup=get_support_keyboard(bool(SUPPORT_TON_ADDRESS)),
            )
            return
        elif callback_data == "back_to_main" or callback_data == "refresh_main":
            await safe_answer_callback(query)
            await handle_main_menu(query, context)
        elif callback_data.startswith("bet_"):
            await handle_bet_selection(query, context)
        elif callback_data.startswith("join_game_"):
            active_kind, _ = _get_active_duel_context(user_id)
            if active_kind:
                await safe_answer_callback(query, 
                    text=_describe_active_duel_conflict(active_kind),
                    show_alert=True
                )
                return
            await handle_join_game_request(query, context)
        elif callback_data.startswith("confirm_join_"):
            await handle_confirm_join(query, context)
        elif callback_data.startswith("cancel_game_"):
            await handle_cancel_game(query, context)
        elif callback_data.startswith("check_game_"):
            await handle_check_game(query, context)
        elif callback_data == "leave_game":
            await handle_leave_game(query, context)
        elif callback_data == "game_status":
            await handle_game_status(query, context)
        elif callback_data == "profile":
            await handle_profile_callback(query, context)
        elif callback_data in {"leaderboard", "leaderboard_global", "leaderboard_weekly", "leaderboard_workspace"}:
            await safe_answer_callback(query)
            scope = callback_data.replace("leaderboard_", "", 1) if callback_data.startswith("leaderboard_") else "global"
            await handle_leaderboard_callback(query, context, scope=scope)
            return
        elif callback_data == "my_history":
            await safe_answer_callback(query)
            await handle_history_callback(query, context)
            return
        elif callback_data == "my_chats":
            await safe_answer_callback(query)
            await show_workspace_list(query, user_id=user_id, edit=True)
            return
        elif callback_data == "workspace_connect":
            payload = create_connect_request(user_id)
            await safe_answer_callback(query)
            await query.edit_message_text(
                render_workspace_connect_text(payload),
                parse_mode=ParseMode.HTML,
                reply_markup=get_workspace_connect_keyboard(),
            )
            return
        elif callback_data.startswith("workspace_open_"):
            await safe_answer_callback(query)
            await show_workspace_detail(query, user_id=user_id, workspace_id=callback_data.replace("workspace_open_", "", 1), edit=True, bot=context.bot)
            return
        elif callback_data.startswith("giveaway_open_"):
            workspace_id = callback_data.replace("giveaway_open_", "", 1)
            await safe_answer_callback(query)
            await show_giveaway_detail(query, user_id=user_id, workspace_id=workspace_id, edit=True)
            return
        elif callback_data.startswith("giveaway_create_"):
            workspace_id = callback_data.replace("giveaway_create_", "", 1)
            try:
                existing = get_workspace_giveaway_for_owner(owner_user_id=user_id, workspace_id=workspace_id)
                existing_status = str((existing or {}).get("status") or "").upper()
                if existing and existing_status == "ACTIVE":
                    raise GiveawayError("active_giveaway_exists", "Only one active giveaway is allowed per group.", 409)
                if existing and existing_status == "DRAFT":
                    created = existing
                else:
                    created = create_giveaway_draft(
                        owner_user_id=user_id,
                        workspace_id=workspace_id,
                        title="New giveaway",
                        prize_text="Set the prize",
                        winners_count=1,
                        starts_at=None,
                        ends_at=None,
                    )
            except GiveawayError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, "Draft created")
            await show_giveaway_detail(query, user_id=user_id, giveaway_id=str(created["giveaway_id"]), edit=True)
            return
        elif callback_data.startswith("gw_back_"):
            giveaway_id = callback_data.replace("gw_back_", "", 1)
            user_states.pop(user_id, None)
            await safe_answer_callback(query)
            await show_giveaway_detail(query, user_id=user_id, giveaway_id=giveaway_id, edit=True)
            return
        elif callback_data.startswith("gw_edit_title_") or callback_data.startswith("gw_edit_prize_") or callback_data.startswith("gw_edit_winners_") or callback_data.startswith("gw_edit_deadline_"):
            if callback_data.startswith("gw_edit_title_"):
                field_name = "title"
                giveaway_id = callback_data.replace("gw_edit_title_", "", 1)
            elif callback_data.startswith("gw_edit_prize_"):
                field_name = "prize"
                giveaway_id = callback_data.replace("gw_edit_prize_", "", 1)
            elif callback_data.startswith("gw_edit_winners_"):
                field_name = "winners"
                giveaway_id = callback_data.replace("gw_edit_winners_", "", 1)
            else:
                field_name = "deadline"
                giveaway_id = callback_data.replace("gw_edit_deadline_", "", 1)
            try:
                snapshot = get_giveaway_owner_snapshot(owner_user_id=user_id, giveaway_id=giveaway_id)
            except GiveawayError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            user_states[user_id] = f"gw_edit_{field_name}:{giveaway_id}"
            await safe_answer_callback(query)
            await query.edit_message_text(
                render_giveaway_edit_prompt(field_name, (snapshot.get("giveaway") or {}).get("title")),
                parse_mode=ParseMode.HTML,
                reply_markup=get_giveaway_edit_prompt_keyboard(giveaway_id, field_name),
            )
            return
        elif callback_data.startswith("gw_deadline_preset_"):
            remainder = callback_data.replace("gw_deadline_preset_", "", 1)
            giveaway_id, _, preset = remainder.rpartition("_")
            try:
                deadline = _parse_giveaway_deadline_input(preset)
                update_giveaway_core(owner_user_id=user_id, giveaway_id=giveaway_id, ends_at=deadline)
            except GiveawayError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, f"Deadline set to {preset}")
            await show_giveaway_detail(query, user_id=user_id, giveaway_id=giveaway_id, edit=True)
            return
        elif callback_data.startswith("gw_activate_"):
            giveaway_id = callback_data.replace("gw_activate_", "", 1)
            try:
                snapshot = get_giveaway_owner_snapshot(owner_user_id=user_id, giveaway_id=giveaway_id)
            except GiveawayError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            workspace_id = str((snapshot.get("workspace") or {}).get("workspace_id") or (snapshot.get("giveaway") or {}).get("workspace_id") or "")
            await safe_answer_callback(query)
            await query.edit_message_text(
                render_giveaway_confirm_text("activate", snapshot),
                parse_mode=ParseMode.HTML,
                reply_markup=get_giveaway_confirm_keyboard("activate", giveaway_id, workspace_id),
            )
            return
        elif callback_data.startswith("gw_confirm_activate_"):
            giveaway_id = callback_data.replace("gw_confirm_activate_", "", 1)
            try:
                activate_giveaway(owner_user_id=user_id, giveaway_id=giveaway_id)
            except GiveawayError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, "Giveaway activated")
            await show_giveaway_detail(query, user_id=user_id, giveaway_id=giveaway_id, edit=True)
            return
        elif callback_data.startswith("gw_publish_live_"):
            giveaway_id = callback_data.replace("gw_publish_live_", "", 1)
            try:
                snapshot = get_giveaway_public_snapshot(giveaway_id=giveaway_id)
                workspace = snapshot.get("workspace") or {}
                chat_id = workspace.get("telegram_chat_id")
                if not chat_id:
                    raise GiveawayError("workspace_chat_missing", "This group is missing a Telegram chat id.", 409)
                sent = await context.bot.send_message(
                    chat_id=int(chat_id),
                    text=render_public_giveaway_post_text(snapshot),
                    parse_mode=ParseMode.HTML,
                    reply_markup=get_public_giveaway_join_keyboard(giveaway_id),
                    disable_web_page_preview=True,
                )
                mark_giveaway_post_published(owner_user_id=user_id, giveaway_id=giveaway_id, published_message_id=sent.message_id)
            except GiveawayError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            except Exception as exc:
                logger.warning("Could not publish giveaway post %s: %s", giveaway_id, exc)
                await safe_answer_callback(query, "❌ Could not publish the giveaway post to the group.", show_alert=True)
                return
            await safe_answer_callback(query, "Giveaway published")
            await show_giveaway_detail(query, user_id=user_id, giveaway_id=giveaway_id, edit=True)
            return
        elif callback_data.startswith("gw_end_"):
            giveaway_id = callback_data.replace("gw_end_", "", 1)
            try:
                snapshot = get_giveaway_owner_snapshot(owner_user_id=user_id, giveaway_id=giveaway_id)
            except GiveawayError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            workspace_id = str((snapshot.get("workspace") or {}).get("workspace_id") or (snapshot.get("giveaway") or {}).get("workspace_id") or "")
            await safe_answer_callback(query)
            await query.edit_message_text(
                render_giveaway_confirm_text("end", snapshot),
                parse_mode=ParseMode.HTML,
                reply_markup=get_giveaway_confirm_keyboard("end", giveaway_id, workspace_id),
            )
            return
        elif callback_data.startswith("gw_confirm_end_"):
            giveaway_id = callback_data.replace("gw_confirm_end_", "", 1)
            try:
                end_giveaway(owner_user_id=user_id, giveaway_id=giveaway_id)
            except GiveawayError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, "Giveaway ended")
            await show_giveaway_detail(query, user_id=user_id, giveaway_id=giveaway_id, edit=True)
            return
        elif callback_data.startswith("gw_draw_"):
            giveaway_id = callback_data.replace("gw_draw_", "", 1)
            try:
                snapshot = get_giveaway_owner_snapshot(owner_user_id=user_id, giveaway_id=giveaway_id)
            except GiveawayError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            workspace_id = str((snapshot.get("workspace") or {}).get("workspace_id") or (snapshot.get("giveaway") or {}).get("workspace_id") or "")
            await safe_answer_callback(query)
            await query.edit_message_text(
                render_giveaway_confirm_text("draw", snapshot),
                parse_mode=ParseMode.HTML,
                reply_markup=get_giveaway_confirm_keyboard("draw", giveaway_id, workspace_id),
            )
            return
        elif callback_data.startswith("gw_confirm_draw_"):
            giveaway_id = callback_data.replace("gw_confirm_draw_", "", 1)
            try:
                draw_giveaway_winners(owner_user_id=user_id, giveaway_id=giveaway_id)
            except GiveawayError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, "Winners drawn")
            await show_giveaway_detail(query, user_id=user_id, giveaway_id=giveaway_id, edit=True)
            return
        elif callback_data.startswith("gw_publish_results_"):
            giveaway_id = callback_data.replace("gw_publish_results_", "", 1)
            try:
                snapshot = get_giveaway_public_snapshot(giveaway_id=giveaway_id)
                workspace = snapshot.get("workspace") or {}
                chat_id = workspace.get("telegram_chat_id")
                if not chat_id:
                    raise GiveawayError("workspace_chat_missing", "This group is missing a Telegram chat id.", 409)
                sent = await context.bot.send_message(
                    chat_id=int(chat_id),
                    text=render_public_giveaway_result_text(snapshot),
                    parse_mode=ParseMode.HTML,
                    disable_web_page_preview=True,
                )
                mark_results_published(owner_user_id=user_id, giveaway_id=giveaway_id, results_message_id=sent.message_id)
            except GiveawayError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            except Exception as exc:
                logger.warning("Could not publish giveaway results %s: %s", giveaway_id, exc)
                await safe_answer_callback(query, "❌ Could not publish the giveaway results to the group.", show_alert=True)
                return
            await safe_answer_callback(query, "Results published")
            await show_giveaway_detail(query, user_id=user_id, giveaway_id=giveaway_id, edit=True)
            return
        elif callback_data.startswith("gw_results_"):
            giveaway_id = callback_data.replace("gw_results_", "", 1)
            try:
                snapshot = get_giveaway_owner_snapshot(owner_user_id=user_id, giveaway_id=giveaway_id)
            except GiveawayError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            workspace_id = str((snapshot.get("workspace") or {}).get("workspace_id") or (snapshot.get("giveaway") or {}).get("workspace_id") or "")
            await safe_answer_callback(query)
            await query.edit_message_text(
                render_giveaway_confirm_text("results", snapshot),
                parse_mode=ParseMode.HTML,
                reply_markup=get_giveaway_confirm_keyboard("results", giveaway_id, workspace_id),
            )
            return
        elif callback_data.startswith("gw_confirm_results_"):
            giveaway_id = callback_data.replace("gw_confirm_results_", "", 1)
            try:
                mark_results_published(owner_user_id=user_id, giveaway_id=giveaway_id)
            except GiveawayError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, "Results marked published")
            await show_giveaway_detail(query, user_id=user_id, giveaway_id=giveaway_id, edit=True)
            return
        elif callback_data.startswith("gw_cancel_"):
            giveaway_id = callback_data.replace("gw_cancel_", "", 1)
            try:
                snapshot = get_giveaway_owner_snapshot(owner_user_id=user_id, giveaway_id=giveaway_id)
            except GiveawayError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            workspace_id = str((snapshot.get("workspace") or {}).get("workspace_id") or (snapshot.get("giveaway") or {}).get("workspace_id") or "")
            await safe_answer_callback(query)
            await query.edit_message_text(
                render_giveaway_confirm_text("cancel", snapshot),
                parse_mode=ParseMode.HTML,
                reply_markup=get_giveaway_confirm_keyboard("cancel", giveaway_id, workspace_id),
            )
            return
        elif callback_data.startswith("gw_confirm_cancel_"):
            giveaway_id = callback_data.replace("gw_confirm_cancel_", "", 1)
            try:
                cancel_giveaway(owner_user_id=user_id, giveaway_id=giveaway_id, reason="owner_cancelled_from_bot")
            except GiveawayError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, "Giveaway cancelled")
            await show_giveaway_detail(query, user_id=user_id, giveaway_id=giveaway_id, edit=True)
            return
        elif callback_data.startswith("gw_join_"):
            giveaway_id = callback_data.replace("gw_join_", "", 1)
            try:
                snapshot = get_giveaway_public_snapshot(giveaway_id=giveaway_id)
                workspace = snapshot.get("workspace") or {}
                target_chat_id = int(workspace.get("telegram_chat_id") or 0)
                msg = getattr(query, 'message', None)
                current_chat_id = int(((getattr(msg, 'chat', None) and getattr(msg.chat, 'id', 0)) or getattr(msg, 'chat_id', 0) or 0))
                if target_chat_id and current_chat_id and target_chat_id != current_chat_id:
                    await safe_answer_callback(query, "Open the live giveaway post in the target group to join.", show_alert=True)
                    return
                result = join_giveaway_public(giveaway_id=giveaway_id, user_id=user_id)
            except GiveawayError as exc:
                message = exc.message
                show_alert = exc.code in {"giveaway_cancelled", "giveaway_not_found", "workspace_chat_missing"}
                await safe_answer_callback(query, f"❌ {message}", show_alert=show_alert)
                return
            outcome = str(result.get("outcome") or "")
            if outcome == "already_joined":
                await safe_answer_callback(query, "You already joined this giveaway.")
            else:
                await safe_answer_callback(query, "You're in. Good luck.")
            return
        elif callback_data.startswith("workspace_toggle_duel_"):
            workspace_id = callback_data.replace("workspace_toggle_duel_", "", 1)
            try:
                detail = toggle_workspace_setting(user_id, workspace_id, "post_duel_created_enabled")
            except WorkspaceError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, "Updated")
            await show_workspace_detail(query, user_id=user_id, workspace_id=workspace_id, edit=True, bot=context.bot)
            return
        elif callback_data.startswith("workspace_toggle_result_"):
            workspace_id = callback_data.replace("workspace_toggle_result_", "", 1)
            try:
                detail = toggle_workspace_setting(user_id, workspace_id, "post_duel_result_enabled")
            except WorkspaceError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, "Updated")
            await show_workspace_detail(query, user_id=user_id, workspace_id=workspace_id, edit=True, bot=context.bot)
            return
        elif callback_data.startswith("workspace_set_default_"):
            workspace_id = callback_data.replace("workspace_set_default_", "", 1)
            try:
                detail = set_default_workspace(user_id, workspace_id)
            except WorkspaceError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, "Default group updated")
            await show_workspace_detail(query, user_id=user_id, workspace_id=workspace_id, edit=True, bot=context.bot)
            return
        elif callback_data.startswith("workspace_test_"):
            workspace_id = callback_data.replace("workspace_test_", "", 1)
            try:
                result = await publish_test_post(context.bot, workspace_id=workspace_id, user_id=user_id)
            except WorkspaceError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, f"✅ Test post sent (#{result['messageId']})", show_alert=False)
            await show_workspace_detail(query, user_id=user_id, workspace_id=workspace_id, edit=True, bot=context.bot)
            return
        elif callback_data.startswith("ws_toggle_lb_"):
            workspace_id = callback_data.replace("ws_toggle_lb_", "", 1)
            try:
                detail = toggle_workspace_setting(user_id, workspace_id, "leaderboard_posts_enabled")
            except WorkspaceError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, "Updated")
            await show_workspace_detail(query, user_id=user_id, workspace_id=workspace_id, edit=True, bot=context.bot)
            return
        elif callback_data.startswith("ws_toggle_weekly_"):
            workspace_id = callback_data.replace("ws_toggle_weekly_", "", 1)
            try:
                detail = toggle_workspace_setting(user_id, workspace_id, "weekly_summary_enabled")
            except WorkspaceError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, "Updated")
            await show_workspace_detail(query, user_id=user_id, workspace_id=workspace_id, edit=True, bot=context.bot)
            return
        elif callback_data.startswith("ws_scope_"):
            workspace_id = callback_data.replace("ws_scope_", "", 1)
            try:
                detail = set_workspace_default_scope(user_id, workspace_id)
            except WorkspaceError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, "Default scope updated")
            await show_workspace_detail(query, user_id=user_id, workspace_id=workspace_id, edit=True, bot=context.bot)
            return
        elif callback_data.startswith("ws_pub_chat_"):
            workspace_id = callback_data.replace("ws_pub_chat_", "", 1)
            try:
                result = await publish_workspace_leaderboard_post(context.bot, workspace_id=workspace_id, user_id=user_id, kind="chat")
            except (WorkspaceError, WorkspacePublishError) as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, f"✅ Chat leaderboard posted (#{result['messageId']})")
            await show_workspace_detail(query, user_id=user_id, workspace_id=workspace_id, edit=True, bot=context.bot)
            return
        elif callback_data.startswith("ws_pub_weekly_"):
            workspace_id = callback_data.replace("ws_pub_weekly_", "", 1)
            try:
                result = await publish_workspace_leaderboard_post(context.bot, workspace_id=workspace_id, user_id=user_id, kind="weekly")
            except (WorkspaceError, WorkspacePublishError) as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, f"✅ Weekly leaders posted (#{result['messageId']})")
            await show_workspace_detail(query, user_id=user_id, workspace_id=workspace_id, edit=True, bot=context.bot)
            return
        elif callback_data.startswith("ws_pub_champ_"):
            workspace_id = callback_data.replace("ws_pub_champ_", "", 1)
            try:
                result = await publish_workspace_leaderboard_post(context.bot, workspace_id=workspace_id, user_id=user_id, kind="champion")
            except (WorkspaceError, WorkspacePublishError) as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, f"✅ Champion post sent (#{result['messageId']})")
            await show_workspace_detail(query, user_id=user_id, workspace_id=workspace_id, edit=True, bot=context.bot)
            return
        elif callback_data.startswith("ws_pub_preview_"):
            workspace_id = callback_data.replace("ws_pub_preview_", "", 1)
            try:
                result = await publish_workspace_leaderboard_post(context.bot, workspace_id=workspace_id, user_id=user_id, kind="preview")
            except (WorkspaceError, WorkspacePublishError) as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, "✅ Preview sent to your private bot chat")
            await show_workspace_detail(query, user_id=user_id, workspace_id=workspace_id, edit=True, bot=context.bot)
            return
        elif callback_data.startswith("workspace_refresh_"):
            await safe_answer_callback(query, "Rechecked")
            workspace_id = callback_data.replace("workspace_refresh_", "", 1)
            await show_workspace_detail(query, user_id=user_id, workspace_id=workspace_id, edit=True, bot=context.bot)
            return
        elif callback_data.startswith("workspace_disconnect_apply_"):
            workspace_id = callback_data.replace("workspace_disconnect_apply_", "", 1)
            try:
                disconnect_workspace(user_id, workspace_id)
            except WorkspaceError as exc:
                await safe_answer_callback(query, f"❌ {exc.message}", show_alert=True)
                return
            await safe_answer_callback(query, "Group disconnected")
            await show_workspace_list(query, user_id=user_id, edit=True)
            return
        elif callback_data.startswith("workspace_disconnect_"):
            workspace_id = callback_data.replace("workspace_disconnect_", "", 1)
            detail = get_workspace_detail(user_id, workspace_id)
            if not detail:
                await safe_answer_callback(query, "❌ Group not found", show_alert=True)
                await show_workspace_list(query, user_id=user_id, edit=True)
                return
            await safe_answer_callback(query)
            await query.edit_message_text(
                render_workspace_disconnect_confirm_text(detail),
                parse_mode=ParseMode.HTML,
                reply_markup=get_workspace_disconnect_confirm_keyboard(workspace_id),
            )
            return
        elif callback_data == "invite_friends":
            snapshot = get_referral_snapshot(user_id)
            await query.edit_message_text(
                render_referral_text(snapshot),
                parse_mode=ParseMode.HTML,
                reply_markup=get_referral_keyboard(snapshot.get('shareInvite')),
                disable_web_page_preview=True,
            )
            return
        elif callback_data == "invite_show_link":
            snapshot = get_referral_snapshot(user_id)
            invite_link = str(snapshot.get("inviteLink") or "").strip()
            if not invite_link:
                await safe_answer_callback(query, "❌ Invite link is not ready yet.", show_alert=True)
                return
            await context.bot.send_message(
                chat_id=query.message.chat_id,
                text=render_invite_link_text(snapshot),
                parse_mode=ParseMode.HTML,
                disable_web_page_preview=True,
            )
            await safe_answer_callback(query, "Invite link sent below.")
            return
        elif callback_data == "invite_send_card":
            snapshot = get_referral_snapshot(user_id)
            invite_link = str(snapshot.get("inviteLink") or "").strip()
            if not invite_link:
                await safe_answer_callback(query, "❌ Invite link is not ready yet.", show_alert=True)
                return
            await context.bot.send_message(
                chat_id=query.message.chat_id,
                text=render_invite_card_text(snapshot),
                parse_mode=ParseMode.HTML,
                reply_markup=get_invite_card_keyboard(invite_link),
                disable_web_page_preview=True,
            )
            await safe_answer_callback(query, "Invite card sent below. Forward it to a friend if you prefer a card.")
            return
        elif callback_data == "transaction_history":
            await handle_transaction_history(query, context)
            return
        else:
            await query.edit_message_text("❓ Неизвестная команда")
            
    except Exception as e:
        if 'Message is not modified' in str(e):
            await safe_answer_callback(query, "Already up to date.")
        else:
            await safe_answer_callback(query, "Something went wrong. Please try again.", show_alert=True)
            logger.error(f"Error in handle_callback_query: {e}")

async def handle_main_menu(query, context):
    """Show the classic main menu."""
    await query.edit_message_text(
        render_main_menu_text(),
        reply_markup=_main_menu_markup(query.from_user.id),
        parse_mode=ParseMode.HTML,
    )

async def handle_create_game(query, context):
    """Start the classic create-duel flow."""
    allowed, error_text = _check_product_access(query.from_user.id, 'duel')
    if not allowed:
        await safe_answer_callback(query, error_text, show_alert=True)
        return
    active_kind, _ = _get_active_duel_context(query.from_user.id)
    if active_kind:
        await query.edit_message_text(
            _describe_active_duel_conflict(active_kind),
            reply_markup=get_back_button(),
        )
        return

    min_stake = float(platform_settings.get_float('min_stake_ton'))
    if get_user_balance(query.from_user.id) < min_stake:
        await query.edit_message_text(
            render_insufficient_balance_text(query.from_user.id, required_amount=min_stake, action_label="start a real duel"),
            reply_markup=get_insufficient_balance_keyboard(),
            parse_mode=ParseMode.HTML,
        )
        return

    await query.edit_message_text(
        "💰 <b>Create Duel</b>\n\nChoose a TON stake for the new duel:",
        reply_markup=get_bet_amount_keyboard(),
        parse_mode=ParseMode.HTML,
    )

async def handle_bet_selection(query, context):
    """Обработать выбор ставки"""
    user_id = query.from_user.id
    callback_data = query.data
    # Получаем баланс пользователя
    balance = get_user_balance(user_id)
    if callback_data == "bet_all":
        bet_amount = balance
    elif callback_data == "bet_custom":
        user_states[user_id] = "waiting_custom_bet"
        await query.edit_message_text(
            "✏️ Enter a custom stake from 0.1 to 1000 TON:",
            reply_markup=get_back_button()
        )
        return
    else:
        bet_amount = float(callback_data.replace("bet_", ""))
    is_valid, error_message = validate_bet_amount(bet_amount, balance)
    if not is_valid:
        if bet_amount > balance:
            await query.edit_message_text(
                render_insufficient_balance_text(user_id, required_amount=bet_amount, action_label="create this real duel"),
                reply_markup=get_insufficient_balance_keyboard(),
                parse_mode=ParseMode.HTML,
            )
        else:
            await query.edit_message_text(
                f"❌ {error_message}",
                reply_markup=get_bet_amount_keyboard()
            )
        return
    # Создаем игру через truth-layer reservation flow
    create_result = create_game_with_reservation(user_id, bet_amount)
    if not create_result.get('ok'):
        if create_result.get('error') == 'Insufficient available balance':
            await query.edit_message_text(
                render_insufficient_balance_text(user_id, required_amount=bet_amount, action_label="create this real duel"),
                reply_markup=get_insufficient_balance_keyboard(),
                parse_mode=ParseMode.HTML,
            )
        else:
            await query.edit_message_text(
                f"❌ {create_result.get('error', 'Could not create the duel.')}",
                reply_markup=get_bet_amount_keyboard()
            )
        return
    game_id = create_result['game_id']
    success_text = f"✅ <b>Duel created.</b>\n\n"
    success_text += f"🎲 Duel ID: {game_id}\n"
    success_text += f"💰 Stake: {format_balance_display(bet_amount)}\n"
    success_text += f"⏳ Waiting for another player...\n\n"
    success_text += get_random_game_message()
    msg = await query.edit_message_text(
        success_text,
        reply_markup=get_game_created_keyboard(game_id, get_duel_share_payload(game_id=game_id, user_id=user_id)),
        parse_mode=ParseMode.HTML
    )
    # Сохраняем message_id сообщения с комнатой
    set_room_message_id(game_id, msg.message_id)
    publish_result = await publish_open_duel_to_default_workspace(context.bot, owner_user_id=user_id, game_id=game_id)
    if publish_result.get('ok'):
        try:
            await context.bot.send_message(
                chat_id=user_id,
                text=f"👥 Duel published to your default group. Message #{publish_result['messageId']}.",
            )
        except Exception:
            pass

async def handle_find_game(query, context):
    """Open the classic lobby list."""
    user_id = query.from_user.id
    allowed, error_text = _check_product_access(user_id, 'duel')
    if not allowed:
        await safe_answer_callback(query, error_text, show_alert=True)
        return
    active_kind, _ = _get_active_duel_context(user_id)
    if active_kind:
        await query.edit_message_text(
            _describe_active_duel_conflict(active_kind),
            reply_markup=get_back_button(),
        )
        return

    waiting_games = get_waiting_games()
    text = "🔍 <b>Find Duel</b>\n\n"
    text += "Open duels:" if waiting_games else "😔 No open duels yet.\nCreate one to start the lobby."
    await query.edit_message_text(
        text,
        reply_markup=get_waiting_games_keyboard(waiting_games, user_id),
        parse_mode=ParseMode.HTML,
    )

async def handle_join_game_request(query, context):
    """Обработать запрос на присоединение к игре"""
    game_id = int(query.data.replace("join_game_", ""))
    user_id = query.from_user.id
    allowed, error_text = _check_product_access(user_id, 'duel')
    if not allowed:
        await safe_answer_callback(query, text=error_text, show_alert=True)
        return
    
    # Получаем информацию об игре из списка ожидающих
    waiting_games = get_waiting_games()
    game_info = None
    
    for game in waiting_games:
        if game['game_id'] == game_id:
            game_info = game
            break
    
    if not game_info:
        await query.edit_message_text(
            "❌ This duel is no longer available.",
            reply_markup=get_back_button()
        )
        return
    
    # Проверяем баланс
    balance = get_user_balance(user_id)
    bet_amount = game_info['bet_amount']
    
    is_valid, error_message = validate_bet_amount(bet_amount, balance)
    if not is_valid:
        if bet_amount > balance:
            await query.edit_message_text(
                render_insufficient_balance_text(user_id, required_amount=bet_amount, action_label="join this real duel"),
                reply_markup=get_insufficient_balance_keyboard(),
                parse_mode=ParseMode.HTML,
            )
        else:
            await query.edit_message_text(
                f"❌ {error_message}",
                reply_markup=get_back_button()
            )
        return
    
    # Показываем подтверждение
    text = f"🎮 <b>Join Duel</b>\n\n"
    text += f"🎲 Opponent: {game_info['first_name']}\n"
    text += f"💰 Stake: {format_balance_display(bet_amount)}\n\n"
    text += "Confirm the join:"
    
    await query.edit_message_text(
        text,
        reply_markup=get_game_confirmation_keyboard(game_id, bet_amount),
        parse_mode=ParseMode.HTML
    )

async def handle_confirm_join(query, context):
    """Обработать подтверждение присоединения к игре"""
    game_id = int(query.data.replace("confirm_join_", ""))
    user_id = query.from_user.id
    # Получаем информацию об игре
    waiting_games = get_waiting_games()
    game_info = None
    for game in waiting_games:
        if game['game_id'] == game_id:
            game_info = game
            break
    if not game_info:
        await query.edit_message_text(
            "❌ This duel is no longer available.",
            reply_markup=get_back_button()
        )
        return
    # Присоединяемся к игре через truth-layer reservation flow
    join_result = join_game_with_reservation(game_id, user_id)
    if not join_result.get('ok'):
        if join_result.get('error') == 'Insufficient available balance':
            required_amount = float(game_info['bet_amount']) if game_info else None
            await query.edit_message_text(
                render_insufficient_balance_text(user_id, required_amount=required_amount, action_label="join this real duel"),
                reply_markup=get_insufficient_balance_keyboard(),
                parse_mode=ParseMode.HTML,
            )
        else:
            await query.edit_message_text(
                f"❌ {join_result.get('error', 'Could not join the duel.')}",
                reply_markup=get_back_button()
            )
        return
    game_text = (
        f"🎮 <b>Duel started.</b>\n\n"
        f"🎲 Duel #{game_id}\n"
        f"💰 Stake: {format_balance_display(game_info['bet_amount'])}\n\n"
        f"Both players can send a fresh 🎲 dice roll now. Good luck!"
    )
    await query.edit_message_text(
        game_text,
        parse_mode=ParseMode.HTML
    )
    await context.bot.send_message(
        chat_id=user_id,
        text="🎲 Send your next dice roll in this chat:",
        reply_markup=get_game_keyboard()
    )
    try:
        await context.bot.send_message(
            chat_id=game_info['player1_id'],
            text=game_text,
            parse_mode=ParseMode.HTML
        )
        await context.bot.send_message(
            chat_id=game_info['player1_id'],
            text="🎲 Send your next dice roll in this chat:",
            reply_markup=get_game_keyboard()
        )
    except Exception as e:
        logger.error(f"Ошибка отправки уведомления игроку 1: {e}")
    # Убираем сообщение с комнатой у создателя
    room_message_id = get_room_message_id(game_id)
    if room_message_id:
        try:
            await context.bot.delete_message(
                chat_id=game_info['player1_id'],
                message_id=room_message_id
            )
        except Exception as e:
            logger.error(f"Ошибка удаления сообщения с комнатой у создателя: {e}")
    await start_timers(context, game_id, game_info['player1_id'], user_id)

async def handle_balance_callback(query, context):
    """Render the classic balance screen."""
    user_id = query.from_user.id
    balance_text = render_balance_screen_text(user_id)
    if query.message.text == balance_text:
        await safe_answer_callback(query, "Balance is already up to date.")
        return
    await query.edit_message_text(
        balance_text,
        reply_markup=get_balance_keyboard(),
        parse_mode=ParseMode.HTML,
    )

async def handle_stats_callback(query, context):
    """Обработать callback статистики"""
    user_id = query.from_user.id
    stats = get_user_stats(user_id)
    
    stats_text = f"📊 <b>Your stats</b>\n\n"
    stats_text += f"💰 Balance: {format_balance_display(stats['balance'])}\n"
    stats_text += f"🎮 Played: {stats['games_played']}\n"
    stats_text += f"🏆 Wins: {stats['games_won']}\n"
    stats_text += f"📈 Win rate: {stats['win_rate']:.1f}%"
    
    await query.edit_message_text(
        stats_text,
        reply_markup=get_stats_keyboard(),
        parse_mode=ParseMode.HTML
    )

async def handle_help_callback(query, context):
    """Legacy helper kept for compatibility."""
    await query.edit_message_text(
        render_help_text(),
        reply_markup=get_help_keyboard(),
        parse_mode=ParseMode.HTML,
    )

async def handle_cancel_game(query, context):
    """Обработать отмену игры"""
    game_id = int(query.data.replace("cancel_game_", ""))
    user_id = query.from_user.id
    
    # Получаем информацию об игре для возврата ставки
    waiting_games = get_waiting_games()
    game_info = None
    
    for game in waiting_games:
        if game['game_id'] == game_id and game['player1_id'] == user_id:
            game_info = game
            break
    
    if not game_info:
        await query.edit_message_text(
            "❌ Duel not found or it has already started.",
            reply_markup=get_back_button()
        )
        return
    
    # Отменяем игру через truth-layer flow
    cancel_result = cancel_waiting_game(game_id, user_id)
    if cancel_result.get('ok'):
        await query.edit_message_text(
            f"✅ Duel cancelled.\n💰 Stake {format_balance_display(game_info['bet_amount'])} was released back to balance.",
            reply_markup=get_back_button()
        )
    else:
        await query.edit_message_text(
            "❌ Could not cancel the duel.",
            reply_markup=get_back_button()
        )

async def handle_check_game(query, context):
    """Проверить статус игры"""
    game_id = int(query.data.replace("check_game_", ""))
    user_id = query.from_user.id
    
    # Проверяем, началась ли игра
    active_game = get_active_game(user_id)
    
    if active_game and active_game['game_id'] == game_id:
        await query.edit_message_text(
            "🎮 The duel is live. Send a fresh 🎲 dice roll in this chat.",
            reply_markup=get_back_button()
        )
        
        # Отправляем игровую клавиатуру
        await context.bot.send_message(
            chat_id=user_id,
            text="🎲 Send your next dice roll in this chat:",
            reply_markup=get_game_keyboard()
        )
    else:
        # Игра все еще ожидает игроков
        waiting_games = get_waiting_games()
        game_exists = any(game['game_id'] == game_id for game in waiting_games)
        
        if game_exists:
            await query.edit_message_text(
                "⏳ The duel is still waiting for another player...",
                reply_markup=get_game_created_keyboard(game_id)
            )
        else:
            await query.edit_message_text(
                "❌ Duel not found.",
                reply_markup=get_back_button()
            )

async def handle_deposit_amount(update, context):
    user_id = update.effective_user.id
    allowed, error_text = _check_product_access(user_id, 'deposit')
    if not allowed:
        await update.message.reply_text(error_text, reply_markup=get_back_button())
        user_states.pop(user_id, None)
        return
    message_text = update.message.text.replace(',', '.')
    user_states.pop(user_id, None)
    try:
        amount = float(message_text)
        if amount < MIN_DEPOSIT_AMOUNT:
            raise ValueError
    except Exception:
        await update.message.reply_text(
            f"❌ Minimum deposit is {MIN_DEPOSIT_AMOUNT:.1f} TON.",
            reply_markup=get_back_button()
        )
        return
    commission_rate = 0.03
    invoice_amount = math.ceil(amount * (1 + commission_rate) * 100) / 100
    await update.message.reply_text("⏳ Creating a CryptoBot invoice...")
    invoice = await create_ton_invoice(invoice_amount, user_id)
    # Сохраняем инвойс через payments service (amount — это сумма, которую получит пользователь)
    create_invoice_record(user_id, amount, invoice)
    await update.message.reply_text(
        f"💸 Open the link below to deposit {amount:.2f} TON via CryptoBot.\nCryptoBot fee: 3%.\n\n{invoice['pay_url']}\n\nTotal to pay: {invoice_amount:.2f} TON",
        reply_markup=get_back_button()
    )

async def notify_successful_deposit(update, context, amount):
    await update.message.reply_text(
        f"✅ Deposit credited: {amount:.2f} TON.\nYou can now open Balance or start a real duel.",
        reply_markup=None
    )
    await update.message.reply_text(
        render_main_menu_text(),
        reply_markup=_main_menu_markup(update.effective_user.id)
    )

async def handle_withdraw_amount(update, context):
    user_id = update.effective_user.id
    allowed, error_text = _check_product_access(user_id, 'withdraw')
    if not allowed:
        await update.message.reply_text(error_text, reply_markup=get_back_button())
        user_states.pop(user_id, None)
        return
    message_text = update.message.text.replace(',', '.')
    user_states.pop(user_id, None)
    try:
        amount = float(message_text)
        if amount < platform_settings.get_float('withdrawal_min_ton'):
            raise ValueError
    except Exception:
        await update.message.reply_text(
            f"❌ Minimum withdrawal is {platform_settings.get_float('withdrawal_min_ton'):.1f} TON.",
            reply_markup=get_back_button()
        )
        return
    balance = get_user_balance(user_id)
    if amount > balance:
        await update.message.reply_text(
            f"❌ Insufficient balance. Your balance is {balance:.2f} TON.",
            reply_markup=get_back_button()
        )
        return

    create_result = create_withdrawal_request(user_id, amount)
    if not create_result.get('ok'):
        await update.message.reply_text(
            f"❌ {create_result.get('error', 'Could not create the withdrawal request.')}",
            reply_markup=get_back_button()
        )
        return

    review_status = create_result.get('review_status', 'not_required')
    if review_status == 'pending_review':
        text = f"🕒 Withdrawal request created for {amount:.2f} TON and sent to manual review."
    else:
        text = f"🕒 Withdrawal request created for {amount:.2f} TON. It will be processed in the operator queue."
    await update.message.reply_text(text, reply_markup=None)
    await update.message.reply_text(
        render_main_menu_text(),
        reply_markup=_main_menu_markup(update.effective_user.id)
    )

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик текстовых сообщений"""
    user_id = update.effective_user.id
    # Проверка блокировки пользователя
    from database import get_connection
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT is_blocked FROM users WHERE user_id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    if row and row["is_blocked"]:
        return  # Молчим для заблокированных
    giveaway_state = str(user_states.get(user_id) or "")
    if giveaway_state.startswith("gw_edit_"):
        parts = giveaway_state.split(":", 2)
        state_name = parts[0]
        giveaway_id = parts[1] if len(parts) > 1 else ""
        incoming_text = (update.message.text or "").strip()
        if not giveaway_id:
            user_states.pop(user_id, None)
            await update.message.reply_text("❌ Giveaway edit session expired. Open the giveaway again.")
            return
        try:
            snapshot = get_giveaway_owner_snapshot(owner_user_id=user_id, giveaway_id=giveaway_id)
            giveaway = snapshot.get("giveaway") or {}
            if state_name == "gw_edit_title":
                if not incoming_text:
                    raise GiveawayError("missing_giveaway_title", "Send a title in one message.", 400)
                update_giveaway_core(owner_user_id=user_id, giveaway_id=giveaway_id, title=incoming_text)
            elif state_name == "gw_edit_prize":
                if not incoming_text:
                    raise GiveawayError("missing_prize_text", "Send the prize text in one message.", 400)
                update_giveaway_core(owner_user_id=user_id, giveaway_id=giveaway_id, prize_text=incoming_text)
            elif state_name == "gw_edit_winners":
                winners_count = int(incoming_text)
                update_giveaway_core(owner_user_id=user_id, giveaway_id=giveaway_id, winners_count=winners_count)
            elif state_name == "gw_edit_deadline":
                deadline = _parse_giveaway_deadline_input(incoming_text)
                update_giveaway_core(owner_user_id=user_id, giveaway_id=giveaway_id, ends_at=deadline)
            else:
                user_states.pop(user_id, None)
                await update.message.reply_text("❌ Giveaway edit session expired. Open the giveaway again.")
                return
        except ValueError:
            field_name = state_name.replace("gw_edit_", "", 1)
            await update.message.reply_text(
                "❌ Send a whole number like 1, 3, or 5.",
                parse_mode=ParseMode.HTML,
                reply_markup=get_giveaway_edit_prompt_keyboard(giveaway_id, field_name),
            )
            user_states[user_id] = giveaway_state
            return
        except GiveawayError as exc:
            field_name = state_name.replace("gw_edit_", "", 1)
            giveaway_title = None
            try:
                giveaway_title = (get_giveaway_owner_snapshot(owner_user_id=user_id, giveaway_id=giveaway_id).get("giveaway") or {}).get("title")
            except Exception:
                giveaway_title = None
            await update.message.reply_text(
                f"❌ {exc.message}\n\n{render_giveaway_edit_prompt(field_name, giveaway_title)}",
                parse_mode=ParseMode.HTML,
                reply_markup=get_giveaway_edit_prompt_keyboard(giveaway_id),
            )
            user_states[user_id] = giveaway_state
            return
        user_states.pop(user_id, None)
        await update.message.reply_text("✅ Giveaway updated.")
        await show_giveaway_detail(update.message, user_id=user_id, giveaway_id=giveaway_id, edit=False)
        return
    # Проверка состояния для пополнения TON
    if user_states.get(user_id) == 'waiting_deposit_amount':
        await handle_deposit_amount(update, context)
        return
    # Проверка состояния для вывода TON
    if user_states.get(user_id) == 'waiting_withdraw_amount':
        await handle_withdraw_amount(update, context)
        return
    # Проверка состояния для поиска пользователя админом
    admin_lookup_state = user_states.get(user_id)
    if admin_lookup_state == 'admin_waiting_user_id':
        if not _allow_admin_message_state(user_id, admin_lookup_state):
            return
        user_states.pop(user_id, None)
        try:
            target_id = int(update.message.text.strip())
        except Exception:
            await update.message.reply_text(
                "❌ Некорректный ID. Введите числовой ID пользователя:",
                reply_markup=get_admin_shortcuts_keyboard("admin_users", _admin_web_url('/users'))
            )
            user_states[user_id] = 'admin_waiting_user_id'
            return
        user_card = admin_read_models.get_user_card(target_id)
        if not user_card:
            await update.message.reply_text(
                "❌ Пользователь не найден. Введите другой ID или откройте Users в web admin.",
                reply_markup=get_admin_shortcuts_keyboard("admin_users", _admin_web_url('/users')),
                disable_web_page_preview=True,
            )
            user_states[user_id] = 'admin_waiting_user_id'
            return
        await update.message.reply_text(
            _render_tg_admin_user_lookup_receipt(user_card),
            reply_markup=get_admin_shortcuts_keyboard("admin_users", _admin_web_url(f"/users/{target_id}")),
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=True,
        )
        return
    # Проверка состояния для изменения баланса пользователя админом
    current_state = user_states.get(user_id, '')
    if current_state.startswith('admin_waiting_balance_'):
        if not _allow_admin_message_state(user_id, current_state):
            return
        target_id = int(current_state.replace('admin_waiting_balance_', ''))
        user_states.pop(user_id, None)
        try:
            amount = float(update.message.text.replace(',', '.'))
        except Exception:
            await update.message.reply_text(
                "❌ Некорректная сумма. Введите число:",
                reply_markup=get_admin_user_keyboard(target_id, False)
            )
            user_states[user_id] = f'admin_waiting_balance_{target_id}'
            return
        from database import get_connection
        risk_service.manual_balance_adjustment(target_id, amount, operator_id=str(user_id), reason='legacy_admin_balance_adjustment')
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT user_id, username, first_name, balance, is_blocked, games_played, games_won, created_at FROM users WHERE user_id = ?", (target_id,))
        row = cursor.fetchone()
        conn.close()
        info = f"<b>Пользователь #{row['user_id']}</b>\n"
        info += f"Имя: {row['first_name'] or '-'}\n"
        info += f"Username: @{row['username'] or '-'}\n"
        info += f"Баланс: {row['balance']:.2f} TON\n"
        info += f"Статус: {'Заблокирован' if row['is_blocked'] else 'Активен'}\n"
        info += f"Игр сыграно: {row['games_played']}\n"
        info += f"Побед: {row['games_won']}\n"
        info += f"Дата регистрации: {row['created_at']} (UTC)"
        await update.message.reply_text(
            info,
            reply_markup=get_admin_user_keyboard(row['user_id'], bool(row['is_blocked'])),
            parse_mode=ParseMode.HTML
        )
        return
    # Проверка состояния для broadcast draft text
    admin_broadcast_state = user_states.get(user_id, '')
    if admin_broadcast_state.startswith('admin_bc_text:'):
        if not _allow_admin_message_state(user_id, admin_broadcast_state):
            return
        broadcast_id = admin_broadcast_state.split(':', 1)[1]
        user_states.pop(user_id, None)
        result = broadcast_service.set_broadcast_text(broadcast_id, text=update.message.text, operator_id=str(user_id))
        row = result.get('broadcast') if result.get('ok') else broadcast_service.get_broadcast(broadcast_id)
        suffix = "\n\n✅ Broadcast text updated." if result.get('ok') else f"\n\n❌ {escape(str(result.get('error') or 'broadcast_text_failed'))}"
        await update.message.reply_text(
            _render_tg_admin_broadcast_detail_text(row) + suffix,
            reply_markup=get_admin_broadcast_detail_keyboard(broadcast_id, str((row or {}).get('status') or 'draft'), _admin_web_url('/')),
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=True,
        )
        return
    # Проверка состояния для notice draft text
    admin_notice_state = user_states.get(user_id, '')
    if admin_notice_state.startswith('admin_notice_text:'):
        if not _allow_admin_message_state(user_id, admin_notice_state):
            return
        notice_id = admin_notice_state.split(':', 1)[1]
        user_states.pop(user_id, None)
        result = notice_service.set_notice_text(notice_id, body_text=update.message.text, operator_id=str(user_id))
        row = result.get('notice') if result.get('ok') else notice_service.get_notice(notice_id)
        suffix = "\n\n✅ Notice text updated." if result.get('ok') else f"\n\n❌ {escape(str(result.get('error') or 'notice_text_failed'))}"
        await update.message.reply_text(
            _render_tg_admin_notice_detail_text(row) + suffix,
            reply_markup=get_admin_notice_detail_keyboard(notice_id, str((row or {}).get('status') or 'draft'), _admin_web_url('/')),
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=True,
        )
        return
    message_text = update.message.text
    
    # Проверяем состояние пользователя
    user_state = user_states.get(user_id)
    
    if user_state == "waiting_custom_bet":
        await handle_custom_bet_input(update, context)
        return
    
    # Обрабатываем кнопки reply клавиатуры
    if message_text == "🎲":
        # Проверяем наличие активной игры
        active_game = get_active_game(user_id)
        if not active_game:
            await update.message.reply_text(
                "❌ You do not have an active duel!",
                reply_markup=_main_menu_markup(user_id)
            )
            return
        # Теперь бот не отправляет кубик, пользователь отправляет сам
        return
    elif message_text in {"📋 Main menu", "📋 Главное меню", "/menu", "menu"}:
        await update.message.reply_text(
            render_main_menu_text(),
            reply_markup=_main_menu_markup(user_id),
            parse_mode=ParseMode.HTML,
        )
        
    elif message_text in {"❌ Leave duel", "❌ Покинуть игру"}:
        await handle_leave_game_message(update, context)
        
    else:
        return

async def handle_custom_bet_input(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработать ввод пользовательской ставки"""
    user_id = update.effective_user.id
    message_text = update.message.text
    
    # Удаляем состояние пользователя
    user_states.pop(user_id, None)
    
    try:
        bet_amount = float(message_text.replace(",", "."))
    except ValueError:
        await update.message.reply_text(
            "❌ Invalid amount. Enter a number.",
            reply_markup=get_bet_amount_keyboard()
        )
        return
    
    # Проверяем корректность ставки
    balance = get_user_balance(user_id)
    is_valid, error_message = validate_bet_amount(bet_amount, balance)
    
    if not is_valid:
        if bet_amount > balance:
            await update.message.reply_text(
                render_insufficient_balance_text(user_id, required_amount=bet_amount, action_label="create this real duel"),
                reply_markup=get_insufficient_balance_keyboard(),
                parse_mode=ParseMode.HTML,
            )
        else:
            await update.message.reply_text(
                f"❌ {error_message}",
                reply_markup=get_bet_amount_keyboard()
            )
        return
    
    # Создаем игру через truth-layer reservation flow
    create_result = create_game_with_reservation(user_id, bet_amount)
    if not create_result.get('ok'):
        if create_result.get('error') == 'Insufficient available balance':
            await update.message.reply_text(
                render_insufficient_balance_text(user_id, required_amount=bet_amount, action_label="create this real duel"),
                reply_markup=get_insufficient_balance_keyboard(),
                parse_mode=ParseMode.HTML,
            )
        else:
            await update.message.reply_text(
                f"❌ {create_result.get('error', 'Could not create the duel.')}",
                reply_markup=get_bet_amount_keyboard()
            )
        return
    game_id = create_result['game_id']
    
    success_text = f"✅ <b>Duel created.</b>\n\n"
    success_text += f"🎲 Duel ID: {game_id}\n"
    success_text += f"💰 Stake: {format_balance_display(bet_amount)}\n"
    success_text += f"⏳ Waiting for another player...\n\n"
    success_text += get_random_game_message()
    
    sent = await update.message.reply_text(
        success_text,
        reply_markup=get_game_created_keyboard(game_id, get_duel_share_payload(game_id=game_id, user_id=user_id)),
        parse_mode=ParseMode.HTML
    )
    set_room_message_id(game_id, sent.message_id)
    publish_result = await publish_open_duel_to_default_workspace(context.bot, owner_user_id=user_id, game_id=game_id)
    if publish_result.get('ok'):
        try:
            await context.bot.send_message(
                chat_id=user_id,
                text=f"👥 Duel published to your default group. Message #{publish_result['messageId']}.",
            )
        except Exception:
            pass

async def handle_leave_game(query, context):
    """Handle leaving either a real or practice duel via callback."""
    user_id = query.from_user.id
    leave_result = await leave_active_game(user_id, context)
    if not leave_result.get('ok'):
        await query.edit_message_text("❌ You do not have an active duel.", reply_markup=get_back_button())
        return
    reply_markup = get_practice_menu_keyboard() if leave_result.get('mode') == 'practice' else _main_menu_markup(user_id)
    await query.edit_message_text(
        leave_result['userMessage'],
        reply_markup=reply_markup,
    )


async def handle_leave_game_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle leaving either a real or practice duel via text."""
    user_id = update.effective_user.id
    leave_result = await leave_active_game(user_id, context)
    if not leave_result.get('ok'):
        await update.message.reply_text("❌ You do not have an active duel.", reply_markup=get_back_button())
        return
    reply_markup = get_practice_menu_keyboard() if leave_result.get('mode') == 'practice' else _main_menu_markup(user_id)
    await update.message.reply_text(
        leave_result['userMessage'],
        reply_markup=reply_markup,
    )


async def leave_active_game(user_id: int, context):
    """Leave the current real or practice duel."""
    result = cancel_active_game_by_user(user_id)
    if result.get('ok'):
        opponent_id = result.get('opponent_id')
        game_id = result.get('game_id')
        bet_amount = result.get('bet_amount')
        if game_id is not None:
            _clear_timer_scope(game_id, [uid for uid in [user_id, opponent_id] if uid is not None])
        if opponent_id:
            try:
                await context.bot.send_message(
                    chat_id=opponent_id,
                    text=f"😔 Your opponent left the duel.\n💰 Stake {format_balance_display(bet_amount)} was returned to your balance.",
                    reply_markup=remove_reply_keyboard(),
                )
                await context.bot.send_message(
                    chat_id=opponent_id,
                    text="🎲 Want to open another duel?",
                    reply_markup=_main_menu_markup(opponent_id),
                )
            except Exception as e:
                logger.error(f"Ошибка уведомления противника о выходе: {e}")
        return {"ok": True, "userMessage": "✅ You left the duel.", "mode": "real"}

    practice_result = cancel_active_practice_game_by_user(user_id)
    if practice_result.get('ok'):
        opponent_id = practice_result.get('opponent_id')
        stake_amount = practice_result.get('stake_amount')
        if opponent_id:
            try:
                await context.bot.send_message(
                    chat_id=opponent_id,
                    text=f"😔 Your opponent left the practice duel.\n💎 Practice stake {_format_practice_amount(stake_amount)} was returned to your demo balance.",
                    reply_markup=remove_reply_keyboard(),
                )
                await context.bot.send_message(
                    chat_id=opponent_id,
                    text="🧪 Want to open another practice duel?",
                    reply_markup=get_practice_menu_keyboard(),
                )
            except Exception as e:
                logger.error(f"Error notifying practice opponent about leave: {e}")
        practice_key = f"practice:{practice_result.get('practice_game_id')}"
        _clear_timer_scope(practice_key, [uid for uid in [user_id, opponent_id] if uid is not None])
        return {"ok": True, "userMessage": "✅ You left the practice duel.", "mode": "practice"}

    return {"ok": False, "mode": None}


async def handle_game_status(query, context):
    """Показать статус текущей игры"""
    user_id = query.from_user.id
    active_game = get_active_game(user_id)
    
    if not active_game:
        await query.edit_message_text(
            "❌ You do not have an active duel.",
            reply_markup=get_back_button()
        )
        return
    
    # Определяем противника
    opponent_id = active_game['player2_id'] if user_id == active_game['player1_id'] else active_game['player1_id']
    current_turn = active_game['current_turn']
    
    try:
        opponent_info = await context.bot.get_chat(opponent_id)
        opponent_name = opponent_info.first_name
    except:
        opponent_name = "Opponent"
    
    status_text = f"🎮 <b>Duel status #{active_game['game_id']}</b>\n\n"
    status_text += f"👤 Opponent: {opponent_name}\n"
    status_text += f"💰 Stake: {format_balance_display(active_game['bet_amount'])}\n"
    
    if current_turn == user_id:
        status_text += f"⚡ Your turn. Send a fresh 🎲 dice message."
    else:
        status_text += f"⏳ Waiting for the opponent's roll..."
    
    if active_game['player1_roll'] > 0:
        player1_emoji = get_dice_emoji(active_game['player1_roll'])
        status_text += f"\n🎲 Player 1: {player1_emoji} ({active_game['player1_roll']})"
    
    if active_game['player2_roll'] > 0:
        player2_emoji = get_dice_emoji(active_game['player2_roll'])
        status_text += f"\n🎲 Player 2: {player2_emoji} ({active_game['player2_roll']})"
    
    await query.edit_message_text(
        status_text,
        reply_markup=get_back_button(),
        parse_mode=ParseMode.HTML
    )

async def handle_game_finish(context, game):
    """Обработать завершение игры"""
    game_id = game['game_id']
    player1_id = game['player1_id']
    player2_id = game['player2_id']
    player1_roll = game['player1_roll']
    player2_roll = game['player2_roll']
    bet_amount = game['bet_amount']

    # Получаем имена игроков
    try:
        player1_info = await context.bot.get_chat(player1_id)
        player2_info = await context.bot.get_chat(player2_id)
        player1_name = player1_info.first_name
        player2_name = player2_info.first_name
    except:
        player1_name = "Player 1"
        player2_name = "Player 2"

    # Определяем победителя
    winner = determine_winner(player1_roll, player2_roll)

    # --- Новый блок: определяем, кто бросил вторым ---
    # По current_turn: если current_turn == player1_id, значит player2 бросил вторым, и наоборот
    if game['current_turn'] == player1_id:
        second_roller_id = player2_id
        second_roller_value = player2_roll
    else:
        second_roller_id = player1_id
        second_roller_value = player1_roll
    try:
        from game_logic import get_dice_emoji
        await context.bot.send_message(
            chat_id=second_roller_id,
            text=f"✅ Your roll: {get_dice_emoji(second_roller_value)} ({second_roller_value})",
            reply_markup=remove_reply_keyboard()
        )
    except Exception:
        pass
    # --- Конец нового блока ---

    if winner == "draw":
        winner_id = None
        result_text = format_game_result(player1_name, player1_roll, player2_name, player2_roll, winner)
        result_text += f"\n💰 Stakes returned: {format_balance_display(bet_amount)}"
        settle_result = settle_game(game_id, None, reason="draw")
    else:
        winner_id = player1_id if winner == "player1" else player2_id
        bank = bet_amount * 2
        winnings = round(bank * 0.95, 2)
        result_text = format_game_result(player1_name, player1_roll, player2_name, player2_roll, winner)
        result_text += f"\n💰 Winnings: {format_balance_display(winnings)}"
        settle_result = settle_game(game_id, winner_id, reason="completed")

    if not settle_result.get('ok'):
        logger.error(f"Ошибка завершения игры {game_id}: {settle_result.get('error')}")
        await context.bot.send_message(chat_id=player1_id, text="❌ Could not settle the duel result.")
        await context.bot.send_message(chat_id=player2_id, text="❌ Could not settle the duel result.")
        return

    # Отправляем результаты обоим игрокам
    final_message = f"🏁 <b>Duel finished.</b>\n\n{result_text}"
    try:
        await context.bot.send_message(
            chat_id=player1_id,
            text=final_message,
            parse_mode=ParseMode.HTML,
            reply_markup=get_result_actions_keyboard(get_result_share_payload(game_id=game_id, user_id=player1_id)),
        )
        await context.bot.send_message(
            chat_id=player2_id,
            text=final_message,
            parse_mode=ParseMode.HTML,
            reply_markup=get_result_actions_keyboard(get_result_share_payload(game_id=game_id, user_id=player2_id)),
        )
    except Exception as e:
        logger.error(f"Ошибка отправки финального сообщения: {e}")
    try:
        await publish_result_to_default_workspaces(context.bot, participant_user_ids=[player1_id, player2_id], game_id=game_id)
    except Exception as e:
        logger.error(f"Ошибка публикации результата в группы: {e}")

async def handle_practice_game_finish(context, game):
    practice_game_id = game['practice_game_id']
    player1_id = game['player1_id']
    player2_id = game['player2_id']
    player1_roll = game['player1_roll']
    player2_roll = game['player2_roll']
    stake_amount = float(game['stake_amount'])

    try:
        player1_info = await context.bot.get_chat(player1_id)
        player2_info = await context.bot.get_chat(player2_id)
        player1_name = player1_info.first_name
        player2_name = player2_info.first_name
    except Exception:
        player1_name = 'Player 1'
        player2_name = 'Player 2'

    winner = determine_winner(player1_roll, player2_roll)
    if game['current_turn'] == player1_id:
        second_roller_id = player2_id
        second_roller_value = player2_roll
    else:
        second_roller_id = player1_id
        second_roller_value = player1_roll
    try:
        await context.bot.send_message(
            chat_id=second_roller_id,
            text=f"✅ Practice roll: {get_dice_emoji(second_roller_value)} ({second_roller_value})",
            reply_markup=remove_reply_keyboard(),
        )
    except Exception:
        pass

    if winner == 'draw':
        settle_result = settle_practice_game(practice_game_id, None, reason='draw')
        result_text = _format_practice_result_text(player1_name, player1_roll, player2_name, player2_roll, winner, stake_amount)
    else:
        winner_id = player1_id if winner == 'player1' else player2_id
        settle_result = settle_practice_game(practice_game_id, winner_id, reason='completed')
        result_text = _format_practice_result_text(player1_name, player1_roll, player2_name, player2_roll, winner, stake_amount)

    if not settle_result.get('ok'):
        logger.error(f"Error settling practice duel {practice_game_id}: {settle_result.get('error')}")
        try:
            await context.bot.send_message(chat_id=player1_id, text='❌ Could not settle the practice duel result.')
            await context.bot.send_message(chat_id=player2_id, text='❌ Could not settle the practice duel result.')
        except Exception:
            pass
        return

    final_message = f"🧪 <b>Practice Duel finished.</b>\n\n{result_text}"
    try:
        await context.bot.send_message(chat_id=player1_id, text=final_message, parse_mode=ParseMode.HTML)
        await context.bot.send_message(chat_id=player2_id, text=final_message, parse_mode=ParseMode.HTML)
        await context.bot.send_message(chat_id=player1_id, text='🧪 Want another practice duel or are you ready to start a real duel?', reply_markup=get_practice_menu_keyboard())
        await context.bot.send_message(chat_id=player2_id, text='🧪 Want another practice duel or are you ready to start a real duel?', reply_markup=get_practice_menu_keyboard())
    except Exception as e:
        logger.error(f"Error sending practice final message: {e}")


async def handle_dice_roll(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Handle a dice roll for either real or practice duels."""
    user_id = update.effective_user.id
    msg = update.message
    if msg.chat.type != 'private':
        await msg.reply_text("❌ Dice rolls are only accepted in the private chat with the bot.")
        return
    if (
        user_id not in ADMIN_IDS and (
            (hasattr(msg, "forward_origin") and msg.forward_origin)
            or (hasattr(msg, "forward_date") and msg.forward_date)
            or (hasattr(msg, "forward_sender_name") and msg.forward_sender_name)
        )
    ):
        await msg.reply_text("❌ Forwarded dice do not count. Send a fresh roll instead.")
        return

    dice_value = msg.dice.value
    logger.info("DICE ROLL: user=%s value=%s", user_id, dice_value)

    mode, active_game = _get_active_duel_context(user_id)
    if not active_game:
        await msg.reply_text(
            "❌ You do not have an active duel.\nCreate one or join an open duel first.",
            reply_markup=_main_menu_markup(user_id),
        )
        return

    if mode == 'practice':
        practice_game_id = int(active_game['practice_game_id'])
        player1_id = active_game['player1_id']
        player2_id = active_game['player2_id']
        if (user_id == player1_id and active_game['player1_roll'] > 0) or (user_id == player2_id and active_game['player2_roll'] > 0):
            await msg.reply_text("❗ You already rolled in this practice duel.")
            return
        update_practice_game_roll(practice_game_id, user_id, dice_value)
        await cancel_timers(f"practice:{practice_game_id}", user_id)
        opponent_id = player2_id if user_id == player1_id else player1_id
        try:
            await context.bot.forward_message(
                chat_id=opponent_id,
                from_chat_id=update.effective_chat.id,
                message_id=msg.message_id,
            )
        except Exception as e:
            logger.error("Error forwarding practice dice to %s: %s", opponent_id, e)
        updated_game = get_active_practice_game(user_id)
        player1_roll = updated_game['player1_roll']
        player2_roll = updated_game['player2_roll']
        if player1_roll > 0 and player2_roll > 0:
            await handle_practice_game_finish(context, updated_game)
            practice_key = f"practice:{practice_game_id}"
            _clear_timer_scope(practice_key, [player1_id, player2_id])
        else:
            await msg.reply_text(
                f"✅ Practice roll: {get_dice_emoji(dice_value)} ({dice_value})\n⏳ Waiting for the opponent's roll...",
                reply_markup=remove_reply_keyboard(),
            )
        return

    game_id = active_game['game_id']
    player1_id = active_game['player1_id']
    player2_id = active_game['player2_id']
    if (user_id == player1_id and active_game['player1_roll'] > 0) or (user_id == player2_id and active_game['player2_roll'] > 0):
        await msg.reply_text("❗ You already rolled in this duel.")
        return
    update_game_roll(game_id, user_id, dice_value)
    await cancel_timers(game_id, user_id)
    opponent_id = player2_id if user_id == player1_id else player1_id
    try:
        await context.bot.forward_message(
            chat_id=opponent_id,
            from_chat_id=update.effective_chat.id,
            message_id=msg.message_id,
        )
    except Exception as e:
        logger.error(f"Ошибка пересылки кубика противнику {opponent_id}: {e}")
    updated_game = get_active_game(user_id)
    player1_roll = updated_game['player1_roll']
    player2_roll = updated_game['player2_roll']
    if player1_roll > 0 and player2_roll > 0:
        await handle_game_finish(context, updated_game)
        _clear_timer_scope(game_id, [player1_id, player2_id])
    else:
        await msg.reply_text(
            f"✅ Your roll: {get_dice_emoji(dice_value)} ({dice_value})\n⏳ Waiting for the opponent's roll...",
            reply_markup=remove_reply_keyboard(),
        )


async def handle_profile_callback(query, context):
    """Show the strengthened classic-bot profile surface."""
    user_id = query.from_user.id
    snapshot = get_profile_snapshot(user_id)
    await query.edit_message_text(
        render_profile_text(snapshot),
        parse_mode=ParseMode.HTML,
        reply_markup=get_profile_keyboard(),
        disable_web_page_preview=True,
    )

async def handle_history_callback(query, context):
    user_id = query.from_user.id
    snapshot = get_duel_history(user_id, limit=10)
    await query.edit_message_text(
        render_duel_history_text(snapshot),
        parse_mode=ParseMode.HTML,
        reply_markup=get_duel_history_keyboard(bool(snapshot.get('items'))),
        disable_web_page_preview=True,
    )


async def handle_transaction_history(query, context):
    user_id = query.from_user.id
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT amount, status, created_at FROM invoices
        WHERE user_id = ?
        ORDER BY created_at DESC LIMIT 5
        """,
        (user_id,),
    )
    deposits = cursor.fetchall()
    cursor.execute(
        """
        SELECT amount, status, created_at FROM withdrawals
        WHERE user_id = ?
        ORDER BY created_at DESC LIMIT 5
        """,
        (user_id,),
    )
    withdrawals = cursor.fetchall()
    conn.close()

    lines = ["💸 <b>Balance activity</b>", "", "<b>Recent deposits</b>"]
    if deposits:
        for row in deposits:
            lines.append(f"• {_format_timestamp(row['created_at'])} — +{float(row['amount']):.2f} TON — {str(row['status']).replace('_', ' ').title()}")
    else:
        lines.append("• No deposits yet.")

    lines.extend(["", "<b>Recent withdrawals</b>"])
    if withdrawals:
        for row in withdrawals:
            lines.append(f"• {_format_timestamp(row['created_at'])} — -{float(row['amount']):.2f} TON — {str(row['status']).replace('_', ' ').title()}")
    else:
        lines.append("• No withdrawals yet.")

    await query.edit_message_text("\n".join(lines), parse_mode=ParseMode.HTML, reply_markup=get_balance_keyboard())

# === Периодический опрос инвойсов ===

async def check_pending_invoices():
    """Legacy fallback invoice poller for local/dev mode only."""
    while True:
        await asyncio.sleep(30)
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT invoice_id, user_id, amount, status FROM invoices WHERE status = 'active'")
        rows = cursor.fetchall()
        conn.close()
        for row in rows:
            invoice_id = row['invoice_id'] if hasattr(row, 'keys') else row[0]
            user_id = row['user_id'] if hasattr(row, 'keys') else row[1]
            amount = row['amount'] if hasattr(row, 'keys') else row[2]
            invoice_status = await get_invoice_status(invoice_id)
            update_invoice_status(invoice_id, invoice_status)
            if invoice_status == 'paid':
                result = apply_paid_invoice(invoice_id, source='poller', provider_event_id=f'poller:{invoice_id}')
                if result.get('ok') and result.get('credited'):
                    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
                    bot = Bot(token=bot_token)
                    try:
                        await bot.send_message(
                            chat_id=user_id,
                            text=f"✅ Your balance was topped up by {amount} TON!\nYou can now open Balance or start a real duel."
                        )
                    except Exception as e:
                        print(f'Ошибка отправки уведомления: {e}')

async def menu_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_states.pop(user.id, None)
    create_or_update_user(user.id, user.username, user.first_name)
    await update.message.reply_text(render_main_menu_text(), reply_markup=_main_menu_markup(user.id), parse_mode=ParseMode.HTML)


async def balance_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_states.pop(user.id, None)
    create_or_update_user(user.id, user.username, user.first_name)
    await update.message.reply_text(render_balance_screen_text(user.id), reply_markup=get_balance_keyboard(), parse_mode=ParseMode.HTML)


async def profile_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_states.pop(user.id, None)
    create_or_update_user(user.id, user.username, user.first_name)
    snapshot = get_profile_snapshot(user.id)
    await update.message.reply_text(
        render_profile_text(snapshot),
        reply_markup=get_profile_keyboard(),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


async def handle_inline_query(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.inline_query
    if not query or not update.effective_user:
        return

    create_or_update_user(update.effective_user.id, update.effective_user.username, update.effective_user.first_name)
    snapshot = get_referral_snapshot(update.effective_user.id)
    invite_link = str(snapshot.get("inviteLink") or "").strip()
    if not invite_link:
        await query.answer([], cache_time=0, is_personal=True)
        return

    result = InlineQueryResultArticle(
        id=f"invite_{update.effective_user.id}",
        title="Invite to Roll Duel",
        description="Share your personal Roll Duel invite into any chat",
        input_message_content=InputTextMessageContent(
            message_text=render_inline_invite_share_text(snapshot),
            parse_mode=ParseMode.HTML,
            disable_web_page_preview=True,
        ),
        reply_markup=get_invite_card_keyboard(invite_link),
    )
    await query.answer([result], cache_time=0, is_personal=True)


async def history_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_states.pop(user.id, None)
    create_or_update_user(user.id, user.username, user.first_name)
    snapshot = get_duel_history(user.id, limit=10)
    await update.message.reply_text(
        render_duel_history_text(snapshot),
        reply_markup=get_duel_history_keyboard(bool(snapshot.get('items'))),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


async def invite_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_states.pop(user.id, None)
    create_or_update_user(user.id, user.username, user.first_name)
    snapshot = get_referral_snapshot(user.id)
    await update.message.reply_text(
        render_referral_text(snapshot),
        reply_markup=get_referral_keyboard(snapshot.get('shareInvite')),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_states.pop(user.id, None)
    create_or_update_user(user.id, user.username, user.first_name)
    await update.message.reply_text(render_help_text(), reply_markup=get_help_keyboard(), parse_mode=ParseMode.HTML)


async def support_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_states.pop(user.id, None)
    create_or_update_user(user.id, user.username, user.first_name)
    await update.message.reply_text(render_support_text(), reply_markup=get_support_keyboard(bool(SUPPORT_TON_ADDRESS)), parse_mode=ParseMode.HTML)


@require_admin_command
async def panel_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    user_id = user.id if user else 0
    await update.message.reply_text(
        _render_tg_admin_overview_text(user_id),
        reply_markup=get_admin_panel_keyboard(_admin_web_url()),
        parse_mode=ParseMode.HTML,
        disable_web_page_preview=True,
    )

async def notify_cancelled_waiting_games(context, user_ids):
    for uid in user_ids:
        try:
            await context.bot.send_message(
                chat_id=uid,
                text="⏹️ Your waiting duel was cancelled by an operator. The stake was released back to balance."
            )
        except Exception:
            pass
