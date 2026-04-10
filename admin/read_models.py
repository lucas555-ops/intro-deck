from __future__ import annotations

import os

import database
from infra.admin_auth import is_admin_web_enabled
from services import broadcasts as broadcast_service, settings


def _fetchall_dict(query: str, params=()):
    conn = database.get_connection()
    try:
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def dashboard_snapshot() -> dict:
    conn = database.get_connection()
    try:
        def scalar(query, params=()):
            row = conn.execute(query, params).fetchone()
            return row[0] if row else 0

        return {
            "open_duels": scalar("SELECT COUNT(*) FROM games WHERE status = 'waiting'"),
            "active_duels": scalar("SELECT COUNT(*) FROM games WHERE status = 'active'"),
            "settling_duels": scalar("SELECT COUNT(*) FROM games WHERE status = 'settling'"),
            "stuck_duels": scalar("SELECT COUNT(*) FROM games WHERE status IN ('waiting','active','settling') AND deadline_at IS NOT NULL AND deadline_at <= CURRENT_TIMESTAMP"),
            "pending_deposits": scalar("SELECT COUNT(*) FROM invoices WHERE status = 'active'"),
            "unprocessed_payment_events": scalar("SELECT COUNT(*) FROM payment_events WHERE processed = 0"),
            "requested_withdrawals": scalar("SELECT COUNT(*) FROM withdrawal_requests WHERE status = 'requested'"),
            "processing_withdrawals": scalar("SELECT COUNT(*) FROM withdrawal_requests WHERE status IN ('processing','reserved')"),
            "failed_withdrawals": scalar("SELECT COUNT(*) FROM withdrawal_requests WHERE status IN ('failed','rejected')"),
            "manual_review_users": scalar("SELECT COUNT(DISTINCT user_id) FROM user_risk_flags WHERE status = 'active' AND flag_type = 'manual_review'"),
            "frozen_users": scalar("SELECT COUNT(*) FROM users WHERE is_frozen = 1"),
            "total_available_balances": float(scalar("SELECT COALESCE(SUM(balance), 0) FROM users WHERE user_id != 0") or 0),
            "reserved_liabilities": float(scalar("SELECT COALESCE(SUM(amount), 0) FROM balance_reservations WHERE status = 'active'") or 0),
            "inflight_withdrawals": float(scalar("SELECT COALESCE(SUM(amount), 0) FROM withdrawal_requests WHERE status IN ('requested','reserved','processing')") or 0),
            "miniapp_smoke_reports_24h": scalar("SELECT COUNT(*) FROM miniapp_client_smoke_reports WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day'" if database.using_postgres() else "SELECT COUNT(*) FROM miniapp_client_smoke_reports WHERE created_at >= datetime('now', '-1 day')"),
            "miniapp_smoke_failures_24h": scalar("SELECT COUNT(*) FROM miniapp_client_smoke_reports WHERE outcome IN ('fail','partial') AND created_at >= CURRENT_TIMESTAMP - INTERVAL '1 day'" if database.using_postgres() else "SELECT COUNT(*) FROM miniapp_client_smoke_reports WHERE outcome IN ('fail','partial') AND created_at >= datetime('now', '-1 day')"),
        }
    finally:
        conn.close()


def liabilities_snapshot() -> dict:
    dash = dashboard_snapshot()
    conn = database.get_connection()
    try:
        def scalar(query, params=()):
            row = conn.execute(query, params).fetchone()
            return row[0] if row else 0

        treasury_row = conn.execute(
            "SELECT balance, profit FROM users WHERE user_id = 0"
        ).fetchone()
        treasury_balance = float((treasury_row["balance"] if treasury_row else 0) or 0)
        treasury_profit = float((treasury_row["profit"] if treasury_row else 0) or 0)
        pending_deposit_amount = float(scalar("SELECT COALESCE(SUM(amount), 0) FROM invoices WHERE status = 'active'") or 0)
        failed_withdrawal_amount = float(scalar("SELECT COALESCE(SUM(amount), 0) FROM withdrawal_requests WHERE status IN ('failed','rejected')") or 0)
        total_customer_liability = float(dash["total_available_balances"] or 0) + float(dash["reserved_liabilities"] or 0)
        hot_outflow_now = float(dash["inflight_withdrawals"] or 0)
        operator_buffer = treasury_balance - hot_outflow_now
        net_exposure = total_customer_liability + hot_outflow_now - treasury_balance

        alerts: list[dict[str, object]] = []
        if hot_outflow_now > treasury_balance:
            alerts.append({
                "level": "bad",
                "title": "Treasury below inflight withdrawals",
                "detail": f"Inflight withdrawals are {hot_outflow_now:.2f} TON while treasury balance is {treasury_balance:.2f} TON.",
                "href": "/admin/withdrawals",
                "cta": "Open Withdrawals",
            })
        if int(dash.get("failed_withdrawals") or 0) > 0:
            alerts.append({
                "level": "warn",
                "title": "Failed withdrawals need operator triage",
                "detail": f"{int(dash.get('failed_withdrawals') or 0)} withdrawals are in failed/rejected state.",
                "href": "/admin/failed?tab=withdrawals",
                "cta": "Open Failed Items",
            })
        if int(dash.get("unprocessed_payment_events") or 0) > 0:
            alerts.append({
                "level": "warn",
                "title": "Payment events are waiting for processing",
                "detail": f"{int(dash.get('unprocessed_payment_events') or 0)} payment events remain unprocessed.",
                "href": "/admin/failed?tab=payments",
                "cta": "Open Failed Payments",
            })
        if int(dash.get("stuck_duels") or 0) > 0:
            alerts.append({
                "level": "warn",
                "title": "Stuck duels are above zero",
                "detail": f"{int(dash.get('stuck_duels') or 0)} duels have passed deadline and need runtime review.",
                "href": "/admin/failed?tab=duels",
                "cta": "Open Stuck Duels",
            })
        if int(dash.get("manual_review_users") or 0) > 0:
            alerts.append({
                "level": "neutral",
                "title": "Manual review queue is not empty",
                "detail": f"{int(dash.get('manual_review_users') or 0)} users are waiting in manual review.",
                "href": "/admin/risk?filter=manual_review",
                "cta": "Open Risk Queue",
            })
        if int(dash.get("pending_deposits") or 0) > 0:
            alerts.append({
                "level": "neutral",
                "title": "Deposits are still inflight",
                "detail": f"{int(dash.get('pending_deposits') or 0)} deposits remain active for {pending_deposit_amount:.2f} TON.",
                "href": "/admin/failed?tab=payments",
                "cta": "Open Deposits / Payments",
            })

        return {
            **dash,
            "treasury_balance": round(treasury_balance, 8),
            "treasury_profit": round(treasury_profit, 8),
            "pending_deposit_amount": round(pending_deposit_amount, 8),
            "failed_withdrawal_amount": round(failed_withdrawal_amount, 8),
            "total_customer_liability": round(total_customer_liability, 8),
            "hot_outflow_now": round(hot_outflow_now, 8),
            "operator_buffer": round(operator_buffer, 8),
            "net_exposure": round(net_exposure, 8),
            "alerts": alerts,
        }
    finally:
        conn.close()


def list_withdrawals(status: str | None = None, review_status: str | None = None, *, limit: int = 200, offset: int = 0) -> list[dict]:
    clauses = []
    params = []
    if status:
        clauses.append("wr.status = ?")
        params.append(status)
    if review_status:
        clauses.append("COALESCE(wr.review_status, 'not_required') = ?")
        params.append(review_status)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return _fetchall_dict(
        f"""
        SELECT wr.withdrawal_id, wr.user_id, u.username, u.first_name, wr.amount, wr.status,
               COALESCE(wr.review_status, 'not_required') AS review_status,
               wr.created_at, wr.updated_at, wr.provider_transfer_id, wr.last_operator_note,
               u.risk_level, u.is_frozen
        FROM withdrawal_requests wr
        JOIN users u ON u.user_id = wr.user_id
        {where}
        ORDER BY wr.created_at DESC
        LIMIT ? OFFSET ?
        """,
        tuple(params) + (max(1, min(limit, 200)), max(offset, 0)),
    )




def runtime_snapshot() -> dict:
    warnings: list[str] = []
    fallback_mode = False
    try:
        snap, snapshot_warnings, settings_sanity = settings.snapshot_with_diagnostics()
        warnings.extend(snapshot_warnings)
    except Exception as exc:
        fallback_mode = True
        warnings.append(f"Settings snapshot failed; defaults are shown instead ({exc.__class__.__name__}).")
        snap = {
            key: {"value": value, "updated_by": "system", "updated_at": None, "note": "runtime_fallback_default"}
            for key, value in settings.DEFAULT_SETTINGS.items()
        }
        settings_sanity = {"rows": 0, "native_rows": 0, "malformed_rows": 0}
    return {
        "database_backend": database.DATABASE_BACKEND,
        "admin_web_enabled": is_admin_web_enabled(),
        "miniapp_runtime_enabled": os.getenv("MINIAPP_RUNTIME_ENABLED", "0").strip() == "1",
        "telegram_webhook_path": os.getenv("TELEGRAM_WEBHOOK_PATH", "/webhook/telegram"),
        "cryptopay_webhook_path": os.getenv("CRYPTOPAY_WEBHOOK_PATH", "/webhook/cryptopay"),
        "kill_switches": {
            "duels_enabled": bool(snap.get("duels_enabled", {}).get("value", True)),
            "deposits_enabled": bool(snap.get("deposits_enabled", {}).get("value", True)),
            "withdrawals_enabled": bool(snap.get("withdrawals_enabled", {}).get("value", True)),
            "maintenance_mode": bool(snap.get("maintenance_mode", {}).get("value", False)),
        },
        "limits": {
            "min_stake_ton": snap.get("min_stake_ton", {}).get("value"),
            "max_stake_ton": snap.get("max_stake_ton", {}).get("value"),
            "withdrawal_min_ton": snap.get("withdrawal_min_ton", {}).get("value"),
            "withdrawal_max_ton": snap.get("withdrawal_max_ton", {}).get("value"),
            "manual_review_threshold_ton": snap.get("manual_review_threshold_ton", {}).get("value"),
            "platform_fee_bps": snap.get("platform_fee_bps", {}).get("value"),
        },
        "settings_snapshot": snap,
        "warnings": warnings,
        "settings_sanity": {**settings_sanity, "fallback_mode": fallback_mode},
    }




def comms_snapshot() -> dict:
    conn = database.get_connection()
    try:
        active_broadcast = conn.execute(
            "SELECT broadcast_id, audience, status, total_count, sent_count, failed_count, created_at FROM broadcasts WHERE status = 'running' ORDER BY started_at DESC, created_at DESC LIMIT 1"
        ).fetchone()
        current_notice = conn.execute(
            "SELECT notice_id, status, target, severity, version, published_at, expires_at FROM system_notices WHERE status = 'active' ORDER BY published_at DESC, created_at DESC LIMIT 1"
        ).fetchone()
        recent_broadcasts = conn.execute(
            "SELECT broadcast_id, audience, status, total_count, sent_count, failed_count, created_at FROM broadcasts ORDER BY created_at DESC LIMIT 5"
        ).fetchall()
        recent_notices = conn.execute(
            "SELECT notice_id, status, target, severity, version, published_at, expires_at, created_at FROM system_notices ORDER BY COALESCE(published_at, created_at) DESC LIMIT 5"
        ).fetchall()
        active_broadcast_item = dict(active_broadcast) if active_broadcast else None
        if active_broadcast_item:
            active_broadcast_item.update(broadcast_service.get_broadcast_delivery_summary(str(active_broadcast_item.get("broadcast_id")), conn=conn))
        recent_broadcast_items = []
        for row in recent_broadcasts:
            item = dict(row)
            item.update(broadcast_service.get_broadcast_delivery_summary(str(item.get("broadcast_id")), conn=conn))
            recent_broadcast_items.append(item)
        return {
            "active_broadcast": active_broadcast_item,
            "current_notice": dict(current_notice) if current_notice else None,
            "recent_broadcasts": recent_broadcast_items,
            "recent_notices": [dict(row) for row in recent_notices],
        }
    finally:
        conn.close()

def get_withdrawal_card(withdrawal_id: str) -> dict | None:
    conn = database.get_connection()
    try:
        row = conn.execute(
            """
            SELECT wr.*, u.username, u.first_name, u.balance, u.is_frozen, u.risk_level
            FROM withdrawal_requests wr
            JOIN users u ON u.user_id = wr.user_id
            WHERE wr.withdrawal_id = ?
            """,
            (withdrawal_id,),
        ).fetchone()
        if not row:
            return None
        item = dict(row)
        item["risk_flags"] = [dict(r) for r in conn.execute(
            "SELECT * FROM user_risk_flags WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC",
            (item["user_id"],),
        ).fetchall()]
        item["audit"] = [dict(r) for r in conn.execute(
            "SELECT * FROM operator_actions WHERE target_type = 'withdrawal' AND target_id = ? ORDER BY created_at DESC LIMIT 50",
            (withdrawal_id,),
        ).fetchall()]
        return item
    finally:
        conn.close()


def list_users(
    filter_name: str | None = None,
    search: str | None = None,
    *,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    filter_map = {
        "frozen": "u.is_frozen = 1",
        "manual_review": "EXISTS (SELECT 1 FROM user_risk_flags rf WHERE rf.user_id = u.user_id AND rf.flag_type = 'manual_review' AND rf.status = 'active')",
        "withdrawal_blocked": "EXISTS (SELECT 1 FROM user_risk_flags rf WHERE rf.user_id = u.user_id AND rf.flag_type = 'withdrawal_blocked' AND rf.status = 'active')",
        "duel_blocked": "EXISTS (SELECT 1 FROM user_risk_flags rf WHERE rf.user_id = u.user_id AND rf.flag_type = 'duel_blocked' AND rf.status = 'active')",
        "deposit_blocked": "EXISTS (SELECT 1 FROM user_risk_flags rf WHERE rf.user_id = u.user_id AND rf.flag_type = 'deposit_blocked' AND rf.status = 'active')",
        "high_balance": "u.balance >= 10",
    }
    clauses = ["u.user_id != 0"]
    params: list[object] = []
    if filter_name in filter_map:
        clauses.append(filter_map[filter_name])
    if search:
        term = search.strip()
        if term:
            if term.isdigit():
                clauses.append("(u.user_id = ? OR COALESCE(u.username, '') LIKE ? OR COALESCE(u.first_name, '') LIKE ?)")
                params.extend([int(term), f"%{term}%", f"%{term}%"])
            else:
                clauses.append("(COALESCE(u.username, '') LIKE ? OR COALESCE(u.first_name, '') LIKE ? OR CAST(u.user_id AS TEXT) LIKE ?)")
                params.extend([f"%{term}%", f"%{term}%", f"%{term}%"])
    where = f"WHERE {' AND '.join(clauses)}"
    return _fetchall_dict(
        f"""
        SELECT u.user_id, u.username, u.first_name, u.balance,
               COALESCE((SELECT SUM(amount) FROM balance_reservations br WHERE br.user_id = u.user_id AND br.status = 'active'),0) AS reserved_amount,
               COALESCE((SELECT COUNT(*) FROM user_risk_flags rf WHERE rf.user_id = u.user_id AND rf.status = 'active'),0) AS active_flags_count,
               u.games_played, u.games_won, u.risk_level, u.is_frozen,
               COALESCE(u.updated_at, u.created_at) AS last_seen_at
        FROM users u
        {where}
        ORDER BY COALESCE(u.updated_at, u.created_at) DESC, u.created_at DESC
        LIMIT ? OFFSET ?
        """,
        tuple(params) + (max(1, min(limit, 200)), max(offset, 0)),
    )


def get_user_card(user_id: int) -> dict | None:
    conn = database.get_connection()
    try:
        user = conn.execute(
            "SELECT * FROM users WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if not user:
            return None
        card = dict(user)
        card["reserved_amount"] = float(conn.execute(
            "SELECT COALESCE(SUM(amount),0) FROM balance_reservations WHERE user_id = ? AND status = 'active'",
            (user_id,),
        ).fetchone()[0] or 0)
        card["total_deposits"] = float(conn.execute(
            "SELECT COALESCE(SUM(amount),0) FROM ledger_entries WHERE user_id = ? AND entry_type = 'deposit_credit'",
            (user_id,),
        ).fetchone()[0] or 0)
        card["total_withdrawals"] = float(conn.execute(
            "SELECT COALESCE(SUM(amount),0) FROM withdrawal_requests WHERE user_id = ? AND status = 'sent'",
            (user_id,),
        ).fetchone()[0] or 0)
        card["risk_flags"] = [dict(r) for r in conn.execute(
            "SELECT * FROM user_risk_flags WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
            (user_id,),
        ).fetchall()]
        card["active_risk_flags"] = [item for item in card["risk_flags"] if str(item.get("status") or "") == "active"]
        card["recent_withdrawals"] = [dict(r) for r in conn.execute(
            "SELECT * FROM withdrawal_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
            (user_id,),
        ).fetchall()]
        card["recent_deposits"] = [dict(r) for r in conn.execute(
            "SELECT * FROM invoices WHERE user_id = ? ORDER BY created_at DESC LIMIT 20",
            (user_id,),
        ).fetchall()]
        card["recent_duels"] = [dict(r) for r in conn.execute(
            "SELECT * FROM games WHERE player1_id = ? OR player2_id = ? ORDER BY created_at DESC LIMIT 20",
            (user_id, user_id),
        ).fetchall()]
        card["recent_actions"] = [dict(r) for r in conn.execute(
            "SELECT * FROM operator_actions WHERE target_type = 'user' AND target_id = ? ORDER BY created_at DESC LIMIT 50",
            (str(user_id),),
        ).fetchall()]
        return card
    finally:
        conn.close()


def audit_log(limit: int = 200) -> list[dict]:
    return _fetchall_dict("SELECT * FROM operator_actions ORDER BY created_at DESC LIMIT ?", (limit,))


def risk_queue_snapshot() -> dict:
    conn = database.get_connection()
    try:
        def scalar(query: str, params=()):
            row = conn.execute(query, params).fetchone()
            return row[0] if row else 0

        return {
            "active_flags": scalar("SELECT COUNT(*) FROM user_risk_flags WHERE status = 'active'"),
            "manual_review": scalar("SELECT COUNT(*) FROM user_risk_flags WHERE status = 'active' AND flag_type = 'manual_review'"),
            "withdrawal_blocked": scalar("SELECT COUNT(*) FROM user_risk_flags WHERE status = 'active' AND flag_type = 'withdrawal_blocked'"),
            "duel_blocked": scalar("SELECT COUNT(*) FROM user_risk_flags WHERE status = 'active' AND flag_type = 'duel_blocked'"),
            "deposit_blocked": scalar("SELECT COUNT(*) FROM user_risk_flags WHERE status = 'active' AND flag_type = 'deposit_blocked'"),
            "frozen_users": scalar("SELECT COUNT(*) FROM users WHERE is_frozen = 1"),
        }
    finally:
        conn.close()


def list_risk_queue(filter_name: str | None = None, *, limit: int = 100, offset: int = 0) -> list[dict]:
    filter_map = {
        "manual_review": "rf.flag_type = 'manual_review'",
        "withdrawal_blocked": "rf.flag_type = 'withdrawal_blocked'",
        "duel_blocked": "rf.flag_type = 'duel_blocked'",
        "deposit_blocked": "rf.flag_type = 'deposit_blocked'",
        "frozen": "u.is_frozen = 1",
        "high": "u.risk_level IN ('high', 'review')",
    }
    clauses = ["rf.status = 'active'"]
    if filter_name in filter_map:
        clauses.append(filter_map[filter_name])
    where = f"WHERE {' AND '.join(clauses)}"
    return _fetchall_dict(
        f"""
        SELECT rf.flag_id, rf.user_id, u.username, u.first_name, u.balance, u.risk_level, u.is_frozen,
               rf.flag_type, rf.status AS flag_status, rf.reason, rf.created_at, rf.created_by,
               COALESCE((SELECT COUNT(*) FROM user_risk_flags x WHERE x.user_id = rf.user_id AND x.status = 'active'), 0) AS active_flags_count
        FROM user_risk_flags rf
        JOIN users u ON u.user_id = rf.user_id
        {where}
        ORDER BY rf.created_at DESC
        LIMIT ? OFFSET ?
        """,
        (max(1, min(limit, 200)), max(offset, 0)),
    )


def failed_items_snapshot() -> dict:
    conn = database.get_connection()
    try:
        def scalar(query: str, params=()):
            row = conn.execute(query, params).fetchone()
            return row[0] if row else 0

        return {
            "failed_withdrawals": scalar("SELECT COUNT(*) FROM withdrawal_requests WHERE status IN ('failed','rejected')"),
            "unprocessed_payment_events": scalar("SELECT COUNT(*) FROM payment_events WHERE processed = 0"),
            "stuck_duels": scalar("SELECT COUNT(*) FROM games WHERE status IN ('waiting','active','settling') AND deadline_at IS NOT NULL AND deadline_at <= CURRENT_TIMESTAMP"),
            "failed_jobs": scalar("SELECT COUNT(*) FROM runtime_jobs WHERE last_error IS NOT NULL"),
        }
    finally:
        conn.close()


def list_failed_withdrawals(*, limit: int = 100, offset: int = 0) -> list[dict]:
    return _fetchall_dict(
        """
        SELECT wr.withdrawal_id, wr.user_id, u.username, u.first_name, wr.amount, wr.status,
               COALESCE(wr.review_status, 'not_required') AS review_status, wr.failure_class,
               wr.last_operator_note, wr.updated_at, wr.created_at
        FROM withdrawal_requests wr
        JOIN users u ON u.user_id = wr.user_id
        WHERE wr.status IN ('failed','rejected')
        ORDER BY wr.updated_at DESC, wr.created_at DESC
        LIMIT ? OFFSET ?
        """,
        (max(1, min(limit, 200)), max(offset, 0)),
    )


def list_unprocessed_payment_events(*, limit: int = 100, offset: int = 0) -> list[dict]:
    return _fetchall_dict(
        """
        SELECT event_id, provider, provider_event_type, provider_object_id, provider_status, user_id,
               amount, asset, signature_valid, processed, created_at
        FROM payment_events
        WHERE processed = 0
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        (max(1, min(limit, 200)), max(offset, 0)),
    )


def list_stuck_duels(*, limit: int = 100, offset: int = 0) -> list[dict]:
    return _fetchall_dict(
        """
        SELECT game_id, player1_id, player2_id, bet_amount, status, deadline_at, created_at, updated_at
        FROM games
        WHERE status IN ('waiting','active','settling')
          AND deadline_at IS NOT NULL
          AND deadline_at <= CURRENT_TIMESTAMP
        ORDER BY deadline_at ASC
        LIMIT ? OFFSET ?
        """,
        (max(1, min(limit, 200)), max(offset, 0)),
    )


def list_failed_runtime_jobs(*, limit: int = 100, offset: int = 0) -> list[dict]:
    return _fetchall_dict(
        """
        SELECT job_id, job_type, reference_type, reference_id, status, attempt_count, last_error,
               scheduled_for, locked_at, completed_at, created_at
        FROM runtime_jobs
        WHERE last_error IS NOT NULL
        ORDER BY scheduled_for DESC, created_at DESC
        LIMIT ? OFFSET ?
        """,
        (max(1, min(limit, 200)), max(offset, 0)),
    )

def failed_items() -> dict:
    conn = database.get_connection()
    try:
        return {
            "failed_withdrawals": [dict(r) for r in conn.execute("SELECT * FROM withdrawal_requests WHERE status IN ('failed','rejected') ORDER BY updated_at DESC LIMIT 100").fetchall()],
            "unprocessed_payment_events": [dict(r) for r in conn.execute("SELECT * FROM payment_events WHERE processed = 0 ORDER BY created_at DESC LIMIT 100").fetchall()],
            "stuck_duels": [dict(r) for r in conn.execute("SELECT * FROM games WHERE status IN ('waiting','active','settling') AND deadline_at IS NOT NULL AND deadline_at <= CURRENT_TIMESTAMP ORDER BY deadline_at ASC LIMIT 100").fetchall()],
            "failed_jobs": [dict(r) for r in conn.execute("SELECT * FROM runtime_jobs WHERE last_error IS NOT NULL ORDER BY scheduled_for DESC LIMIT 100").fetchall()],
        }
    finally:
        conn.close()


def list_miniapp_smoke_reports(limit: int = 100) -> list[dict]:
    return _fetchall_dict(
        """
        SELECT report_id, session_id, user_id, app_env, shell_version, platform,
               telegram_version, color_scheme, viewport_height, viewport_stable_height,
               passed_count, total_count, outcome, issues_json, created_at
        FROM miniapp_client_smoke_reports
        ORDER BY created_at DESC
        LIMIT ?
        """,
        (limit,),
    )



def get_miniapp_smoke_report(report_id: str) -> dict | None:
    conn = database.get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM miniapp_client_smoke_reports WHERE report_id = ? LIMIT 1",
            (report_id,),
        ).fetchone()
        if not row:
            return None
        item = dict(row)
        import json
        for src, dst in (("checks_json", "checks"), ("logs_json", "logs"), ("extra_json", "extra"), ("issues_json", "issues")):
            raw = item.get(src)
            try:
                item[dst] = json.loads(raw) if raw else []
            except Exception:
                item[dst] = []
        return item
    finally:
        conn.close()
