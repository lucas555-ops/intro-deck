from __future__ import annotations

import html
from urllib.parse import parse_qs, urlencode

from admin import read_models
from infra.admin_auth import auth_challenge, check_basic_auth, is_admin_web_enabled
from services import settings
from services.audit import get_audit_log
from services.operator_recovery import process_payment_event_now, reconcile_stuck_duel_now, retry_runtime_job_now
from services.risk import add_flag, freeze_user, manual_balance_adjustment, resolve_flag, unfreeze_user
from services.withdrawals import (
    add_operator_note,
    approve_withdrawal,
    mark_withdrawal_failed,
    mark_withdrawal_processing,
    mark_withdrawal_sent,
    reject_withdrawal,
)

SAFE_RUNTIME_SETTING_KEYS = (
    "duels_enabled",
    "deposits_enabled",
    "withdrawals_enabled",
    "maintenance_mode",
)

WITHDRAWAL_STATUS_OPTIONS = [
    ("", "Все статусы"),
    ("requested", "Requested"),
    ("reserved", "Reserved"),
    ("processing", "Processing"),
    ("sent", "Sent"),
    ("failed", "Failed"),
    ("rejected", "Rejected"),
]

REVIEW_STATUS_OPTIONS = [
    ("", "Все проверки"),
    ("pending_review", "Pending review"),
    ("approved", "Approved"),
    ("rejected", "Rejected"),
    ("not_required", "Not required"),
]

USER_FILTER_OPTIONS = [
    ("", "Все пользователи"),
    ("frozen", "Frozen"),
    ("manual_review", "Manual review"),
    ("withdrawal_blocked", "Withdrawal blocked"),
    ("duel_blocked", "Duel blocked"),
    ("deposit_blocked", "Deposit blocked"),
    ("high_balance", "High balance"),
]

USER_FLAG_OPTIONS = [
    ("manual_review", "Manual review"),
    ("withdrawal_blocked", "Withdrawal blocked"),
    ("duel_blocked", "Duel blocked"),
    ("deposit_blocked", "Deposit blocked"),
]


RISK_FILTER_OPTIONS = [
    ("", "Все active flags"),
    ("manual_review", "Manual review"),
    ("withdrawal_blocked", "Withdrawal blocked"),
    ("duel_blocked", "Duel blocked"),
    ("deposit_blocked", "Deposit blocked"),
    ("frozen", "Frozen users"),
    ("high", "High / review risk"),
]

FAILED_TAB_OPTIONS = [
    ("all", "All"),
    ("withdrawals", "Withdrawals"),
    ("payments", "Payments"),
    ("duels", "Stuck duels"),
    ("jobs", "Runtime jobs"),
]

RECOVERY_TAB_BY_ACTION = {
    "process_payment_event": "payments",
    "reconcile_stuck_duel": "duels",
    "retry_runtime_job": "jobs",
}


def _layout(title: str, body: str, *, current: str = "overview", flash: str = "") -> bytes:
    nav_items = [
        ("overview", "/admin", "Overview"),
        ("liabilities", "/admin/liabilities", "Liabilities"),
        ("withdrawals", "/admin/withdrawals", "Withdrawals"),
        ("users", "/admin/users", "Users"),
        ("risk", "/admin/risk", "Risk Queue"),
        ("failed", "/admin/failed", "Failed Items"),
        ("runtime", "/admin/runtime", "Runtime"),
        ("audit", "/admin/audit", "Audit"),
        ("help", "/admin/help", "Help"),
    ]
    nav_html = "".join(
        f"<a class='nav-item {'active' if key == current else ''}' href='{href}'>{html.escape(label)}</a>"
        for key, href, label in nav_items
    )
    flash_html = f"<div class='flash'>{flash}</div>" if flash else ""
    doc = f"""<!doctype html>
<html lang='ru'>
<head>
  <meta charset='utf-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1'>
  <title>{html.escape(title)}</title>
  <style>
    :root {{
      --bg: #f4f6fb;
      --panel: #ffffff;
      --line: #d8dfef;
      --text: #162033;
      --muted: #66728b;
      --accent: #2b6df6;
      --accent-soft: #eef4ff;
      --ok: #177245;
      --warn: #9a6700;
      --bad: #b42318;
      --shadow: 0 10px 30px rgba(18, 32, 61, 0.08);
    }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font-family: Inter, Arial, sans-serif; background: var(--bg); color: var(--text); }}
    a {{ color: var(--accent); text-decoration: none; }}
    .shell {{ min-height: 100vh; display: grid; grid-template-columns: 240px minmax(0, 1fr); }}
    .sidebar {{ background: #111827; color: #f9fafb; padding: 24px 16px; }}
    .brand {{ font-size: 18px; font-weight: 700; margin-bottom: 6px; }}
    .brand-sub {{ color: #9ca3af; font-size: 13px; margin-bottom: 20px; }}
    .nav {{ display: grid; gap: 8px; }}
    .nav-item {{ display: block; padding: 10px 12px; border-radius: 12px; color: #e5e7eb; }}
    .nav-item.active {{ background: rgba(255,255,255,0.12); font-weight: 600; }}
    .nav-item:hover {{ background: rgba(255,255,255,0.08); }}
    .content {{ padding: 24px; }}
    .topbar {{ display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 18px; }}
    .title {{ font-size: 28px; font-weight: 700; margin: 0 0 6px; }}
    .subtitle {{ margin: 0; color: var(--muted); font-size: 14px; }}
    .flash {{ margin-bottom: 16px; background: var(--accent-soft); border: 1px solid #cfe0ff; padding: 12px 14px; border-radius: 14px; }}
    .cards {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin: 16px 0 22px; }}
    .card, .panel {{ background: var(--panel); border: 1px solid var(--line); border-radius: 18px; box-shadow: var(--shadow); }}
    .card {{ padding: 16px; }}
    .metric-label {{ color: var(--muted); font-size: 13px; margin-bottom: 8px; }}
    .metric-value {{ font-size: 28px; font-weight: 700; margin-bottom: 4px; }}
    .metric-note {{ color: var(--muted); font-size: 12px; }}
    .grid2 {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }}
    .grid3 {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }}
    .panel {{ padding: 18px; margin-bottom: 16px; }}
    .panel h2, .panel h3 {{ margin: 0 0 14px; font-size: 18px; }}
    .panel h4 {{ margin: 16px 0 8px; font-size: 14px; }}
    .muted {{ color: var(--muted); }}
    .mono {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }}
    .stack > * + * {{ margin-top: 10px; }}
    .kv {{ display: grid; grid-template-columns: minmax(180px, 240px) 1fr; gap: 10px 14px; }}
    .kv div {{ padding: 8px 0; border-bottom: 1px dashed #e5e7eb; }}
    .pill-row {{ display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 14px; }}
    .pill {{ display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); border-radius: 999px; padding: 8px 12px; background: #fff; color: var(--text); font-size: 13px; }}
    .pill.active {{ border-color: #9bbcff; background: var(--accent-soft); font-weight: 600; }}
    .badge {{ display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 600; }}
    .badge.ok {{ background: #e8f7ee; color: var(--ok); }}
    .badge.warn {{ background: #fff4db; color: var(--warn); }}
    .badge.bad {{ background: #feeceb; color: var(--bad); }}
    .badge.neutral {{ background: #eef2f7; color: #445066; }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{ padding: 12px 10px; border-bottom: 1px solid #edf1f7; vertical-align: top; text-align: left; font-size: 14px; }}
    th {{ color: var(--muted); font-weight: 600; font-size: 12px; letter-spacing: 0.02em; text-transform: uppercase; }}
    .actions {{ display: grid; gap: 12px; }}
    form.compact, form.inline {{ display: inline; }}
    form.card-form {{ border: 1px solid #edf1f7; border-radius: 14px; padding: 12px; background: #fbfcff; }}
    label {{ display: block; margin-bottom: 6px; font-size: 13px; color: var(--muted); }}
    input[type=text], input[type=number], textarea, select {{ width: 100%; padding: 10px 12px; border: 1px solid #d7deed; border-radius: 12px; background: #fff; color: var(--text); }}
    textarea {{ min-height: 86px; resize: vertical; }}
    button {{ border: 0; border-radius: 12px; padding: 10px 14px; background: var(--accent); color: white; font-weight: 600; cursor: pointer; }}
    button.secondary {{ background: #eef2ff; color: #2746a1; }}
    button.warn {{ background: #fff3da; color: #8b5c00; }}
    button.bad {{ background: #fde9e7; color: #a8241f; }}
    .checkline {{ display: flex; align-items: center; gap: 8px; margin: 10px 0; color: var(--muted); font-size: 13px; }}
    .checkline input {{ width: auto; }}
    .toolbar {{ display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }}
    .toolbar .group {{ display: flex; gap: 10px; flex-wrap: wrap; }}
    .empty {{ padding: 18px; border: 1px dashed #cfd7e8; border-radius: 14px; color: var(--muted); text-align: center; }}
    .footnote {{ color: var(--muted); font-size: 12px; margin-top: 8px; }}
    .warn-panel {{ border: 1px solid rgba(217, 119, 6, 0.35); background: rgba(245, 158, 11, 0.08); }}
    .warn-panel ul {{ margin: 8px 0 0 18px; padding: 0; }}
    @media (max-width: 980px) {{
      .shell {{ grid-template-columns: 1fr; }}
      .sidebar {{ padding-bottom: 12px; }}
      .grid2, .grid3 {{ grid-template-columns: 1fr; }}
      .kv {{ grid-template-columns: 1fr; }}
      .content {{ padding: 18px; }}
    }}
  </style>
</head>
<body>
  <div class='shell'>
    <aside class='sidebar'>
      <div class='brand'>Roll Duel</div>
      <div class='brand-sub'>Operator Control Plane</div>
      <nav class='nav'>{nav_html}</nav>
    </aside>
    <main class='content'>
      {flash_html}
      {body}
    </main>
  </div>
</body>
</html>"""
    return doc.encode("utf-8")


def _parse_form(body: bytes) -> dict[str, str]:
    parsed = parse_qs(body.decode("utf-8"), keep_blank_values=True)
    return {k: v[-1] for k, v in parsed.items()}


def _parse_query(query_string: str) -> dict[str, str]:
    parsed = parse_qs(query_string or "", keep_blank_values=True)
    return {k: v[-1] for k, v in parsed.items()}


def _url(path: str, **params: str | int | None) -> str:
    clean = {k: str(v) for k, v in params.items() if v not in (None, "")}
    return path if not clean else f"{path}?{urlencode(clean)}"


def _redirect(location: str) -> tuple[int, dict[str, str], bytes]:
    return 302, {"Location": location}, b""


def _operator_id(headers: dict[str, str]) -> str:
    auth = headers.get("Authorization", "")
    if auth.startswith("Basic "):
        import base64
        try:
            raw = base64.b64decode(auth.split(" ", 1)[1]).decode("utf-8")
            username, _ = raw.split(":", 1)
            return username
        except Exception:
            pass
    return "admin"


def _flash(query: dict[str, str]) -> str:
    msg = query.get("msg")
    if not msg:
        return ""
    level = query.get("level", "neutral")
    badge = {
        "ok": "<span class='badge ok'>OK</span>",
        "warn": "<span class='badge warn'>Внимание</span>",
        "bad": "<span class='badge bad'>Ошибка</span>",
    }.get(level, "<span class='badge neutral'>Info</span>")
    return f"{badge} <span style='margin-left:8px'>{html.escape(msg)}</span>"


def _result_redirect(path: str, result: dict, **extra_params: str | int | None) -> tuple[int, dict[str, str], bytes]:
    params = dict(extra_params)
    params["msg"] = "Готово" if result.get("ok") else str(result.get("error") or "Operation failed")
    params["level"] = "ok" if result.get("ok") else "bad"
    return _redirect(_url(path, **params))


def _require_confirm(form: dict[str, str]) -> str | None:
    if form.get("confirm") == "1":
        return None
    return "Подтверждение обязательно для operator write-action."


def _status_badge(value: str | None) -> str:
    normalized = (value or "").lower()
    tone = "neutral"
    if normalized in {"sent", "approved", "enabled", "healthy", "ok", "not_required"}:
        tone = "ok"
    elif normalized in {"requested", "reserved", "processing", "pending_review", "warning", "degraded"}:
        tone = "warn"
    elif normalized in {"failed", "rejected", "disabled", "blocked"}:
        tone = "bad"
    label = value or "-"
    return f"<span class='badge {tone}'>{html.escape(str(label))}</span>"


def _html_table(rows: list[dict], columns: list[tuple[str, str]], *, link_key: str | None = None, link_base: str = "", empty_label: str = "Нет данных") -> str:
    head = "".join(f"<th>{html.escape(label)}</th>" for _, label in columns)
    badge_keys = {"status", "review_status", "risk_level", "outcome", "frozen_status", "flag_status"}
    body_rows: list[str] = []
    for row in rows:
        cells = []
        for key, _label in columns:
            value = row.get(key, "")
            cell = html.escape(str(value))
            if key in badge_keys:
                cell = _status_badge(str(value))
            elif key == "actions":
                cell = str(value)
            if link_key and key == link_key:
                cell = f"<a class='mono' href='{html.escape(link_base + str(value))}'>{html.escape(str(value))}</a>"
            cells.append(f"<td>{cell}</td>")
        body_rows.append("<tr>" + "".join(cells) + "</tr>")
    if not body_rows:
        body_rows = [f"<tr><td colspan='{len(columns)}'><div class='empty'>{html.escape(empty_label)}</div></td></tr>"]
    return f"<table><thead><tr>{head}</tr></thead><tbody>{''.join(body_rows)}</tbody></table>"


def _page_header(title: str, subtitle: str) -> str:
    return f"<div class='topbar'><div><h1 class='title'>{html.escape(title)}</h1><p class='subtitle'>{html.escape(subtitle)}</p></div></div>"


def _alerts_panel(alerts: list[dict], *, title: str = "Operator alerts", empty_label: str = "Активных operator alerts сейчас нет.") -> str:
    if not alerts:
        return f"<section class='panel'><h2>{html.escape(title)}</h2><div class='empty'>{html.escape(empty_label)}</div></section>"
    parts = [f"<section class='panel warn-panel'><h2>{html.escape(title)}</h2><div class='stack'>"]
    for item in alerts:
        level = str(item.get("level") or "neutral")
        title_html = html.escape(str(item.get("title") or "Alert"))
        detail_html = html.escape(str(item.get("detail") or ""))
        href = str(item.get("href") or "").strip()
        cta = html.escape(str(item.get("cta") or "Open"))
        link_html = f"<a class='pill' href='{html.escape(href)}'>{cta}</a>" if href else ""
        parts.append(
            "<div class='card'>"
            f"<div>{_status_badge(level)}</div>"
            f"<div style='margin-top:8px;font-weight:700'>{title_html}</div>"
            f"<div class='metric-note' style='margin-top:6px'>{detail_html}</div>"
            f"<div style='margin-top:10px'>{link_html}</div>"
            "</div>"
        )
    parts.append("</div></section>")
    return "".join(parts)


def _recovery_form(*, action: str, entity_id: str, entity_field: str, button_label: str, reason_placeholder: str, button_class: str = "secondary") -> str:
    return (
        "<form method='post' class='card-form'>"
        f"<input type='hidden' name='action' value='{html.escape(action)}'>"
        f"<input type='hidden' name='{html.escape(entity_field)}' value='{html.escape(entity_id)}'>"
        f"<label>Reason<input type='text' name='reason' placeholder='{html.escape(reason_placeholder)}'></label>"
        "<label class='checkline'><input type='checkbox' name='confirm' value='1'>Я подтверждаю recovery action</label>"
        f"<button class='{button_class}'>{html.escape(button_label)}</button>"
        "</form>"
    )


def _overview_page() -> str:
    snap = read_models.dashboard_snapshot()
    liabilities = read_models.liabilities_snapshot()
    comms = read_models.comms_snapshot()
    metrics = [
        ("Pending withdrawals", snap["requested_withdrawals"], "Новые заявки, ожидающие operator flow."),
        ("Processing withdrawals", snap["processing_withdrawals"], "В работе или зарезервированы."),
        ("Failed withdrawals", snap["failed_withdrawals"], "Нужны проверка причины и operator решение."),
        ("Open duels", snap["open_duels"], "Ожидают второго игрока."),
        ("Active duels", snap["active_duels"], "Живые дуэли прямо сейчас."),
        ("Stuck duels", snap["stuck_duels"], "Проверить runtime, если число растёт."),
        ("Manual review users", snap["manual_review_users"], "Есть активные флаги ручной проверки."),
        ("Frozen users", snap["frozen_users"], "Замороженные аккаунты в risk truth."),
    ]
    cards = "".join(
        f"<div class='card'><div class='metric-label'>{html.escape(label)}</div><div class='metric-value'>{html.escape(str(value))}</div><div class='metric-note'>{html.escape(note)}</div></div>"
        for label, value, note in metrics
    )
    money_cards = [
        ("Available balances", f"{snap['total_available_balances']} TON"),
        ("Reserved liabilities", f"{snap['reserved_liabilities']} TON"),
        ("Inflight withdrawals", f"{snap['inflight_withdrawals']} TON"),
        ("Pending deposits", snap["pending_deposits"]),
        ("Unprocessed payment events", snap["unprocessed_payment_events"]),
    ]
    money_html = "".join(
        f"<div class='card'><div class='metric-label'>{html.escape(label)}</div><div class='metric-value'>{html.escape(str(value))}</div></div>"
        for label, value in money_cards
    )
    liability_cards = [
        ("Treasury balance", f"{liabilities['treasury_balance']} TON", "Текущий platform / treasury user#0 balance."),
        ("Customer liability", f"{liabilities['total_customer_liability']} TON", "Available balances + active reservations."),
        ("Hot outflow now", f"{liabilities['hot_outflow_now']} TON", "Requested / reserved / processing withdrawals."),
        ("Treasury vs inflight", f"{liabilities['operator_buffer']} TON", "Положительное значение означает запас над inflight withdrawals."),
    ]
    liability_html = "".join(
        f"<div class='card'><div class='metric-label'>{html.escape(label)}</div><div class='metric-value'>{html.escape(str(value))}</div><div class='metric-note'>{html.escape(note)}</div></div>"
        for label, value, note in liability_cards
    )
    quick_links = "".join(
        f"<a class='pill' href='{href}'>{label}</a>"
        for href, label in [
            ("/admin/liabilities", "Open Liabilities"),
            ("/admin/withdrawals", "Withdrawals"),
            ("/admin/failed", "Failed Items"),
            ("/admin/risk", "Risk Queue"),
            ("/admin/runtime", "Runtime"),
        ]
    )
    recent_withdrawals = read_models.list_withdrawals(limit=10)
    recent_audit = get_audit_log(10)
    return (
        _page_header("Overview", "Первый control-plane слой для operator truth: withdrawals, runtime, audit и liabilities visibility.")
        + f"<div class='cards'>{cards}</div>"
        + "<div class='panel'><h2>Money / platform snapshot</h2>"
        + f"<div class='cards'>{money_html}</div></div>"
        + _alerts_panel(liabilities.get('alerts') or [], title="Operator alerts", empty_label="Критичных operator alerts сейчас нет.")
        + "<div class='panel'><h2>Liabilities snapshot</h2>"
        + f"<div class='cards'>{liability_html}</div>"
        + f"<div class='pill-row' style='margin-top:14px'>{quick_links}</div>"
        + "<div class='footnote'>Этот блок остаётся read-first и ведёт в узкие truth-specific desks для deep work.</div></div>"
        + "<div class='grid2'>"
        + "<section class='panel'><h2>Recent withdrawals</h2>"
        + _html_table(
            recent_withdrawals,
            [("withdrawal_id", "Withdrawal"), ("user_id", "User"), ("amount", "Amount"), ("status", "Status"), ("review_status", "Review"), ("created_at", "Created")],
            link_key="withdrawal_id",
            link_base="/admin/withdrawals/",
            empty_label="Очередь выводов пока пустая.",
        )
        + "</section>"
        + "<section class='panel'><h2>Recent audit</h2>"
        + _html_table(
            recent_audit,
            [("created_at", "Time"), ("operator_id", "Operator"), ("action_type", "Action"), ("target_type", "Entity"), ("target_id", "ID")],
            empty_label="Аудит пока пустой.",
        )
        + "</section></div>"
        + "<div class='grid2'>"
        + "<section class='panel'><h2>Comms / Broadcast</h2>"
        + (
            (
                f"<div class='stack'><div><b>Active broadcast</b></div><div class='metric-note'>ID: <code>{html.escape(str((comms.get('active_broadcast') or {}).get('broadcast_id') or '—'))}</code></div>"
                f"<div class='metric-note'>Audience: <code>{html.escape(str((comms.get('active_broadcast') or {}).get('audience') or '—'))}</code></div>"
                f"<div class='metric-note'>Sent / total: <b>{int((comms.get('active_broadcast') or {}).get('sent_count') or 0)}</b> / <b>{int((comms.get('active_broadcast') or {}).get('total_count') or 0)}</b></div>"
                f"<div class='metric-note'>Retry pending: <b>{int((comms.get('active_broadcast') or {}).get('retry_pending') or 0)}</b> · Failed: <b>{int((comms.get('active_broadcast') or {}).get('failed_count') or 0)}</b></div></div>"
            )
            if comms.get('active_broadcast')
            else "<div class='empty'>Активной рассылки сейчас нет.</div>"
        )
        + _html_table(
            comms.get('recent_broadcasts') or [],
            [("broadcast_id", "Broadcast"), ("status", "Status"), ("audience", "Audience"), ("sent_count", "Sent"), ("retry_pending", "Retry"), ("failed_count", "Failed"), ("total_count", "Total")],
            empty_label='История рассылок пока пустая.',
        )
        + "</section>"
        + "<section class='panel'><h2>System Notice</h2>"
        + (
            (
                f"<div class='stack'><div><b>Current active notice</b></div><div class='metric-note'>ID: <code>{html.escape(str((comms.get('current_notice') or {}).get('notice_id') or '—'))}</code></div>"
                f"<div class='metric-note'>Severity: <b>{html.escape(str((comms.get('current_notice') or {}).get('severity') or '—'))}</b></div>"
                f"<div class='metric-note'>Target: <code>{html.escape(str((comms.get('current_notice') or {}).get('target') or '—'))}</code></div>"
                f"<div class='metric-note'>Version: <b>{int((comms.get('current_notice') or {}).get('version') or 0)}</b></div></div>"
            )
            if comms.get('current_notice')
            else "<div class='empty'>Активного notice сейчас нет.</div>"
        )
        + _html_table(
            comms.get('recent_notices') or [],
            [("notice_id", "Notice"), ("status", "Status"), ("severity", "Severity"), ("target", "Target"), ("version", "Version")],
            empty_label='История notice пока пустая.',
        )
        + "</section></div>"
    )


def _withdrawals_page(query: dict[str, str]) -> str:
    status = query.get("status", "")
    review_status = query.get("review_status", "")
    page = max(int(query.get("page", "1") or 1), 1)
    page_size = 100
    offset = (page - 1) * page_size
    rows = read_models.list_withdrawals(status or None, review_status or None, limit=page_size, offset=offset)

    status_pills = "".join(
        f"<a class='pill {'active' if value == status else ''}' href='{html.escape(_url('/admin/withdrawals', status=value, review_status=review_status or None))}'>{html.escape(label)}</a>"
        for value, label in WITHDRAWAL_STATUS_OPTIONS
    )
    review_pills = "".join(
        f"<a class='pill {'active' if value == review_status else ''}' href='{html.escape(_url('/admin/withdrawals', status=status or None, review_status=value))}'>{html.escape(label)}</a>"
        for value, label in REVIEW_STATUS_OPTIONS
    )
    toolbar = (
        "<div class='toolbar'>"
        "<div class='group'><a class='pill' href='/admin'>← Overview</a></div>"
        f"<div class='group'><a class='pill' href='{html.escape(_url('/admin/withdrawals', status=status or None, review_status=review_status or None, page=max(page - 1, 1)))}'>← Prev</a>"
        f"<a class='pill' href='{html.escape(_url('/admin/withdrawals', status=status or None, review_status=review_status or None, page=page + 1))}'>Next →</a></div>"
        "</div>"
    )
    body = _page_header("Withdrawals", "Очередь operator triage с bounded-выгрузкой, фильтрами и переходом в карточку.")
    body += "<div class='panel'><h2>Status</h2><div class='pill-row'>" + status_pills + "</div>"
    body += "<h3 style='margin-top:0'>Review</h3><div class='pill-row'>" + review_pills + "</div></div>"
    body += "<section class='panel'><h2>Queue</h2>" + toolbar
    body += _html_table(
        rows,
        [("withdrawal_id", "Withdrawal"), ("user_id", "User"), ("amount", "Amount"), ("status", "Status"), ("review_status", "Review"), ("risk_level", "Risk"), ("created_at", "Created")],
        link_key="withdrawal_id",
        link_base="/admin/withdrawals/",
        empty_label="По выбранным фильтрам выводов нет.",
    )
    body += f"<div class='footnote'>Страница {page}. Показано до {page_size} записей. Для следующей части очереди используйте Next.</div></section>"
    return body


def _withdrawal_detail_page(withdrawal_id: str) -> tuple[int, str, str]:
    card = read_models.get_withdrawal_card(withdrawal_id)
    if not card:
        return 404, "Withdrawals", _page_header("Withdrawal not found", "Карточка вывода не найдена.") + "<div class='panel'><div class='empty'>Запрос не найден.</div></div>"
    risk_items = "".join(
        f"<li><strong>{html.escape(str(flag.get('flag_type') or '-'))}</strong> — {html.escape(str(flag.get('reason') or '-'))}</li>"
        for flag in card["risk_flags"]
    ) or "<li class='muted'>Активных risk flags нет.</li>"
    action_forms = []
    for action, label, button_class, fields in [
        ("approve_withdrawal", "Approve review", "secondary", "<label>Reason<input type='text' name='reason' placeholder='review ok'></label>"),
        ("reject_withdrawal", "Reject withdrawal", "bad", "<label>Reason<input type='text' name='reason' placeholder='operator rejected'></label>"),
        ("processing_withdrawal", "Mark processing", "secondary", "<label>Reason<input type='text' name='reason' placeholder='sending now'></label>"),
        ("sent_withdrawal", "Mark sent", "", "<label>Transfer ID<input type='text' name='transfer_id' placeholder='provider tx id'></label><label>Spend ID<input type='text' name='spend_id' placeholder='provider spend id'></label>"),
        ("failed_withdrawal", "Mark failed", "warn", "<label>Reason<input type='text' name='reason' placeholder='failure reason'></label><div class='checkline'><input type='checkbox' name='retryable' value='1' id='retryable'><label for='retryable' style='margin:0'>Retryable failure</label></div>"),
        ("note_withdrawal", "Save note", "secondary", "<label>Operator note<textarea name='note' placeholder='short operator note'></textarea></label>"),
    ]:
        confirm_line = "" if action == "note_withdrawal" else "<label class='checkline'><input type='checkbox' name='confirm' value='1'>Я подтверждаю operator write-action</label>"
        action_forms.append(
            "<form method='post' class='card-form'>"
            f"<input type='hidden' name='action' value='{action}'>"
            f"<input type='hidden' name='withdrawal_id' value='{html.escape(withdrawal_id)}'>"
            f"<h4>{html.escape(label)}</h4>{fields}{confirm_line}<button class='{button_class}'>{html.escape(label)}</button></form>"
        )
    summary = f"""
    <div class='grid2'>
      <section class='panel stack'>
        <h2>Summary</h2>
        <div class='kv'>
          <div class='muted'>Withdrawal ID</div><div class='mono'>{html.escape(str(card['withdrawal_id']))}</div>
          <div class='muted'>User</div><div><a href='/admin/users/{html.escape(str(card['user_id']))}'>{html.escape(str(card['user_id']))}</a> @{html.escape(str(card.get('username') or '-'))}</div>
          <div class='muted'>Amount</div><div><strong>{html.escape(str(card['amount']))} TON</strong></div>
          <div class='muted'>Status</div><div>{_status_badge(card.get('status'))}</div>
          <div class='muted'>Review</div><div>{_status_badge(card.get('review_status') or 'not_required')}</div>
          <div class='muted'>Provider status</div><div>{_status_badge(card.get('provider_status') or '-')}</div>
          <div class='muted'>Transfer ID</div><div class='mono'>{html.escape(str(card.get('provider_transfer_id') or '-'))}</div>
          <div class='muted'>Spend ID</div><div class='mono'>{html.escape(str(card.get('provider_spend_id') or '-'))}</div>
          <div class='muted'>Last operator note</div><div>{html.escape(str(card.get('last_operator_note') or '-'))}</div>
          <div class='muted'>Created</div><div>{html.escape(str(card.get('created_at') or '-'))}</div>
          <div class='muted'>Updated</div><div>{html.escape(str(card.get('updated_at') or '-'))}</div>
        </div>
        <h3>Risk flags</h3>
        <ul>{risk_items}</ul>
      </section>
      <section class='panel'>
        <h2>Actions</h2>
        <div class='actions'>{''.join(action_forms)}</div>
        <div class='footnote'>Все write-actions проходят через service-layer и требуют reread после мутации.</div>
      </section>
    </div>
    <section class='panel'><h2>Withdrawal audit</h2>{_html_table(card['audit'], [('created_at', 'Time'), ('operator_id', 'Operator'), ('action_type', 'Action'), ('reason', 'Reason')], empty_label='Аудит по этой заявке пока пустой.')}</section>
    """
    return 200, f"Withdrawal {withdrawal_id}", _page_header("Withdrawal Card", "Карточка вывода с truth-read, confirm guards и свежим аудитом.") + summary


def _liabilities_page() -> str:
    snap = read_models.liabilities_snapshot()
    metrics = [
        ("Treasury balance", f"{snap['treasury_balance']} TON", "Текущий balance platform / treasury пользователя #0."),
        ("Treasury profit", f"{snap['treasury_profit']} TON", "Текущее накопленное platform profit значение."),
        ("Customer liability", f"{snap['total_customer_liability']} TON", "Available balances + active reservations."),
        ("Inflight withdrawals", f"{snap['hot_outflow_now']} TON", "Сумма requested / reserved / processing withdrawals."),
        ("Pending deposit amount", f"{snap['pending_deposit_amount']} TON", "Сумма активных депозитов, ещё не завершённых провайдером."),
        ("Net exposure", f"{snap['net_exposure']} TON", "Customer liability + inflight withdrawals minus treasury balance."),
    ]
    cards = "".join(
        f"<div class='card'><div class='metric-label'>{html.escape(label)}</div><div class='metric-value'>{html.escape(str(value))}</div><div class='metric-note'>{html.escape(note)}</div></div>"
        for label, value, note in metrics
    )
    summary_rows = [
        ("Pending deposits count", int(snap.get("pending_deposits") or 0)),
        ("Unprocessed payment events", int(snap.get("unprocessed_payment_events") or 0)),
        ("Requested withdrawals", int(snap.get("requested_withdrawals") or 0)),
        ("Failed withdrawals", int(snap.get("failed_withdrawals") or 0)),
        ("Manual review users", int(snap.get("manual_review_users") or 0)),
        ("Open / active / stuck duels", f"{int(snap.get('open_duels') or 0)} / {int(snap.get('active_duels') or 0)} / {int(snap.get('stuck_duels') or 0)}"),
    ]
    rows_html = "".join(f"<tr><td>{html.escape(str(k))}</td><td>{html.escape(str(v))}</td></tr>" for k, v in summary_rows)
    handoff_links = "".join(
        f"<a class='pill' href='{href}'>{label}</a>"
        for href, label in [
            ("/admin/withdrawals", "Open Withdrawals"),
            ("/admin/failed?tab=payments", "Open Failed Payments"),
            ("/admin/failed?tab=withdrawals", "Open Failed Withdrawals"),
            ("/admin/risk?filter=manual_review", "Open Manual Review"),
            ("/admin/runtime", "Open Runtime"),
        ]
    )
    return (
        _page_header("Liabilities", "Read-first treasury / liabilities snapshot plus operator alerts and fast handoffs.")
        + f"<div class='cards'>{cards}</div>"
        + _alerts_panel(snap.get('alerts') or [], title="Alerts / receipts", empty_label="Operator alerts are clean right now.")
        + "<section class='panel'><h2>Queue / policy context</h2><table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>" + rows_html + "</tbody></table></section>"
        + "<section class='panel'><h2>Recommended handoffs</h2><div class='pill-row'>" + handoff_links + "</div><div class='footnote'>Deep work по withdrawals, risk, failed items и runtime остаётся в соответствующих desks/cards.</div></section>"
    )


def _runtime_page() -> str:
    runtime = read_models.runtime_snapshot()
    kill_cards = []
    for key in SAFE_RUNTIME_SETTING_KEYS:
        current = bool(runtime["kill_switches"][key])
        next_value = "false" if current else "true"
        label = {
            "duels_enabled": "Duels enabled",
            "deposits_enabled": "Deposits enabled",
            "withdrawals_enabled": "Withdrawals enabled",
            "maintenance_mode": "Maintenance mode",
        }[key]
        button_label = "Disable" if current else "Enable"
        kill_cards.append(
            "<form method='post' class='card-form'>"
            "<input type='hidden' name='action' value='update_setting'>"
            f"<input type='hidden' name='key' value='{key}'>"
            f"<input type='hidden' name='value' value='{next_value}'>"
            f"<h4>{html.escape(label)}</h4>"
            f"<p>{_status_badge('enabled' if current else 'disabled')}</p>"
            "<label>Note<input type='text' name='note' placeholder='why this runtime change is needed'></label>"
            "<label class='checkline'><input type='checkbox' name='confirm' value='1'>Подтверждаю изменение runtime truth</label>"
            f"<button class='{'warn' if current else ''}'>{button_label}</button></form>"
        )
    limits = runtime["limits"]
    limit_rows = "".join(
        f"<tr><td>{html.escape(label)}</td><td class='mono'>{html.escape(str(value))}</td></tr>"
        for label, value in [
            ("Min stake TON", limits.get("min_stake_ton")),
            ("Max stake TON", limits.get("max_stake_ton")),
            ("Withdrawal min TON", limits.get("withdrawal_min_ton")),
            ("Withdrawal max TON", limits.get("withdrawal_max_ton")),
            ("Manual review threshold TON", limits.get("manual_review_threshold_ton")),
            ("Platform fee bps", limits.get("platform_fee_bps")),
        ]
    )
    health_cards = "".join(
        f"<div class='card'><div class='metric-label'>{html.escape(label)}</div><div class='metric-value mono' style='font-size:18px'>{html.escape(str(value))}</div></div>"
        for label, value in [
            ("Database backend", runtime["database_backend"]),
            ("Admin web", "enabled" if runtime["admin_web_enabled"] else "disabled"),
            ("Mini App runtime", "enabled" if runtime["miniapp_runtime_enabled"] else "disabled"),
            ("Telegram webhook path", runtime["telegram_webhook_path"]),
            ("Crypto Pay webhook path", runtime["cryptopay_webhook_path"]),
        ]
    )
    warnings = runtime.get("warnings") or []
    warning_panel = ""
    if warnings:
        warning_items = "".join(f"<li>{html.escape(str(item))}</li>" for item in warnings)
        warning_panel = (
            "<section class='panel warn-panel'>"
            "<h2>Runtime warnings</h2>"
            "<ul>" + warning_items + "</ul>"
            "<div class='footnote'>Страница остаётся доступной: backend truth перечитан с tolerant reader и safe fallback.</div>"
            "</section>"
        )
    sanity = runtime.get("settings_sanity") or {}
    sanity_rows = "".join(
        f"<tr><td>{html.escape(label)}</td><td class='mono'>{html.escape(str(value))}</td></tr>"
        for label, value in [
            ("Settings rows", sanity.get("rows", 0)),
            ("Native JSON rows", sanity.get("native_rows", 0)),
            ("Malformed rows", sanity.get("malformed_rows", 0)),
            ("Fallback mode", "enabled" if sanity.get("fallback_mode") else "disabled"),
        ]
    )
    return (
        _page_header("Runtime", "Health/readiness snapshot и безопасные kill switches без free-form config editing.")
        + warning_panel
        + f"<section class='panel'><h2>Readiness snapshot</h2><div class='cards'>{health_cards}</div></section>"
        + f"<section class='panel'><h2>Kill switches</h2><div class='grid2'>{''.join(kill_cards)}</div></section>"
        + f"<section class='panel'><h2>Limits / policy summary</h2><table><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>{limit_rows}</tbody></table><div class='footnote'>Числовые лимиты здесь read-only. Тяжёлые policy editor surfaces остаются вне первого шага.</div></section>"
        + f"<section class='panel'><h2>Settings sanity</h2><table><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>{sanity_rows}</tbody></table><div class='footnote'>Небольшая sanity-проверка помогает увидеть storage-type drift, не роняя весь runtime route.</div></section>"
    )


def _audit_page() -> str:
    rows = get_audit_log(200)
    return (
        _page_header("Audit", "Недавние operator actions по одному source of truth.")
        + "<section class='panel'><h2>Operator actions</h2>"
        + _html_table(
            rows,
            [("created_at", "Time"), ("operator_id", "Operator"), ("action_type", "Action"), ("target_type", "Entity"), ("target_id", "Entity ID"), ("reason", "Reason")],
            empty_label="Аудит пока пустой.",
        )
        + "</section>"
    )


def _help_page() -> str:
    items = [
        "Web admin — это основной control plane. Bot admin должен оставаться узким operator console.",
        "После любого write-action ориентируйся только на reread из backend truth.",
        "Для выводов всегда нужен confirm step и audit receipt.",
        "Kill switches меняем только осознанно и с note.",
        "Если видишь stuck duels / failed withdrawals / unprocessed payment events, сначала смотри Runtime и Audit.",
    ]
    content = "".join(f"<li>{html.escape(item)}</li>" for item in items)
    return _page_header("Help", "Короткая operator guidance для первого control-plane слоя.") + f"<section class='panel'><h2>Rules</h2><ul>{content}</ul></section><section class='panel'><h2>Receipts / alerts</h2><ul><li>Короткий Telegram shortcut показывает snapshot и быстрый handoff, а не заменяет полный control plane.</li><li>Liabilities Snapshot нужен для быстрой сверки treasury vs inflight obligations перед операторскими решениями.</li><li>Если alert ведёт в desk, deep work всё равно делай в соответствующей card / queue / runtime section.</li></ul></section>"


def _risk_page(query: dict[str, str]) -> str:
    filter_name = query.get("filter", "")
    page = max(int(query.get("page", "1") or 1), 1)
    page_size = 100
    offset = (page - 1) * page_size
    snap = read_models.risk_queue_snapshot()
    rows = read_models.list_risk_queue(filter_name or None, limit=page_size, offset=offset)
    for row in rows:
        row["frozen_status"] = "blocked" if row.get("is_frozen") else "enabled"
    filter_pills = "".join(
        f"<a class='pill {'active' if value == filter_name else ''}' href='{html.escape(_url('/admin/risk', filter=value, page=1))}'>{html.escape(label)}</a>"
        for value, label in RISK_FILTER_OPTIONS
    )
    metrics = [
        ("Active flags", snap["active_flags"], "Все открытые risk flags в backend truth."),
        ("Manual review", snap["manual_review"], "Пользователи, требующие ручной проверки."),
        ("Withdrawal blocked", snap["withdrawal_blocked"], "Флаги, блокирующие вывод средств."),
        ("Frozen users", snap["frozen_users"], "Аккаунты в заморозке."),
    ]
    cards = "".join(
        f"<div class='card'><div class='metric-label'>{html.escape(label)}</div><div class='metric-value'>{value}</div><div class='metric-note'>{html.escape(note)}</div></div>"
        for label, value, note in metrics
    )
    toolbar = (
        "<div class='toolbar'><div class='group'>"
        f"<a class='pill' href='{html.escape(_url('/admin/risk', filter=filter_name or None, page=max(page - 1, 1)))}'>← Prev</a>"
        f"<a class='pill' href='{html.escape(_url('/admin/risk', filter=filter_name or None, page=page + 1))}'>Next →</a>"
        "</div><div class='group'>"
        "<a class='pill' href='/admin/users?filter=manual_review'>Open Users manual review</a>"
        "</div></div>"
    )
    body = _page_header("Risk Queue", "Risk triage surface: active flags first, then open the full User Card for audited actions.")
    body += f"<div class='cards'>{cards}</div>"
    body += "<section class='panel'><h2>Filters</h2><div class='pill-row'>" + filter_pills + "</div>" + toolbar + "</section>"
    body += "<section class='panel'><h2>Active risk flags</h2>"
    body += _html_table(
        rows,
        [("user_id", "User"), ("username", "Username"), ("first_name", "First name"), ("flag_type", "Flag"), ("flag_status", "Status"), ("risk_level", "Risk"), ("frozen_status", "Frozen"), ("active_flags_count", "Flags"), ("reason", "Reason"), ("created_at", "Created")],
        link_key="user_id",
        link_base="/admin/users/",
        empty_label="Активных risk flags по этому фильтру нет.",
    )
    body += "</section>"
    body += "<section class='panel'><h2>Operator notes</h2><ul><li>Быстрый triage идёт здесь, а write-actions — через полную User Card.</li><li>Решение по флагу должно оставлять audit trail и перечитывать backend truth.</li><li>Для money-risk сначала смотри User Card и соседние withdrawals.</li></ul></section>"
    return body


def _failed_items_page(query: dict[str, str]) -> str:
    tab = query.get("tab", "all") or "all"
    snap = read_models.failed_items_snapshot()
    failed_withdrawals = read_models.list_failed_withdrawals(limit=50, offset=0)
    payment_events = read_models.list_unprocessed_payment_events(limit=50, offset=0)
    stuck_duels = read_models.list_stuck_duels(limit=50, offset=0)
    failed_jobs = read_models.list_failed_runtime_jobs(limit=50, offset=0)
    pills = "".join(
        f"<a class='pill {'active' if value == tab else ''}' href='{html.escape(_url('/admin/failed', tab=value))}'>{html.escape(label)}</a>"
        for value, label in FAILED_TAB_OPTIONS
    )
    metrics = [
        ("Failed withdrawals", snap["failed_withdrawals"], "Нужны причина, note и operator решение."),
        ("Unprocessed payments", snap["unprocessed_payment_events"], "Webhook/reconciliation хвосты для triage."),
        ("Stuck duels", snap["stuck_duels"], "Дуэли просрочили deadline и требуют проверки runtime truth."),
        ("Failed jobs", snap["failed_jobs"], "runtime_jobs с last_error и повторным вниманием."),
    ]
    cards = "".join(
        f"<div class='card'><div class='metric-label'>{html.escape(label)}</div><div class='metric-value'>{value}</div><div class='metric-note'>{html.escape(note)}</div></div>"
        for label, value, note in metrics
    )
    body = _page_header("Failed Items", "Desk для operator triage по failed withdrawals, payment events, stuck duels и runtime jobs.")
    body += f"<div class='cards'>{cards}</div>"
    body += "<section class='panel'><h2>Sections</h2><div class='pill-row'>" + pills + "</div><div class='footnote'>Этот шаг добавляет узкие recovery-actions для payment/runtime tails, но не превращает desk в второй full control plane.</div></section>"
    if tab in {"all", "withdrawals"}:
        rows = []
        for item in failed_withdrawals:
            withdrawal_id = str(item.get("withdrawal_id") or "")
            rows.append({
                **item,
                "actions": f"<a class='pill' href='/admin/withdrawals/{html.escape(withdrawal_id)}'>Open card</a>",
            })
        body += "<section class='panel'><h2>Failed withdrawals</h2>" + _html_table(
            rows,
            [("withdrawal_id", "Withdrawal"), ("user_id", "User"), ("amount", "Amount"), ("status", "Status"), ("review_status", "Review"), ("failure_class", "Failure class"), ("updated_at", "Updated"), ("actions", "Actions")],
            link_key="withdrawal_id",
            link_base="/admin/withdrawals/",
            empty_label="Failed withdrawals сейчас нет.",
        ) + "</section>"
    if tab in {"all", "payments"}:
        parts = ["<section class='panel'><h2>Unprocessed payment events</h2>"]
        if payment_events:
            for event in payment_events:
                event_id = str(event.get("event_id") or "")
                user_href = f"/admin/users/{html.escape(str(event.get('user_id') or ''))}" if event.get("user_id") else "/admin/users"
                parts.append(
                    "<div class='card' style='margin-bottom:12px'>"
                    f"<div class='kv'><div class='muted'>Event</div><div class='mono'>{html.escape(event_id)}</div><div class='muted'>Provider type</div><div>{html.escape(str(event.get('provider_event_type') or '-'))}</div><div class='muted'>Invoice / object</div><div class='mono'>{html.escape(str(event.get('provider_object_id') or '-'))}</div><div class='muted'>Provider status</div><div>{html.escape(str(event.get('provider_status') or '-'))}</div><div class='muted'>User</div><div><a href='{user_href}'>{html.escape(str(event.get('user_id') or '-'))}</a></div><div class='muted'>Amount</div><div>{html.escape(str(event.get('amount') or '-'))} {html.escape(str(event.get('asset') or ''))}</div><div class='muted'>Created</div><div>{html.escape(str(event.get('created_at') or '-'))}</div></div>"
                    + _recovery_form(action="process_payment_event", entity_id=event_id, entity_field="event_id", button_label="Process now", reason_placeholder="invoice paid, replay event")
                    + "</div>"
                )
        else:
            parts.append("<div class='empty'>Необработанных payment events нет.</div>")
        parts.append("<div class='footnote'>Поддерживается узкий recovery-path для invoice_paid событий. Глубокая разборка провайдера остаётся вне этого шага.</div></section>")
        body += "".join(parts)
    if tab in {"all", "duels"}:
        parts = ["<section class='panel'><h2>Stuck duels</h2>"]
        if stuck_duels:
            for duel in stuck_duels:
                game_id = str(duel.get("game_id") or "")
                parts.append(
                    "<div class='card' style='margin-bottom:12px'>"
                    f"<div class='kv'><div class='muted'>Duel</div><div class='mono'>{html.escape(game_id)}</div><div class='muted'>Players</div><div>{html.escape(str(duel.get('player1_id') or '-'))} / {html.escape(str(duel.get('player2_id') or '-'))}</div><div class='muted'>Bet</div><div>{html.escape(str(duel.get('bet_amount') or '-'))} TON</div><div class='muted'>Status</div><div>{_status_badge(str(duel.get('status') or '-'))}</div><div class='muted'>Deadline</div><div>{html.escape(str(duel.get('deadline_at') or '-'))}</div><div class='muted'>Updated</div><div>{html.escape(str(duel.get('updated_at') or '-'))}</div></div>"
                    + _recovery_form(action="reconcile_stuck_duel", entity_id=game_id, entity_field="game_id", button_label="Run timeout reconcile now", reason_placeholder="deadline passed, reconcile now")
                    + "</div>"
                )
        else:
            parts.append("<div class='empty'>Stuck duels сейчас нет.</div>")
        parts.append("<div class='footnote'>Действие использует тот же timeout reconcile truth, а не отдельную UI-only механику.</div></section>")
        body += "".join(parts)
    if tab in {"all", "jobs"}:
        parts = ["<section class='panel'><h2>Failed runtime jobs</h2>"]
        if failed_jobs:
            for job in failed_jobs:
                job_id = str(job.get("job_id") or "")
                parts.append(
                    "<div class='card' style='margin-bottom:12px'>"
                    f"<div class='kv'><div class='muted'>Job</div><div class='mono'>{html.escape(job_id)}</div><div class='muted'>Type</div><div>{html.escape(str(job.get('job_type') or '-'))}</div><div class='muted'>Reference</div><div>{html.escape(str(job.get('reference_type') or '-'))}:{html.escape(str(job.get('reference_id') or '-'))}</div><div class='muted'>Status</div><div>{_status_badge(str(job.get('status') or '-'))}</div><div class='muted'>Attempts</div><div>{html.escape(str(job.get('attempt_count') or '-'))}</div><div class='muted'>Scheduled</div><div>{html.escape(str(job.get('scheduled_for') or '-'))}</div><div class='muted'>Last error</div><div>{html.escape(str(job.get('last_error') or '-'))}</div></div>"
                    + _recovery_form(action="retry_runtime_job", entity_id=job_id, entity_field="job_id", button_label="Retry now", reason_placeholder="clear error and requeue now", button_class="warn")
                    + "</div>"
                )
        else:
            parts.append("<div class='empty'>Failed runtime jobs сейчас нет.</div>")
        parts.append("<div class='footnote'>Retry now только ставит job обратно в due queue и оставляет дальнейшее выполнение каноническому runtime worker.</div></section>")
        body += "".join(parts)
    body += "<section class='panel'><h2>Operator notes</h2><ul><li>Для payment events используй Process now только на узких invoice_paid хвостах.</li><li>Для stuck duels recovery идёт через существующий timeout reconcile.</li><li>Retry now для runtime job не создаёт отдельный worker-path; он лишь возвращает job в каноническую очередь.</li></ul></section>"
    return body


def _users_page(query: dict[str, str]) -> str:
    filter_name = query.get("filter", "")
    search = (query.get("q", "") or "").strip()
    page = max(int(query.get("page", "1") or 1), 1)
    page_size = 100
    offset = (page - 1) * page_size
    rows = read_models.list_users(filter_name or None, search or None, limit=page_size, offset=offset)
    for row in rows:
        row["frozen_status"] = "blocked" if row.get("is_frozen") else "enabled"
    filter_pills = "".join(
        f"<a class='pill {'active' if value == filter_name else ''}' href='{html.escape(_url('/admin/users', filter=value, q=search or None))}'>{html.escape(label)}</a>"
        for value, label in USER_FILTER_OPTIONS
    )
    search_form = (
        "<form method='get' class='toolbar'>"
        "<div class='group'>"
        f"<input type='text' name='q' value='{html.escape(search)}' placeholder='user id / @username / first name'>"
        f"<input type='hidden' name='filter' value='{html.escape(filter_name)}'>"
        "<button type='submit' class='secondary'>Search</button>"
        "</div>"
        f"<div class='group'><a class='pill' href='{html.escape(_url('/admin/users', filter=filter_name or None, q=search or None, page=max(page - 1, 1)))}'>← Prev</a>"
        f"<a class='pill' href='{html.escape(_url('/admin/users', filter=filter_name or None, q=search or None, page=page + 1))}'>Next →</a></div>"
        "</form>"
    )
    body = _page_header("Users", "User desk для поиска, triage и входа в полную User Card без broad CRM-overreach.")
    body += "<div class='panel'><h2>Filters</h2><div class='pill-row'>" + filter_pills + "</div>" + search_form + "</div>"
    body += "<section class='panel'><h2>Users list</h2>"
    body += _html_table(
        rows,
        [("user_id", "User"), ("username", "Username"), ("first_name", "First name"), ("balance", "Balance"), ("reserved_amount", "Reserved"), ("risk_level", "Risk"), ("frozen_status", "Frozen"), ("active_flags_count", "Flags"), ("games_played", "Games"), ("games_won", "Wins"), ("last_seen_at", "Last seen")],
        link_key="user_id",
        link_base="/admin/users/",
        empty_label="По выбранным фильтрам пользователей нет.",
    )
    body += f"<div class='footnote'>Страница {page}. Показано до {page_size} пользователей. User Card остаётся главным operator-хабом для write-actions и истории.</div></section>"
    return body


def _user_page(user_id: int) -> tuple[int, str, str]:
    card = read_models.get_user_card(user_id)
    if not card:
        return 404, "Users", _page_header("User not found", "Карточка пользователя не найдена.") + "<div class='panel'><div class='empty'>Пользователь не найден.</div></div>"

    active_flags = card.get("active_risk_flags") or []
    active_flag_rows = []
    for item in active_flags:
        resolve_form = (
            "<form method='post' class='inline' style='display:inline-block;margin-left:8px'>"
            "<input type='hidden' name='action' value='resolve_flag'>"
            f"<input type='hidden' name='user_id' value='{html.escape(str(user_id))}'>"
            f"<input type='hidden' name='flag_id' value='{html.escape(str(item.get('flag_id') or ''))}'>"
            "<input type='hidden' name='confirm' value='1'>"
            "<button type='submit' class='secondary'>Resolve</button>"
            "</form>"
        )
        active_flag_rows.append({
            "flag_type": item.get("flag_type") or "-",
            "flag_status": item.get("status") or "-",
            "reason": item.get("reason") or "-",
            "created_at": item.get("created_at") or "-",
            "resolve": resolve_form,
        })
    active_flags_html = ""
    if active_flag_rows:
        rows_html = []
        for row in active_flag_rows:
            rows_html.append(
                "<tr>"
                f"<td>{html.escape(str(row['flag_type']))}</td>"
                f"<td>{_status_badge(str(row['flag_status']))}</td>"
                f"<td>{html.escape(str(row['reason']))}</td>"
                f"<td>{html.escape(str(row['created_at']))}</td>"
                f"<td>{row['resolve']}</td>"
                "</tr>"
            )
        active_flags_html = (
            "<table><thead><tr><th>Flag</th><th>Status</th><th>Reason</th><th>Created</th><th>Action</th></tr></thead>"
            f"<tbody>{''.join(rows_html)}</tbody></table>"
        )
    else:
        active_flags_html = "<div class='empty'>Активных risk flags нет.</div>"

    flag_options = "".join(
        f"<option value='{html.escape(value)}'>{html.escape(label)}</option>"
        for value, label in USER_FLAG_OPTIONS
    )

    body = _page_header("User Card", "Полный user context и operator write-actions через audit-safe service layer.")
    body += "<div class='toolbar'><div class='group'><a class='pill' href='/admin/users'>← Users</a></div></div>"
    body += f"""
    <div class='grid2'>
      <section class='panel'>
        <h2>Summary</h2>
        <div class='kv'>
          <div class='muted'>User</div><div>{html.escape(str(card['user_id']))} @{html.escape(str(card.get('username') or '-'))}</div>
          <div class='muted'>First name</div><div>{html.escape(str(card.get('first_name') or '-'))}</div>
          <div class='muted'>Balance</div><div>{html.escape(str(card.get('balance') or 0))} TON</div>
          <div class='muted'>Reserved</div><div>{html.escape(str(card.get('reserved_amount') or 0))} TON</div>
          <div class='muted'>Deposits total</div><div>{html.escape(str(card.get('total_deposits') or 0))} TON</div>
          <div class='muted'>Withdrawals total</div><div>{html.escape(str(card.get('total_withdrawals') or 0))} TON</div>
          <div class='muted'>Games</div><div>{html.escape(str(card.get('games_played') or 0))} / wins {html.escape(str(card.get('games_won') or 0))}</div>
          <div class='muted'>Risk</div><div>{_status_badge(card.get('risk_level') or 'normal')}</div>
          <div class='muted'>Frozen</div><div>{_status_badge('blocked' if card.get('is_frozen') else 'enabled')}</div>
          <div class='muted'>Updated</div><div>{html.escape(str(card.get('updated_at') or '-'))}</div>
        </div>
      </section>
      <section class='panel'>
        <h2>Actions</h2>
        <div class='actions'>
          <form method='post' class='card-form'>
            <input type='hidden' name='action' value='freeze_user'>
            <input type='hidden' name='user_id' value='{html.escape(str(user_id))}'>
            <h4>Freeze user</h4>
            <label>Reason<input type='text' name='reason' placeholder='why freeze is needed'></label>
            <label class='checkline'><input type='checkbox' name='confirm' value='1'>Подтверждаю freeze action</label>
            <button class='bad'>Freeze</button>
          </form>
          <form method='post' class='card-form'>
            <input type='hidden' name='action' value='unfreeze_user'>
            <input type='hidden' name='user_id' value='{html.escape(str(user_id))}'>
            <h4>Unfreeze user</h4>
            <label>Reason<input type='text' name='reason' placeholder='why unfreeze is safe'></label>
            <label class='checkline'><input type='checkbox' name='confirm' value='1'>Подтверждаю unfreeze action</label>
            <button class='secondary'>Unfreeze</button>
          </form>
          <form method='post' class='card-form'>
            <input type='hidden' name='action' value='add_flag'>
            <input type='hidden' name='user_id' value='{html.escape(str(user_id))}'>
            <h4>Add risk flag</h4>
            <label>Flag<select name='flag_type'>{flag_options}</select></label>
            <label>Reason<input type='text' name='reason' placeholder='operator rationale'></label>
            <label class='checkline'><input type='checkbox' name='confirm' value='1'>Подтверждаю risk action</label>
            <button class='warn'>Add flag</button>
          </form>
          <form method='post' class='card-form'>
            <input type='hidden' name='action' value='adjust_balance'>
            <input type='hidden' name='user_id' value='{html.escape(str(user_id))}'>
            <h4>Manual balance adjustment</h4>
            <label>Amount TON<input type='number' step='0.00000001' name='amount' placeholder='positive or negative'></label>
            <label>Reason<input type='text' name='reason' placeholder='ledger-backed adjustment reason'></label>
            <label class='checkline'><input type='checkbox' name='confirm' value='1'>Подтверждаю ledger adjustment</label>
            <button>Apply adjustment</button>
          </form>
        </div>
        <div class='footnote'>Все write-actions должны писать audit и перечитывать backend truth после мутации.</div>
      </section>
    </div>
    <section class='panel'><h2>Active risk flags</h2>{active_flags_html}</section>
    <section class='panel'><h2>Recent withdrawals</h2>{_html_table(card['recent_withdrawals'], [('withdrawal_id', 'Withdrawal'), ('amount', 'Amount'), ('status', 'Status'), ('review_status', 'Review'), ('created_at', 'Created')], link_key='withdrawal_id', link_base='/admin/withdrawals/', empty_label='Истории выводов пока нет.')}</section>
    <div class='grid2'>
      <section class='panel'><h2>Recent deposits</h2>{_html_table(card['recent_deposits'], [('invoice_id', 'Invoice'), ('amount', 'Amount'), ('status', 'Status'), ('created_at', 'Created')], empty_label='Истории депозитов пока нет.')}</section>
      <section class='panel'><h2>Recent operator actions</h2>{_html_table(card['recent_actions'], [('created_at', 'Time'), ('operator_id', 'Operator'), ('action_type', 'Action'), ('reason', 'Reason')], empty_label='User audit пока пустой.')}</section>
    </div>
    <section class='panel'><h2>Recent duels</h2>{_html_table(card['recent_duels'], [('game_id', 'Duel'), ('player1_id', 'P1'), ('player2_id', 'P2'), ('bet_amount', 'Bet'), ('status', 'Status'), ('winner_id', 'Winner'), ('created_at', 'Created')], empty_label='Истории дуэлей пока нет.')}</section>
    """
    return 200, f"User {user_id}", body

def handle_admin_request(method: str, path: str, headers: dict[str, str], body: bytes, *, query_string: str = "") -> tuple[int, dict[str, str], bytes]:
    if not is_admin_web_enabled():
        return 503, {}, _layout("Operator UI disabled", "<div class='panel'><p>Set ADMIN_WEB_PASSWORD to enable operator UI.</p></div>")
    if not check_basic_auth(headers):
        return auth_challenge()

    query = _parse_query(query_string)
    operator_id = _operator_id(headers)
    flash = _flash(query)

    if method == "POST":
        form = _parse_form(body)
        action = form.get("action", "")
        if action in {"approve_withdrawal", "reject_withdrawal", "processing_withdrawal", "sent_withdrawal", "failed_withdrawal"}:
            error = _require_confirm(form)
            if error:
                return _redirect(_url(f"/admin/withdrawals/{form.get('withdrawal_id', '')}", msg=error, level="bad"))
        if action == "approve_withdrawal":
            result = approve_withdrawal(form["withdrawal_id"], operator_id=operator_id, reason=form.get("reason") or None)
            return _result_redirect(f"/admin/withdrawals/{form['withdrawal_id']}", result)
        if action == "reject_withdrawal":
            result = reject_withdrawal(form["withdrawal_id"], operator_id=operator_id, reason=form.get("reason") or "operator_rejected")
            return _result_redirect(f"/admin/withdrawals/{form['withdrawal_id']}", result)
        if action == "processing_withdrawal":
            result = mark_withdrawal_processing(form["withdrawal_id"], operator_id=operator_id, reason=form.get("reason") or None)
            return _result_redirect(f"/admin/withdrawals/{form['withdrawal_id']}", result)
        if action == "sent_withdrawal":
            result = mark_withdrawal_sent(
                form["withdrawal_id"],
                transfer_id=form.get("transfer_id") or "manual",
                spend_id=form.get("spend_id") or f"manual:{form['withdrawal_id']}",
                operator_id=operator_id,
            )
            return _result_redirect(f"/admin/withdrawals/{form['withdrawal_id']}", result)
        if action == "failed_withdrawal":
            result = mark_withdrawal_failed(
                form["withdrawal_id"],
                error_message=form.get("reason") or "operator_failed",
                retryable=form.get("retryable") == "1",
                operator_id=operator_id,
            )
            return _result_redirect(f"/admin/withdrawals/{form['withdrawal_id']}", result)
        if action == "note_withdrawal":
            result = add_operator_note(form["withdrawal_id"], operator_id=operator_id, note=form.get("note") or "")
            return _result_redirect(f"/admin/withdrawals/{form['withdrawal_id']}", result)
        if action == "update_setting":
            error = _require_confirm(form)
            if error:
                return _redirect(_url("/admin/runtime", msg=error, level="bad"))
            key = form.get("key", "")
            if key not in SAFE_RUNTIME_SETTING_KEYS:
                return _redirect(_url("/admin/runtime", msg="Setting is not editable in TDH-ADMIN-001.", level="bad"))
            raw = form.get("value", "")
            value = raw.lower() == "true"
            settings.set_setting(key, value, operator_id=operator_id, note=form.get("note") or None)
            return _redirect(_url("/admin/runtime", msg=f"{key} updated", level="ok"))
        if action in RECOVERY_TAB_BY_ACTION:
            error = _require_confirm(form)
            tab = RECOVERY_TAB_BY_ACTION[action]
            if error:
                return _redirect(_url('/admin/failed', tab=tab, msg=error, level='bad'))
            if action == 'process_payment_event':
                result = process_payment_event_now(form.get('event_id', ''), operator_id=operator_id, reason=(form.get('reason') or '').strip() or None)
                return _result_redirect('/admin/failed', result, tab=tab)
            if action == 'reconcile_stuck_duel':
                try:
                    game_id = int(form.get('game_id') or '')
                except Exception:
                    return _redirect(_url('/admin/failed', tab=tab, msg='Некорректный game id.', level='bad'))
                result = reconcile_stuck_duel_now(game_id, operator_id=operator_id, reason=(form.get('reason') or '').strip() or None)
                return _result_redirect('/admin/failed', result, tab=tab)
            if action == 'retry_runtime_job':
                result = retry_runtime_job_now(form.get('job_id', ''), operator_id=operator_id, reason=(form.get('reason') or '').strip() or None)
                return _result_redirect('/admin/failed', result, tab=tab)
        if action in {"freeze_user", "unfreeze_user", "add_flag", "resolve_flag", "adjust_balance"}:
            error = _require_confirm(form)
            user_id = form.get("user_id", "")
            if error:
                return _redirect(_url(f"/admin/users/{user_id}", msg=error, level="bad"))
            try:
                user_id_int = int(user_id)
            except Exception:
                return _redirect(_url("/admin/users", msg="Некорректный user id.", level="bad"))
            if action == "freeze_user":
                reason = (form.get("reason") or "").strip()
                if not reason:
                    return _redirect(_url(f"/admin/users/{user_id}", msg="Freeze reason is required.", level="bad"))
                freeze_user(user_id_int, operator_id=operator_id, reason=reason)
                return _redirect(_url(f"/admin/users/{user_id}", msg="User frozen", level="ok"))
            if action == "unfreeze_user":
                resolved = unfreeze_user(user_id_int, operator_id=operator_id, reason=(form.get("reason") or "").strip() or None)
                level = "ok" if resolved else "warn"
                msg = "User unfrozen" if resolved else "No active frozen flags found"
                return _redirect(_url(f"/admin/users/{user_id}", msg=msg, level=level))
            if action == "add_flag":
                flag_type = (form.get("flag_type") or "").strip()
                if flag_type not in {value for value, _label in USER_FLAG_OPTIONS}:
                    return _redirect(_url(f"/admin/users/{user_id}", msg="Unsupported risk flag.", level="bad"))
                reason = (form.get("reason") or "").strip()
                if not reason:
                    return _redirect(_url(f"/admin/users/{user_id}", msg="Risk reason is required.", level="bad"))
                add_flag(user_id_int, flag_type, operator_id=operator_id, reason=reason)
                return _redirect(_url(f"/admin/users/{user_id}", msg=f"Flag {flag_type} added", level="ok"))
            if action == "resolve_flag":
                flag_id = (form.get("flag_id") or "").strip()
                if not flag_id:
                    return _redirect(_url(f"/admin/users/{user_id}", msg="flag_id is required.", level="bad"))
                ok = resolve_flag(flag_id, operator_id=operator_id, reason=(form.get("reason") or "").strip() or "resolved_from_admin_ui")
                return _redirect(_url(f"/admin/users/{user_id}", msg="Flag resolved" if ok else "Flag already resolved", level="ok" if ok else "warn"))
            if action == "adjust_balance":
                reason = (form.get("reason") or "").strip()
                if not reason:
                    return _redirect(_url(f"/admin/users/{user_id}", msg="Adjustment reason is required.", level="bad"))
                try:
                    amount = float(form.get("amount") or "")
                except Exception:
                    return _redirect(_url(f"/admin/users/{user_id}", msg="Некорректная сумма adjustment.", level="bad"))
                if amount == 0:
                    return _redirect(_url(f"/admin/users/{user_id}", msg="Amount must be non-zero.", level="bad"))
                result = manual_balance_adjustment(user_id_int, amount, operator_id=operator_id, reason=reason)
                return _result_redirect(f"/admin/users/{user_id}", result)

    if path in {"/admin", "/admin/"}:
        return 200, {}, _layout("Roll Duel — Overview", _overview_page(), current="overview", flash=flash)
    if path in {"/admin/liabilities", "/admin/liabilities/"}:
        return 200, {}, _layout("Roll Duel — Liabilities", _liabilities_page(), current="liabilities", flash=flash)
    if path == "/admin/withdrawals":
        return 200, {}, _layout("Roll Duel — Withdrawals", _withdrawals_page(query), current="withdrawals", flash=flash)
    if path in {"/admin/users", "/admin/users/"}:
        return 200, {}, _layout("Roll Duel — Users", _users_page(query), current="users", flash=flash)
    if path in {"/admin/risk", "/admin/risk/"}:
        return 200, {}, _layout("Roll Duel — Risk Queue", _risk_page(query), current="risk", flash=flash)
    if path in {"/admin/failed", "/admin/failed/"}:
        return 200, {}, _layout("Roll Duel — Failed Items", _failed_items_page(query), current="failed", flash=flash)
    if path.startswith("/admin/withdrawals/"):
        status_code, title, body_html = _withdrawal_detail_page(path.rsplit("/", 1)[-1])
        return status_code, {}, _layout(f"Roll Duel — {title}", body_html, current="withdrawals", flash=flash)
    if path in {"/admin/runtime", "/admin/settings"}:
        return 200, {}, _layout("Roll Duel — Runtime", _runtime_page(), current="runtime", flash=flash)
    if path == "/admin/audit":
        return 200, {}, _layout("Roll Duel — Audit", _audit_page(), current="audit", flash=flash)
    if path == "/admin/help":
        return 200, {}, _layout("Roll Duel — Help", _help_page(), current="help", flash=flash)
    if path.startswith("/admin/users/"):
        try:
            user_id = int(path.rsplit("/", 1)[-1])
        except Exception:
            return 404, {}, _layout("Invalid user", "<div class='panel'><div class='empty'>Некорректный user id.</div></div>", current="users", flash=flash)
        status_code, title, body_html = _user_page(user_id)
        return status_code, {}, _layout(f"Roll Duel — {title}", body_html, current="users", flash=flash)
    return 404, {}, _layout("Not found", "<div class='panel'><div class='empty'>Unknown admin route.</div></div>", flash=flash)
