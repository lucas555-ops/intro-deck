# Roll Duel — Current State

## Project canon
- Brand: Roll Duel
- Preferred bot username: `@rollduelbot`
- User-facing game UI: English
- Admin/operator UI: Russian
- Product wording canon: Duel

## Current workstream split
- `TDH-*` — backend/admin/runtime truth
- `RD-MA-*` — frozen Mini App line
- `RD-BOT-*` — primary classic bot product line

## First truth
The project still uses one merged baseline with shared truth layers. The pivot changed the **primary surface**, not the backend truth.

Shared canonical truth still includes:
- duel engine
- ledger / reservations / payments / withdrawals
- referrals
- workspaces/groups
- leaderboards
- workspace publishing
- runtime/webhook/operator layers

## Mini App status
- Mini App still exists under `/app` and `/api/miniapp/*`.
- It is now a **frozen / dormant secondary surface**.
- Do not treat Mini App as the primary product path anymore.

## Classic bot status
- Classic bot is now the **primary product surface**.
- Main shell actions now live in the bot.
- Leaderboard now renders inside the bot.
- Workspace management and manual leaderboard publishing remain in the bot.

Latest primary steps:
- **`TDH-STAB-001 + RD-BOT-001.1`**
- **`RD-BOT-002 — Practice Mode / Demo Duels Foundation`**
- **`RD-BOT-002.1 — Practice Mode smoke-polish hotfix pass`**
- **`RD-BOT-003 — Real Mode Readiness + First Deposit Funnel`**
- **`RD-BOT-004 — Duel History + Profile Strength + Bot-Native Share Polish`**
- **`RD-BOT-005 — Community polish / My Chats owner surface`**
- **`RD-BOT-005.2.4 — Inline share invite flow (primary) + link/card fallbacks`**
- **`RD-BOT-006.1 — Giveaway Core Foundation`**
- **`RD-BOT-006.2 / 006.2.1 — Owner Giveaway Bot Flows + polish`**
- **`RD-BOT-006.3 / 006.3.1 — Public Join + Result Publish + Empty Giveaway Recovery`**
- **`TDH-STAB-002 — Runtime Hardening Pack`**
- **`TDH-STAB-002.1 — Financial Guard Hardening`**
- **`TDH-STAB-002.2 — Callback/Admin Guard Refactor Hardening`**
- **`TDH-STAB-002.3 — Giveaway Correctness & Query Hygiene Pack`**
- **`TDH-ADMIN-001 — Web Operator Control Plane Foundation`**
- **`TDH-ADMIN-001.1 — Users List + User Card`**
- **`TDH-ADMIN-001.2 — Risk Queue + Failed Items Desk`**
- **`TDH-ADMIN-001.2.1 — Runtime Page Hotfix`**
- **`TDH-ADMIN-001.3 — Telegram Admin Shortcuts Foundation`**
- **`TDH-ADMIN-001.4 — Liabilities Snapshot + Alerts/Receipts Polish`**
- **`TDH-ADMIN-001.5 — Failed/Runtime recovery actions (narrow)`**
- **`TDH-ADMIN-001.6 — Telegram Broadcast + System Notice Foundation`**
- **`TDH-ADMIN-001.6.1 — Broadcast delivery hardening / retry polish`**

## Next likely steps
- **Admin/runtime:** `TDH-LIVE-001 — live deposit / real-money duel / withdraw verification`
- **Product:** `RD-BOT-006.3.2 — live Telegram smoke for public giveaway loop + narrow hotfixes`


## Runtime admin note
- `/admin/runtime` now uses a tolerant settings reader for Postgres JSONB/native values and no longer crashes when settings rows are returned as native booleans/numbers instead of JSON text.
- Runtime page now falls back safely and shows warning/sanity surfaces if settings rows are malformed.

## Admin/operator surface status
- Web admin remains the full control plane under `/admin`.
- Founder-first `👑 Админка` visibility now exists in the classic bot main menu when `ADMIN_CHAT_ID` is configured.
- `/admin` is now the allowlist fallback command for Telegram operator entry.
- Telegram admin now stays intentionally narrow: Overview, Withdrawals, Runtime, Users, Help, plus handoff into web admin.
- Failed Items in web admin now includes narrow recovery actions for supported `invoice_paid` payment events, stuck duel timeout reconciliation, and runtime-job requeue/retry without creating a second control plane.


## Comms admin note
- Telegram admin now includes `Broadcasts` and `Notice` as two separate comms primitives: active push via DB-backed broadcast drafts + delivery tick, and passive versioned system notices with user-side `📣 Current Notice` entry.
- Web admin Overview now surfaces current broadcast/notice state so Telegram and web continue to reread the same backend truth.
- Broadcast delivery now keeps persisted attempt counts, `retry_pending` rows, retry backoff timing, and manual `Retry failed` operator resume instead of treating any failed recipient as terminal with no retry path.
