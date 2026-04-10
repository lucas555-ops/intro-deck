# Roll Duel — Current State

## Project canon
- Brand: Roll Duel
- Preferred bot username: `@rollduelbot`
- User-facing game UI: English
- Admin/operator UI: Russian
- Product wording canon: Duel

## Canonical merged baseline
The project still uses one merged baseline with shared truth layers:
- `TDH-*` — backend / admin / runtime truth
- `RD-MA-*` — Mini App line
- `RD-BOT-*` — classic bot product line after the bot-first pivot

Shared truth that remains canonical:
- duel truth in `games` and settlement flows
- money truth in ledger / reservations / payment events / withdrawal requests
- referral truth
- workspace / group truth
- leaderboard truth
- publish truth
- webhook/runtime/operator truth

## Production/runtime state
- Postgres remains the intended primary production backend when `DATABASE_URL` is set.
- SQLite remains available for local/dev compatibility.
- Telegram production delivery can run via webhook with update dedupe in `telegram_updates`.
- Crypto Pay deposits remain webhook-first with reconciliation fallback.
- Durable runtime jobs remain in `runtime_jobs`.
- User text-prompt runtime states now persist in DB-backed `user_runtime_states` instead of process memory.
- Legacy invoice polling is now explicitly opt-in (`ENABLE_INVOICE_POLLING=0` by default).
- Operator web surface under `/admin` now has a first shell/control-plane foundation with Overview, Withdrawals, Users, Risk Queue, Failed Items, Runtime, Audit, and Help.
- Runtime page now uses a tolerant settings reader for Postgres JSONB/native values, adds safe fallback instead of a route-level crash, and exposes settings sanity/warning surfaces for operator diagnosis.
- Telegram now has a founder-first admin shortcut layer: founder-only `👑 Админка` button in the main menu when `ADMIN_CHAT_ID` is configured, `/admin` as the allowlist fallback command, and narrow Telegram operator shortcuts for Overview / Withdrawals / Runtime / Users / Liabilities / Help that point back to the same backend truth as web admin.
- Web admin now includes a dedicated Liabilities snapshot surface plus tighter operator alerts/receipts copy so treasury/liability visibility is no longer buried only inside overview cards.
- Failed Items desk now exposes narrow audited recovery actions: `Process now` for supported `invoice_paid` payment events, `Run timeout reconcile now` for stuck duels, and `Retry now` for failed runtime jobs via the canonical runtime queue.
- Broadcast delivery is now hardened beyond the initial foundation: deliveries persist attempt counters, `retry_pending` state, backoff-based retry timing, and manual operator `Retry failed` resume from Telegram admin instead of silently dying after the first failed send.

## Mini App state after RD-BOT-001
- Mini App code is still present in the repo and remains session-backed when explicitly enabled.
- Mini App runtime is now **quarantined behind an explicit `MINIAPP_RUNTIME_ENABLED=1` flag**.
- Default runtime keeps Mini App routes out of the active production surface.
- Mini App code is **not deleted**, but it is now a **frozen / dormant secondary surface**.
- Mini App is no longer the intended primary user path.
- New primary product work should not continue in `RD-MA-*` unless it is freeze maintenance or handoff cleanup.

Latest Mini App line status: frozen after `RD-MA-012.1`.

## Classic bot state after RD-BOT-001
- Classic Telegram bot is now the **primary product surface**.
- Main bot menu is bot-first and no longer promotes Mini App as the main path.
- Bot commands now expose the primary shell actions directly: start/menu/create/find/balance/profile/leaderboard/invite/groups/help/support.
- Leaderboard now renders inside the classic bot with `Global`, `Weekly`, and `This Chat` scopes.
- Profile, invite, balance, chats, and leaderboard surfaces all live in the bot.
- Group/workspace management and leaderboard publishing stay inside the classic bot surface.
- Published workspace/group CTA buttons now point back to the classic bot instead of forcing Mini App opens.
- `/app` remains only as an optional dormant-surface launcher.

Latest classic bot shell step: `RD-BOT-001 — Bot-First Shell + Mini App Freeze`.
Latest coordinated stabilization/admin pass: `TDH-ADMIN-001.2 + TDH-STAB-002.3 + RD-BOT-006.3.1`.
Latest product step: `RD-BOT-006.3.1 — Empty Giveaway Recovery + Terminal State Polish`.

## Practice Mode status
- Practice Mode is now live inside the classic bot.
- Demo balance is seeded on first use and is isolated from real TON balance.
- Practice duels use separate practice truth and never touch real ledger / withdrawals / leaderboard / workspace publishing.
- Practice Mode is intended for onboarding, testing, and safe product exploration without deposits.

## Workspace / leaderboard / publish status
- Secure group connect flow is live.
- Workspace truth is live with owner verification and per-group settings.
- `My Chats` now behaves as an owner-facing community surface rather than a raw foundation list.
- Workspace detail now includes live recheck / readiness signals for bot presence, owner admin status, and posting setup.
- Disconnect now uses an explicit confirmation step instead of an immediate destructive action.
- Leaderboard truth is live with Global / Weekly / This Chat scopes derived from canonical duel truth.
- Manual group leaderboard publishing is live with more honest recovery for rights/chat-availability failures.
- Main menu IA is now tighter: home focuses on play / money / profile / practice / chats, while `Invite Friends` and `Help` move under `Profile`.
- User-facing copy is cleaner across home, profile, leaderboard, practice, help, and invite surfaces, with less internal product wording and tighter naming.
- Invite flow is now Telegram-native: `Share invite` opens inline mode so the user can pick a chat and drop in a ready invite without generating clutter in the private bot chat first.
- Inline invite results now send a ready share card with embedded `Join Roll Duel` text plus a single inline URL button.
- `Show link` remains available as the raw-link fallback.
- `Get invite card` remains available as the forwardable bot-card fallback.
- Giveaway core foundation is now in place behind the bot/community layer: giveaways, entries, winners, and giveaway audit all exist as first-class workspace-bound truth.
- Giveaway core now enforces one active giveaway per workspace, separates entry from eligibility, and uses deterministic audited winner selection with atomic finalize.
- Giveaway operation model remains manual-first in this step.
- Owner/admin giveaway controls are now live inside `My Chats`: create draft, edit title/prize/winners/deadline, activate, end, draw winners, cancel, and mark results published.
- Giveaway detail now shows status-aware owner actions and basic stats: entries, eligible, ineligible, and winners selected.
- Giveaway deadline editing now includes quick presets (`1h`, `24h`, `3d`, `7d`) plus a custom UTC fallback.
- Group settings IA is tighter: readiness, giveaway, posting toggles, publish actions, and default-target controls are grouped more cleanly for faster owner scanning.
- Public giveaway publishing is now live: owners can publish the active giveaway into the connected group as a bot-authored post with a `Join Giveaway` CTA.
- Group participants can now join a live giveaway directly from the group post, with honest `joined / already joined / closed / unavailable` outcomes.
- Giveaway result publishing is now live: after owner draw, the bot can publish a result post back into the group and mark the giveaway as `RESULTS_PUBLISHED`.
- Empty giveaway recovery is now covered: if a round ends with zero entries, the owner sees `Publish no-winner result` or `Cancel empty giveaway` instead of a dead-end draw path.
- Terminal giveaway states now cleanly unlock `Create next giveaway`, so a failed/empty round no longer traps the workspace in a half-finished state.
- Giveaway live/result posts remain manual-first in this step; there is still no cron-first or channel-first operating model.
- Channel-mode remains evaluation-only.
- Auto scheduler / cron publishing remains deferred.






## TDH-ADMIN-001.2 — Risk Queue + Failed Items Desk
- `/admin/risk` is now a first-class admin section for active risk triage with bounded paging, filter pills, and direct links into the full User Card
- Risk Queue now summarizes active flags, manual review load, withdrawal-blocked flags, and frozen users without duplicating the write-actions already centralized in User Card
- `/admin/failed` is now a bounded failed-items desk for failed withdrawals, unprocessed payment events, stuck duels, and runtime jobs with `last_error`
- Failed Items stays read-first and links operators back into the existing truth-specific desks instead of duplicating recovery logic in the UI
- admin shell/sidebar and help guidance now include Risk Queue and Failed Items as explicit operator sections

## TDH-ADMIN-001.1 — Users List + User Card
- `/admin/users` is now a first-class admin section with bounded user list paging, filter pills, and direct search by user id / username / first name
- User Card is now a real operator hub instead of read-only support context: summary, risk flags, recent withdrawals, recent deposits, recent duels, and recent operator actions
- user write-actions are now live through the existing audit-safe service layer: freeze, unfreeze, add risk flag, resolve risk flag, and manual balance adjustment via ledger effect
- each user write-action now requires confirm and redirects back into a fresh backend reread of the same User Card
- Users is now a real shell section in the admin sidebar instead of a hidden detail-only route

## TDH-ADMIN-001 — Web Operator Control Plane Foundation
- `/admin` is now a real web operator shell with sidebar navigation and a tighter IA: Overview, Withdrawals, Runtime, Audit, Help
- Overview now groups live backend truth into summary cards plus recent withdrawals and recent audit
- Withdrawals now have bounded queue navigation, status/review filters, and clearer detail cards
- Withdrawal Card now uses confirm guards for money-critical state transitions and rereads backend truth after each action
- Runtime page now focuses on safe DB-backed kill switches and read-only limits summary instead of exposing a broad settings editor
- Audit page is now a tighter recent-actions surface tied to the same backend/operator truth
- User write-actions are intentionally deferred from the web surface in this step; linked user cards remain read-only support context only

## TDH-STAB-002.3 — Giveaway Correctness & Query Hygiene Pack
- giveaway draw guard now allows winner selection only from `ENDED`, removing a misleading dead branch around `WINNERS_DRAWN`
- giveaway core updates now validate patch keys against an explicit editable-column allowlist before building the SQL `SET` clause
- giveaway entry upsert now uses one shared `ON CONFLICT` path instead of a duplicate Postgres/SQLite split
- public entry listing helpers now default to capped reads with optional `limit` / `offset` pagination to avoid unbounded fetch-all behavior
- real duel leave flow now clears local timer references for both players, closing the remaining in-memory timer leak on manual exit
- release artifacts are now packaged without `__pycache__` / `*.pyc` clutter

## TDH-STAB-002.2 — Callback/Admin Guard Refactor Hardening
- admin-sensitive callback routing now goes through a dedicated dispatch layer (`ADMIN_CALLBACK_EXACT_HANDLERS` / prefix handlers) instead of living inline inside the main callback god-function
- admin callback access is now centralized behind `@require_admin_callback` so sensitive branches stop relying on scattered per-branch `ADMIN_IDS` checks
- `/panel` command now uses the same centralized admin gate via `@require_admin_command`
- DB-backed admin runtime states (`admin_waiting_user_id`, `admin_waiting_balance_*`, `admin_waiting_broadcast`) now re-check admin access before executing, so stale or forged state cannot drive operator actions
- admin settings rendering now reads from the settings service truth (`duels_enabled`, `withdrawals_enabled`) instead of ad hoc callback-local lookups
- the main callback handler is still broad overall, but the highest-risk operator callbacks are now split out and guarded consistently

## TDH-STAB-002.1 — Financial Guard Hardening
- risk checks for money-critical reserve paths now have an in-transaction variant: `risk.can_user_perform_in_tx(conn, user_id, action)`
- withdrawal request creation now checks risk flags and manual-review flags inside the same transaction that reserves balance
- duel create/join reserve paths now check duel-blocking risk flags inside the same transaction that validates balance and creates the reservation
- the narrow hardening goal in this step is to reduce TOCTOU windows between risk checks and reserve/commit on real-money paths without broad handler rewrites

## Branching status
- `TDH-*` remains the backend/admin/runtime line.
- `RD-MA-*` is now the frozen Mini App line.
- `RD-BOT-*` is now the primary classic bot product line.

## Next recommended step
- `TDH-ADMIN-001.6.1 — Broadcast delivery hardening / retry polish`
- then `TDH-LIVE-001 — live deposit / real-duel / withdraw verification when TON is available`
- then `RD-BOT-006.3.2 — live Telegram smoke for public giveaway loop + narrow hotfixes`
- keep giveaway manual-first until owner/public flows are live-certified
- keep practice mode bot-first and isolated from real economy / leaderboard / workspace publish
- keep Mini App frozen and runtime-disabled by default except for narrow maintenance only
- keep full channel-mode deferred until community flows are live-certified


## RD-BOT-002.1 — Practice Mode Smoke-Polish Hotfix Pass

### Goal
Tighten the bot-first practice loop after the first real Telegram pass without expanding scope.

### Shipped
- practice-lobby keyboard now includes an explicit refresh action;
- created practice duel screen now includes a direct lobby refresh path;
- insufficient demo-balance state now shows the user’s current practice balance and routes to the practice-balance surface instead of a generic back path;
- unavailable / failed practice-join states now route back into practice surfaces instead of generic bot back paths;
- leaving an active practice duel now returns the player to the Practice Mode menu instead of the generic main menu;
- practice-mode copy now better reinforces Demo TON isolation and the intended create → join → roll → result learning loop.

### Explicit non-goals
- live deploy smoke from this environment;
- practice reset economy;
- practice leaderboard;
- practice group publishing;
- giveaway coupling.


## RD-BOT-003 — Real Mode Readiness + First Deposit Funnel
- balance surface now separates real TON from practice Demo TON
- practice surfaces now expose direct CTAs into real mode (`Start Real Duel`, `Open Real Balance`)
- insufficient real balance now routes to a dedicated deposit/practice recovery screen instead of a dead-end error
- deposit / withdrawal prompts now show the current real balance and keep the funnel bot-first


## RD-BOT-004 — Duel History + Profile Strength + Bot-Native Share Polish
- classic bot now exposes `My Duels` as a real history surface instead of a placeholder
- profile now shows stronger real-mode stats: total duels, wins/losses/draws, win rate, current/best streak, TON won, and invite count
- invite surface now includes a bot-native share action via Telegram share URL
- newly created open real duels now expose a share-duel action from the waiting room screen
- finished real duel messages now expose a share-result action and direct links into `My Duels` / next duel creation
- history keeps practice visible with a clear badge while real profile stats remain isolated from practice truth
