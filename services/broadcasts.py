from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Any

import database
from services.audit import log_operator_action

logger = logging.getLogger(__name__)

AUDIENCE_CHOICES: dict[str, str] = {
    "all_private_users": "All private users",
    "active_last_7d": "Active last 7d",
    "real_balance": "Users with real balance",
    "pending_withdrawals": "Users with pending withdrawals",
    "pending_deposits": "Users with pending deposits",
    "founder_test": "Founder/operator test cohort",
}

BROADCAST_STATUSES = {"draft", "running", "stopped", "completed", "failed"}
BROADCAST_DELIVERY_STATUSES = {"sent", "retry_pending", "failed"}
MAX_BROADCAST_TEXT_LEN = 3500
MAX_BROADCAST_RETRY_ATTEMPTS = max(1, min(int(os.getenv("ADMIN_BROADCAST_MAX_RETRIES", "3") or "3"), 7))


def _parse_admin_id_list(raw: str) -> list[int]:
    values: list[int] = []
    for chunk in str(raw or "").split(","):
        chunk = chunk.strip()
        if chunk.isdigit():
            values.append(int(chunk))
    return values


_ADMIN_IDS = sorted(
    {
        *(
            [int(os.getenv("ADMIN_CHAT_ID", "0").strip())]
            if os.getenv("ADMIN_CHAT_ID", "0").strip().isdigit()
            and int(os.getenv("ADMIN_CHAT_ID", "0").strip())
            else []
        ),
        *_parse_admin_id_list(os.getenv("TG_OPERATOR_IDS", "")),
        *_parse_admin_id_list(os.getenv("ADMIN_IDS", "")),
    }
)


def _normalize_audience(value: str | None) -> str:
    key = str(value or "founder_test").strip().lower()
    return key if key in AUDIENCE_CHOICES else "founder_test"


def _normalize_text(value: str | None) -> str:
    text = str(value or "").replace("\r\n", "\n").strip()
    return text[:MAX_BROADCAST_TEXT_LEN]


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _active_since_threshold(days: int) -> datetime:
    return _utc_now() - timedelta(days=days)


def _retry_backoff_seconds(next_attempt_number: int) -> int:
    ladder = [30, 120, 300, 900, 1800, 3600]
    index = max(0, min(int(next_attempt_number) - 1, len(ladder) - 1))
    return ladder[index]


def _coerce_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def _audience_filter_sql(audience: str) -> tuple[str, tuple[Any, ...]]:
    audience = _normalize_audience(audience)
    base = "u.user_id != 0 AND COALESCE(u.is_blocked, 0) = 0"
    params: list[Any] = []
    if audience == "active_last_7d":
        base += " AND u.last_seen_at IS NOT NULL AND u.last_seen_at >= ?"
        params.append(_active_since_threshold(7))
    elif audience == "real_balance":
        base += " AND COALESCE(u.balance, 0) > 0"
    elif audience == "pending_withdrawals":
        base += " AND EXISTS (SELECT 1 FROM withdrawal_requests wr WHERE wr.user_id = u.user_id AND wr.status IN ('requested','reserved','processing'))"
    elif audience == "pending_deposits":
        base += " AND EXISTS (SELECT 1 FROM invoices i WHERE i.user_id = u.user_id AND i.status = 'active')"
    elif audience == "founder_test":
        if _ADMIN_IDS:
            placeholders = ", ".join(["?"] * len(_ADMIN_IDS))
            base += f" AND u.user_id IN ({placeholders})"
            params.extend(_ADMIN_IDS)
        else:
            base += " AND 1 = 0"
    return base, tuple(params)


def _count_recipients(conn, audience: str) -> int:
    where_sql, params = _audience_filter_sql(audience)
    row = conn.execute(f"SELECT COUNT(*) AS total FROM users u WHERE {where_sql}", params).fetchone()
    return int((row[0] if row else 0) or 0)


def _message_preview(text: str) -> str:
    normalized = _normalize_text(text)
    if len(normalized) <= 260:
        return normalized
    return normalized[:257] + "..."


def _delivery_progress_in_tx(conn, broadcast_id: str) -> dict[str, int]:
    rows = conn.execute(
        """
        SELECT status, COUNT(*) AS total
        FROM broadcast_deliveries
        WHERE broadcast_id = ?
        GROUP BY status
        """,
        (broadcast_id,),
    ).fetchall()
    counters = {"sent": 0, "retry_pending": 0, "failed": 0}
    for row in rows:
        status = str((row["status"] if hasattr(row, "keys") else row[0]) or "").strip().lower()
        counters[status] = _coerce_int(row["total"] if hasattr(row, "keys") else row[1])
    counters["attempted"] = counters["sent"] + counters["retry_pending"] + counters["failed"]
    return counters


def _broadcast_summary_in_tx(conn, broadcast_id: str) -> dict[str, int]:
    counters = _delivery_progress_in_tx(conn, broadcast_id)
    total_row = conn.execute(
        "SELECT total_count FROM broadcasts WHERE broadcast_id = ?",
        (broadcast_id,),
    ).fetchone()
    total_count = _coerce_int((total_row["total_count"] if hasattr(total_row, "keys") else total_row[0]) if total_row else 0)
    counters["total_count"] = total_count
    counters["remaining"] = max(total_count - counters["sent"] - counters["failed"], 0)
    return counters


def _refresh_broadcast_counters_in_tx(conn, broadcast_id: str) -> dict[str, int]:
    counters = _broadcast_summary_in_tx(conn, broadcast_id)
    conn.execute(
        """
        UPDATE broadcasts
        SET sent_count = ?,
            failed_count = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE broadcast_id = ?
        """,
        (counters["sent"], counters["failed"], broadcast_id),
    )
    return counters


def get_broadcast(broadcast_id: str) -> dict[str, Any] | None:
    conn = database.get_connection()
    try:
        row = conn.execute("SELECT * FROM broadcasts WHERE broadcast_id = ?", (broadcast_id,)).fetchone()
        if not row:
            return None
        item = dict(row)
        item.update(get_broadcast_delivery_summary(broadcast_id, conn=conn))
        return item
    finally:
        conn.close()


def list_recent_broadcasts(limit: int = 5) -> list[dict[str, Any]]:
    conn = database.get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT ?",
            (max(1, min(limit, 20)),),
        ).fetchall()
        items: list[dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            item.update(get_broadcast_delivery_summary(str(item.get("broadcast_id")), conn=conn))
            items.append(item)
        return items
    finally:
        conn.close()


def get_active_broadcast() -> dict[str, Any] | None:
    conn = database.get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM broadcasts WHERE status = 'running' ORDER BY started_at DESC, created_at DESC LIMIT 1"
        ).fetchone()
        if not row:
            return None
        item = dict(row)
        item.update(get_broadcast_delivery_summary(str(item.get("broadcast_id")), conn=conn))
        return item
    finally:
        conn.close()


def get_broadcast_delivery_summary(broadcast_id: str, *, conn=None) -> dict[str, int]:
    owns_conn = conn is None
    conn = conn or database.get_connection()
    try:
        return _broadcast_summary_in_tx(conn, broadcast_id)
    finally:
        if owns_conn:
            conn.close()


def create_broadcast_draft(*, operator_id: str, audience: str = "founder_test") -> dict[str, Any]:
    audience = _normalize_audience(audience)
    broadcast_id = str(uuid.uuid4())
    with database.transaction() as conn:
        conn.execute(
            """
            INSERT INTO broadcasts (
                broadcast_id, created_by_operator_id, audience, status, message_text,
                total_count, sent_count, failed_count
            ) VALUES (?, ?, ?, 'draft', '', 0, 0, 0)
            """,
            (broadcast_id, operator_id, audience),
        )
        log_operator_action(
            conn,
            operator_id=operator_id,
            action_type="broadcast_create_draft",
            target_type="broadcast",
            target_id=broadcast_id,
            reason="telegram_admin",
            payload={"audience": audience},
        )
    return get_broadcast(broadcast_id) or {"broadcast_id": broadcast_id, "audience": audience, "status": "draft"}


def set_broadcast_text(broadcast_id: str, *, text: str, operator_id: str) -> dict[str, Any]:
    clean_text = _normalize_text(text)
    if not clean_text:
        return {"ok": False, "error": "broadcast_text_required"}
    with database.transaction() as conn:
        row = conn.execute("SELECT status FROM broadcasts WHERE broadcast_id = ?", (broadcast_id,)).fetchone()
        if not row:
            return {"ok": False, "error": "broadcast_not_found"}
        if str(row[0]).lower() != "draft":
            return {"ok": False, "error": "broadcast_not_editable"}
        conn.execute(
            "UPDATE broadcasts SET message_text = ?, updated_at = CURRENT_TIMESTAMP WHERE broadcast_id = ?",
            (clean_text, broadcast_id),
        )
        log_operator_action(
            conn,
            operator_id=operator_id,
            action_type="broadcast_set_text",
            target_type="broadcast",
            target_id=broadcast_id,
            reason="telegram_admin",
            payload={"length": len(clean_text)},
        )
    return {"ok": True, "broadcast": get_broadcast(broadcast_id)}


def set_broadcast_audience(broadcast_id: str, *, audience: str, operator_id: str) -> dict[str, Any]:
    audience = _normalize_audience(audience)
    with database.transaction() as conn:
        row = conn.execute("SELECT status FROM broadcasts WHERE broadcast_id = ?", (broadcast_id,)).fetchone()
        if not row:
            return {"ok": False, "error": "broadcast_not_found"}
        if str(row[0]).lower() != "draft":
            return {"ok": False, "error": "broadcast_not_editable"}
        conn.execute(
            "UPDATE broadcasts SET audience = ?, updated_at = CURRENT_TIMESTAMP WHERE broadcast_id = ?",
            (audience, broadcast_id),
        )
        log_operator_action(
            conn,
            operator_id=operator_id,
            action_type="broadcast_set_audience",
            target_type="broadcast",
            target_id=broadcast_id,
            reason="telegram_admin",
            payload={"audience": audience},
        )
    return {"ok": True, "broadcast": get_broadcast(broadcast_id)}


def launch_broadcast(broadcast_id: str, *, operator_id: str) -> dict[str, Any]:
    with database.transaction() as conn:
        row = conn.execute("SELECT * FROM broadcasts WHERE broadcast_id = ?", (broadcast_id,)).fetchone()
        if not row:
            return {"ok": False, "error": "broadcast_not_found"}
        row_dict = dict(row)
        if str(row_dict.get("status") or "").lower() != "draft":
            return {"ok": False, "error": "broadcast_not_launchable"}
        message_text = _normalize_text(row_dict.get("message_text"))
        if not message_text:
            return {"ok": False, "error": "broadcast_text_required"}
        audience = _normalize_audience(row_dict.get("audience"))
        total_count = _count_recipients(conn, audience)
        status = "running" if total_count > 0 else "completed"
        conn.execute(
            """
            UPDATE broadcasts
            SET status = ?, total_count = ?, started_at = CURRENT_TIMESTAMP,
                completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
                stopped_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE broadcast_id = ?
            """,
            (status, total_count, status, broadcast_id),
        )
        log_operator_action(
            conn,
            operator_id=operator_id,
            action_type="broadcast_launch",
            target_type="broadcast",
            target_id=broadcast_id,
            reason="telegram_admin",
            payload={"audience": audience, "estimatedRecipients": total_count, "status": status},
        )
    return {"ok": True, "broadcast": get_broadcast(broadcast_id), "estimated_recipients": total_count}


def stop_broadcast(broadcast_id: str, *, operator_id: str) -> dict[str, Any]:
    with database.transaction() as conn:
        row = conn.execute("SELECT * FROM broadcasts WHERE broadcast_id = ?", (broadcast_id,)).fetchone()
        if not row:
            return {"ok": False, "error": "broadcast_not_found"}
        current_status = str(row["status"] if hasattr(row, "keys") else row[3]).lower()
        if current_status not in {"running", "draft"}:
            return {"ok": False, "error": "broadcast_not_stoppable"}
        conn.execute(
            "UPDATE broadcasts SET status = 'stopped', stopped_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE broadcast_id = ?",
            (broadcast_id,),
        )
        log_operator_action(
            conn,
            operator_id=operator_id,
            action_type="broadcast_stop",
            target_type="broadcast",
            target_id=broadcast_id,
            reason="telegram_admin",
            payload={"previousStatus": current_status},
        )
    return {"ok": True, "broadcast": get_broadcast(broadcast_id)}


def retry_failed_deliveries_now(broadcast_id: str, *, operator_id: str, reason: str | None = None) -> dict[str, Any]:
    now = _utc_now()
    with database.transaction() as conn:
        row = conn.execute("SELECT * FROM broadcasts WHERE broadcast_id = ?", (broadcast_id,)).fetchone()
        if not row:
            return {"ok": False, "error": "broadcast_not_found"}
        broadcast = dict(row)
        if str(broadcast.get("status") or "").lower() == "draft":
            return {"ok": False, "error": "broadcast_not_retryable"}
        delivery_snapshot = _delivery_progress_in_tx(conn, broadcast_id)
        retryable_count = delivery_snapshot["retry_pending"] + delivery_snapshot["failed"]
        conn.execute(
            """
            UPDATE broadcast_deliveries
            SET status = 'retry_pending',
                next_retry_at = ?,
                error_text = CASE WHEN status = 'failed' THEN error_text ELSE error_text END
            WHERE broadcast_id = ? AND status IN ('retry_pending', 'failed')
            """,
            (now, broadcast_id),
        )
        resume_status = "running"
        conn.execute(
            """
            UPDATE broadcasts
            SET status = ?,
                stopped_at = NULL,
                completed_at = NULL,
                started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
                updated_at = CURRENT_TIMESTAMP
            WHERE broadcast_id = ?
            """,
            (resume_status, broadcast_id),
        )
        log_operator_action(
            conn,
            operator_id=operator_id,
            action_type="broadcast_retry_failed_now",
            target_type="broadcast",
            target_id=broadcast_id,
            reason=reason or "telegram_admin_retry_failed",
            payload={
                "previous_status": broadcast.get("status"),
                "retryable_count": retryable_count,
            },
        )
    return {"ok": True, "broadcast": get_broadcast(broadcast_id), "retryable_count": retryable_count}


def count_recipients(audience: str) -> int:
    conn = database.get_connection()
    try:
        return _count_recipients(conn, audience)
    finally:
        conn.close()


def _select_pending_recipients(conn, broadcast_id: str, audience: str, *, limit: int) -> list[dict[str, Any]]:
    where_sql, params = _audience_filter_sql(audience)
    now = _utc_now()
    rows = conn.execute(
        f"""
        SELECT u.user_id,
               bd.status AS delivery_status,
               bd.attempt_count,
               bd.next_retry_at,
               bd.error_text
        FROM users u
        LEFT JOIN broadcast_deliveries bd
          ON bd.broadcast_id = ? AND bd.user_id = u.user_id
        WHERE {where_sql}
          AND (
                bd.user_id IS NULL
                OR (bd.status = 'retry_pending' AND (bd.next_retry_at IS NULL OR bd.next_retry_at <= ?))
              )
        ORDER BY COALESCE(bd.next_retry_at, CURRENT_TIMESTAMP) ASC, u.user_id ASC
        LIMIT ?
        """,
        (broadcast_id, *params, now, max(1, min(limit, 100))),
    ).fetchall()
    recipients: list[dict[str, Any]] = []
    for row in rows:
        recipients.append(
            {
                "user_id": int(row[0] if not hasattr(row, "keys") else row["user_id"]),
                "delivery_status": None if not hasattr(row, "keys") else row["delivery_status"],
                "attempt_count": _coerce_int(row["attempt_count"] if hasattr(row, "keys") else row[2]),
                "error_text": row["error_text"] if hasattr(row, "keys") else row[4],
            }
        )
    return recipients


def _has_future_retry_pending(conn, broadcast_id: str) -> bool:
    row = conn.execute(
        """
        SELECT 1
        FROM broadcast_deliveries
        WHERE broadcast_id = ?
          AND status = 'retry_pending'
          AND next_retry_at IS NOT NULL
          AND next_retry_at > ?
        LIMIT 1
        """,
        (broadcast_id, _utc_now()),
    ).fetchone()
    return bool(row)


def _finalize_broadcast_status(conn, broadcast_id: str) -> str:
    counters = _refresh_broadcast_counters_in_tx(conn, broadcast_id)
    if counters["retry_pending"] > 0:
        return "running"
    if counters["remaining"] > 0:
        return "running"
    final_status = "completed" if counters["sent"] > 0 or counters["failed"] == 0 else "failed"
    conn.execute(
        """
        UPDATE broadcasts
        SET status = ?,
            completed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE broadcast_id = ?
        """,
        (final_status, broadcast_id),
    )
    return final_status


async def process_active_broadcasts(bot: Any, *, batch_size: int = 25) -> dict[str, Any]:
    processed = 0
    sent = 0
    failed = 0
    retried = 0
    completed = 0
    conn = database.get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM broadcasts WHERE status = 'running' ORDER BY started_at ASC, created_at ASC LIMIT 3"
        ).fetchall()
    finally:
        conn.close()

    for row in rows:
        broadcast = dict(row)
        broadcast_id = str(broadcast.get("broadcast_id"))
        audience = _normalize_audience(broadcast.get("audience"))
        text = _normalize_text(broadcast.get("message_text"))
        if not text:
            with database.transaction() as conn_tx:
                conn_tx.execute(
                    "UPDATE broadcasts SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE broadcast_id = ?",
                    (broadcast_id,),
                )
            continue
        conn_batch = database.get_connection()
        try:
            recipients = _select_pending_recipients(conn_batch, broadcast_id, audience, limit=batch_size)
            has_future_retry = _has_future_retry_pending(conn_batch, broadcast_id)
        finally:
            conn_batch.close()
        if not recipients:
            if has_future_retry:
                continue
            with database.transaction() as conn_tx:
                final_status = _finalize_broadcast_status(conn_tx, broadcast_id)
                if final_status in {"completed", "failed"}:
                    completed += 1
            continue
        for target in recipients:
            target_user_id = int(target["user_id"])
            previous_attempts = _coerce_int(target.get("attempt_count"))
            current_attempt = previous_attempts + 1
            processed += 1
            status = "sent"
            error_text = None
            delivered_at = _utc_now()
            next_retry_at = None
            try:
                await bot.send_message(chat_id=target_user_id, text=text, disable_web_page_preview=True)
                sent += 1
            except Exception as exc:  # noqa: BLE001 - delivery should never crash the worker
                retryable = current_attempt < MAX_BROADCAST_RETRY_ATTEMPTS
                status = "retry_pending" if retryable else "failed"
                error_text = str(exc)[:400]
                delivered_at = None
                next_retry_at = _utc_now() + timedelta(seconds=_retry_backoff_seconds(current_attempt)) if retryable else None
                if retryable:
                    retried += 1
                else:
                    failed += 1
                logger.warning(
                    "Broadcast delivery failed | broadcast=%s user=%s attempt=%s/%s retryable=%s error=%s",
                    broadcast_id,
                    target_user_id,
                    current_attempt,
                    MAX_BROADCAST_RETRY_ATTEMPTS,
                    retryable,
                    exc,
                )
            with database.transaction() as conn_tx:
                conn_tx.execute(
                    """
                    INSERT INTO broadcast_deliveries (
                        broadcast_id, user_id, status, error_text,
                        attempt_count, last_attempt_at, next_retry_at, delivered_at
                    )
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
                    ON CONFLICT (broadcast_id, user_id) DO UPDATE SET
                        status = EXCLUDED.status,
                        error_text = EXCLUDED.error_text,
                        attempt_count = EXCLUDED.attempt_count,
                        last_attempt_at = CURRENT_TIMESTAMP,
                        next_retry_at = EXCLUDED.next_retry_at,
                        delivered_at = EXCLUDED.delivered_at,
                        sent_at = CASE WHEN EXCLUDED.delivered_at IS NOT NULL THEN CURRENT_TIMESTAMP ELSE broadcast_deliveries.sent_at END
                    """,
                    (broadcast_id, target_user_id, status, error_text, current_attempt, next_retry_at, delivered_at),
                )
                conn_tx.execute(
                    "UPDATE broadcasts SET last_sent_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE broadcast_id = ?",
                    (target_user_id, broadcast_id),
                )
                _refresh_broadcast_counters_in_tx(conn_tx, broadcast_id)
        conn_final = database.get_connection()
        try:
            pending_left = _select_pending_recipients(conn_final, broadcast_id, audience, limit=1)
            future_retry_left = _has_future_retry_pending(conn_final, broadcast_id)
        finally:
            conn_final.close()
        if not pending_left and not future_retry_left:
            with database.transaction() as conn_tx:
                final_status = _finalize_broadcast_status(conn_tx, broadcast_id)
                if final_status in {"completed", "failed"}:
                    completed += 1
    return {"processed": processed, "sent": sent, "failed": failed, "retried": retried, "completed": completed}


def render_broadcast_receipt(row: dict[str, Any] | None) -> str:
    if not row:
        return "Broadcast not found."
    audience = _normalize_audience(row.get("audience"))
    preview = escape(_message_preview(str(row.get("message_text") or "")))
    retry_pending = _coerce_int(row.get("retry_pending"))
    failed = _coerce_int(row.get("failed_count") or row.get("failed"))
    total = _coerce_int(row.get("total_count"))
    return (
        f"<b>Broadcast</b>\n"
        f"• Status: <b>{escape(str(row.get('status') or '—'))}</b>\n"
        f"• Audience: <code>{escape(audience)}</code>\n"
        f"• Sent: <b>{_coerce_int(row.get('sent_count') or row.get('sent'))}</b> / {total}\n"
        f"• Retry pending: <b>{retry_pending}</b>\n"
        f"• Failed: <b>{failed}</b>\n"
        f"• Preview: {preview or '—'}"
    )
