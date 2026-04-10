# TDH Work History

## TDH-001 — Security + Money Truth Skeleton

### Goal
Harden the bot around secrets, money truth and idempotent settlement without broad product rewrites.

### Delivered
- repo hygiene: `.env` removed, `.env.example` added, `.gitignore` added;
- `database.py` upgraded with truth-layer schema and snapshot sync;
- new service layer for ledger / games / payments / withdrawals / idempotency;
- handlers moved off direct balance mutation for create/join/settle/deposit/withdraw;
- webhook adapter skeletons added for Telegram and Crypto Pay;
- bootstrap and dependency files normalized.

### Not delivered
- live webhook server;
- Postgres runtime;
- web admin UI;
- new gameplay modes.

## TDH-002 — Postgres + Webhook Runtime Hardening

### Goal
Move Roll Duel from a local-compatible runtime to a durable production-shaped runtime without wide gameplay rewrites.

### Delivered
- `database.py` now supports Postgres primary runtime with SQLite fallback;
- new `telegram_updates` and `runtime_jobs` tables added;
- webhook runtime server added in `infra/runtime.py` with health/readiness endpoints;
- Telegram webhook dispatch now verifies secret header and deduplicates by `update_id`;
- Crypto Pay webhook now verifies signature and processes invoice-paid events through the service layer;
- new reconciliation worker added for duel timeout, invoice, and withdrawal recovery;
- game creation/joining now schedules durable timeout jobs;
- withdrawal and invoice flows now schedule reconcile jobs.

### Not delivered
- operator web control plane;
- full alerting/observability stack;
- richer risk desk and manual queues beyond basic data structures.


## TDH-003 — Operator Truth + Controls

### Goal
Add the minimum operator truth/control layer required to run Roll Duel without blind SQL/manual money handling.

### Delivered
- DB-backed operator truth tables: `platform_settings`, `user_risk_flags`, `operator_actions`;
- lightweight operator web surface under `/admin` with basic auth;
- dashboard, withdrawals queue/card, users list/card, settings, audit, failed items, liabilities snapshot;
- settings service with kill-switches and legacy compatibility sync;
- risk service with freeze/block/manual review support;
- audited operator actions for withdrawal review, settings changes, risk changes, balance adjustments;
- withdrawal flow moved to queue-first operator processing model;
- user-facing create/join/deposit/withdraw flows now respect maintenance/risk/settings checks.

### Not delivered
- polished full web-admin shell;
- advanced cohort analytics / broadcasts / support desk;
- multi-role approvals;
- Telegram admin shortcut layer for alerts/actions.


## RD-MA-002 reconciliation note
- Completed Mini App milestone `RD-MA-001` was merged back into the canonical project baseline.
- TDH backend/admin/runtime truth remains the source of truth for payments, operator controls, risk and deployment.
- No separate parallel backend branch should be maintained after this reconciliation point.


## TDH-STAB-001 — Runtime Stabilization Pass

### Goal
Close runtime/deploy P0 risks for the bot-first baseline without adding new product features.

### Shipped
- startup now reapplies idempotent SQL migration files in `storage/migrations` for Postgres boot reconciliation;
- polling-mode bot surface setup and fallback invoice poller were moved into an application priming step instead of pre-run task scheduling;
- webhook runtime shutdown now cancels the fallback invoice poller cleanly when present;
- docs synced to reflect the coordinated stabilization pass.

### Explicit non-goals
- new money features;
- new admin surfaces;
- new gameplay modes.


## TDH-STAB-002 — Runtime Hardening Pack

### Goal
Close the remaining webhook/runtime footguns without broad product rewrites.

### Delivered
- user prompt/runtime state is now persisted in DB-backed `user_runtime_states` instead of the process-local `user_states` dict;
- scheduler startup moved off module import side effects and into controlled application init/shutdown hooks;
- local timer references are now cleaned up through shared helpers after cancel/settle/timeout paths;
- legacy invoice polling is now explicitly opt-in with a unified default of `ENABLE_INVOICE_POLLING=0`;
- Mini App runtime is now quarantined behind explicit `MINIAPP_RUNTIME_ENABLED=1` instead of being active by default in the bot-first baseline;
- docs and env examples synced to the hardened runtime truth.

### Explicit non-goals
- full callback dispatch refactor;
- financial guard in-transaction redesign;
- removing Mini App code from the repo entirely;
- broad database.py rewrite.


## TDH-STAB-002.1 — Financial Guard Hardening

### Goal
Close the most important remaining TOCTOU window on money-critical reserve paths without broad handler or database rewrites.

### Delivered
- added `risk.can_user_perform_in_tx(conn, user_id, action)` and `risk.has_active_flag_in_tx(...)` for same-transaction risk checks;
- withdrawal request creation now checks blocking flags inside the reservation transaction instead of on a separate preflight connection;
- withdrawal manual-review flag detection now also runs inside the same transaction;
- duel create/join reservation paths now run duel-blocking risk checks inside the same transaction that validates balance and writes reservations;
- docs synced to reflect the narrower financial guard hardening pass.

### Explicit non-goals
- full callback dispatch refactor;
- blanket exception cleanup across all handlers;
- broad database.py redesign;
- deposit-credit policy redesign for already-paid invoices;
- admin decorator rollout.

## TDH-STAB-002.2 — Callback/Admin Guard Refactor Hardening

### Goal
Narrow the highest-risk operator callback surface by pulling admin actions behind one dispatcher and one guard model, without rewriting the whole bot callback shell.

### Delivered
- added a dedicated admin callback routing layer with exact and prefix dispatch tables for operator actions;
- introduced `@require_admin_callback` so admin callbacks now share one centralized guard instead of repeating per-branch `ADMIN_IDS` checks;
- introduced `@require_admin_command` so `/panel` uses the same admin gate model as callback entrypoints;
- moved admin callback actions out of the main callback branch chain into dedicated handler functions for panel, user lookup, balance, risk/block, settings, bulk cancel, export, and broadcast entrypoints;
- hardened DB-backed admin runtime states so non-admin users cannot execute `admin_waiting_*` flows even if a stale/forged state key exists;
- synced current-state docs to the narrowed callback/admin hardening truth.

### Explicit non-goals
- full callback rewrite for every product/user branch;
- operator web-admin redesign;
- role model expansion beyond current admin IDs;
- broader runtime or database refactors outside the admin callback surface.



## TDH-STAB-002.3 — Giveaway Correctness & Query Hygiene Pack

### Goal
Close the narrow post-audit giveaway/runtime correctness findings without reopening the broader callback or product surfaces.

### Delivered
- tightened giveaway draw status gating so winner selection only starts from `ENDED`;
- added an explicit editable-column allowlist before dynamic giveaway update SQL is assembled;
- removed the duplicate Postgres/SQLite branch in giveaway entry upsert and kept one shared `ON CONFLICT` path;
- added capped/paged entry listing helpers via `limit` / `offset` to avoid unbounded giveaway entry fetches;
- fixed the remaining local timer cleanup gap on real duel manual-leave so both players' timer references are cleared;
- cleaned release packaging to exclude `__pycache__` and `*.pyc` files from shipped artifacts;
- synced current-state and roadmap docs to the narrowed hardening truth.

### Explicit non-goals
- new giveaway product features;
- broader callback rewrite beyond `TDH-STAB-002.2`;
- database schema changes for giveaway pagination;
- cron/automation expansion for giveaway operations.

## TDH-ADMIN-001 — Web Operator Control Plane Foundation

### Goal
Turn the lightweight `/admin` surface into a first real web control plane for operator truth without exploding into a broad redesign or reopening user/risk desks in one step.

### Delivered
- rebuilt `/admin` into a shell/sidebar surface with tighter IA: Overview, Withdrawals, Runtime, Audit, Help;
- added overview summary cards, recent withdrawals, and recent audit on one first operator landing page;
- added bounded withdrawals queue paging/filtering with status/review filters;
- tightened withdrawal detail into a clearer card with confirm-guarded operator actions and backend reread after each write;
- narrowed runtime/settings into safe DB-backed kill switches plus a read-only limits summary instead of a wide free-form editor;
- kept linked user cards as read-only support context and intentionally deferred user write-actions to the next step;
- passed admin query-string handling through the runtime layer so filtered queue navigation works cleanly.

### Explicit non-goals
- Users List / User Card as a first-class admin section;
- risk queue / failed desk / liabilities workspace;
- broad admin redesign or multi-role auth expansion;
- bot-admin parity;
- free-form policy/pricing editors in web admin.



## TDH-ADMIN-001.1 — Users List + User Card

### Goal
Turn the hidden read-only user detail route into a first-class operator desk with a bounded Users List, a full User Card, and audit-safe user actions — without broadening into bulk tooling or a wider risk workspace.

### Delivered
- added `/admin/users` as a real sidebar section with bounded paging, search by id / username / first name, and practical filter pills;
- upgraded User Card from read-only support context into a first-class operator hub with summary, active risk flags, recent withdrawals, deposits, duels, and operator actions;
- enabled audit-safe user write-actions via the existing service layer: freeze, unfreeze, add risk flag, resolve risk flag, and manual balance adjustment through a ledger effect;
- required confirm for every user write-action and redirected back into a fresh backend reread after mutation;
- kept the step narrow by avoiding bulk actions, broad risk desks, or pricing/policy editors;
- synced current-state and roadmap docs to the new admin surface truth.

### Explicit non-goals
- Risk Queue / Failed Items desk;
- bulk operator actions;
- multi-role auth redesign;
- bot-admin parity;
- broad admin UI polish beyond the Users surface.




## TDH-ADMIN-001.5 — Failed/Runtime recovery actions (narrow)

### Goal
Add the smallest useful operator recovery actions for failed/runtime tails without turning Failed Items into a second full control plane.

### Delivered
- added audited `Process now` recovery for supported unprocessed `invoice_paid` payment events, reusing the canonical invoice credit/apply path instead of a UI-only shortcut;
- added audited `Run timeout reconcile now` for stuck duels, reusing the existing timeout reconcile truth;
- added audited `Retry now` for failed runtime jobs, which requeues the existing job into the canonical runtime queue instead of inventing a second execution path;
- upgraded `/admin/failed` from read-only desk into a narrow recovery desk with confirm guards and reason fields for the supported cases;
- kept failed withdrawals as handoff-first into Withdrawal Card to avoid reopening unsafe retry semantics after funds may already have been released.

### Explicit non-goals
- bulk recovery actions;
- free-form runtime job editing;
- provider-specific recovery consoles;
- new money-critical Telegram write-actions;
- broad redesign of Failed Items or Runtime.

## TDH-ADMIN-001.2 — Risk Queue + Failed Items Desk

### Goal
Add the missing Wave 2 operator triage surfaces to the web admin without reopening new money logic or duplicating recovery actions across UI layers.

### Delivered
- added `/admin/risk` as a first-class sidebar section with bounded paging, filter pills, active-flag summary cards, and direct links into audited User Card actions;
- added `/admin/failed` as a bounded failed-items desk for failed withdrawals, unprocessed payment events, stuck duels, and runtime jobs with `last_error`;
- kept Risk Queue and Failed Items read-first so operators still execute write-actions in the existing truth-specific surfaces instead of duplicating recovery logic in the desk itself;
- updated admin help copy and current-state docs so the operator shell now explicitly includes Overview, Withdrawals, Users, Risk Queue, Failed Items, Runtime, Audit, Help.

### Explicit non-goals
- liabilities snapshot or broader treasury analytics;
- Telegram admin shortcut parity;
- new recovery mutations for payment events, runtime jobs, or duel settlement;
- broad admin redesign or multi-role auth expansion.


## TDH-ADMIN-001.2.1 — Runtime Page Hotfix

### Goal
Unblock `/admin/runtime` in production after the route proved brittle against Postgres JSONB/native return types, while keeping the fix narrow and operator-safe.

### Delivered
- made the settings reader tolerant to both JSON-text payloads and database-driver-native JSON values such as `bool`, `int`, `float`, `list`, and `dict`;
- fixed `settings.get_setting(...)` and `settings.snapshot(...)` so backend/runtime truth no longer silently degrades or crashes on native JSON rows;
- added a safe runtime fallback path so `/admin/runtime` still renders even if one or more settings rows are malformed;
- added warning and settings-sanity surfaces on the Runtime page so operators can see malformed rows / fallback mode without digging straight into logs;
- kept the hotfix narrow: no auth changes, no new write-actions, no broad runtime/job recovery work.

### Explicit non-goals
- fixing stuck runtime jobs or reconciliation retries;
- broad settings-editor expansion;
- Telegram admin shortcuts;
- liabilities/treasury wave.


## TDH-ADMIN-001.3 — Telegram Admin Shortcuts Foundation

### Goal
Add the missing Telegram-side founder/operator shortcut layer on top of the new web control plane without moving the whole admin truth into Telegram.

### Delivered
- added founder-first `👑 Админка` visibility in the classic bot main menu when `ADMIN_CHAT_ID` is configured, with fallback to the broader admin allowlist if founder id is not set;
- added `/admin` as the operator fallback command while keeping the existing guarded legacy command alias for continuity;
- rebuilt the Telegram admin entry surface into a narrow shortcut layer: Overview, Withdrawals, Runtime, Users, Help, plus direct open-web-admin handoff when `APP_BASE_URL` is available;
- wired Telegram shortcuts to the same backend/admin read models already used by web admin, so Overview / Withdrawals / Runtime snapshots reread canonical truth instead of inventing bot-only state;
- kept money-critical write-actions and heavy control-plane editing in web admin, preserving Telegram as a fast operator layer rather than a second full admin surface;
- synced current-state and roadmap docs to the hybrid operator model.

### Explicit non-goals
- full web-admin parity inside Telegram;
- kill-switch editing or money-critical state transitions from the Telegram shortcut layer;
- multi-role access redesign beyond founder/operator allowlists;
- migrating the full control plane out of web admin.


## TDH-ADMIN-001.4 — Liabilities Snapshot + Alerts/Receipts Polish

### Goal
Tighten operator visibility after the first hybrid web+Telegram admin rollout by adding a dedicated liabilities snapshot and polishing the alerts/receipts layer, without reopening broad write-actions or redesign work.

### Delivered
- added a dedicated `/admin/liabilities` surface plus Overview-level liabilities block so treasury / liability / inflight outflow truth is visible in one place;
- expanded admin read models with treasury balance/profit, pending deposit amount, customer liability, net exposure, treasury-vs-inflight buffer, and derived operator alerts/handoffs;
- added operator alerts panels and recommended handoffs in web admin so Risk / Failed / Withdrawals / Runtime desks are easier to reach from the right context;
- upgraded Telegram admin shortcuts with a new `Liabilities` section and tighter receipt-style copy across Overview / Withdrawals / Runtime / Help;
- improved Telegram user lookup into a more useful receipt with direct handoff toward the web User Card instead of a thin legacy text dump;
- kept heavy write-actions in web admin and preserved Telegram as a narrow operator layer over the same backend truth.

### Explicit non-goals
- new money-critical write paths in Telegram;
- broad admin redesign or multi-role auth expansion;
- failed/runtime recovery mutations beyond read-first visibility and handoff polish;
- reopening product-surface work in RD-BOT or Mini App lines.


## TDH-ADMIN-001.6 — Telegram Broadcast + System Notice Foundation

### Goal
Add a narrow comms layer to Telegram admin: active push via Broadcast and passive versioned user messaging via System Notice, without turning Telegram into a second full control plane.

### Delivered
- replaced the legacy unsafe `admin_waiting_broadcast` flow with DB-backed `broadcasts` + `broadcast_deliveries` truth, draft/edit/preview/launch/stop flow, and scheduler-driven delivery batches;
- added `system_notices` + `user_notice_seen` truth for versioned passive notices with target, severity, CTA, expiry, publish/deactivate, and user-side `📣 Current Notice` entry in the main menu when a notice matches the user;
- extended Telegram admin with `Broadcasts` and `Notice` sections while keeping heavy control-plane edits in web admin;
- added shared comms visibility to web admin Overview so Telegram and web read the same backend state for current notice and recent broadcasts;
- kept v1 narrow: text-only broadcast/notice content, bounded audience presets, no channel/group campaigns, no heavy CRM layer.

### Explicit non-goals
- media-rich campaigns or deep personalization;
- group/channel broadcasting;
- broad retry studio / delivery debugger;
- moving the full comms control plane into web or Telegram alone.


## TDH-ADMIN-001.6.1 — Broadcast delivery hardening / retry polish

### Goal
Harden the new Broadcast delivery layer so failed recipients do not silently become terminal dead rows after the first send attempt, while keeping the comms subsystem narrow and production-safe.

### Delivered
- added persisted delivery attempt counters, `retry_pending` delivery state, `last_attempt_at`, `next_retry_at`, and `delivered_at` fields for broadcast deliveries;
- added retry/backoff-based delivery flow so temporary delivery failures stay in backend truth and are retried by the scheduler instead of being treated as permanently done;
- refreshed broadcast counters from delivery truth so `sent` / `failed` no longer drift from the actual delivery table after retries;
- added manual operator `Retry failed` action in Telegram admin broadcast detail so founder/operator can reopen failed or retry-pending deliveries without editing DB rows by hand;
- tightened Telegram and web operator visibility to show retry-pending delivery pressure alongside sent/failed counters;
- kept the step narrow: no media campaigns, no new audience segmentation, no full delivery-debugger UI.

### Explicit non-goals
- deep campaign analytics;
- channel/group broadcasting;
- broad comms CRM;
- live-money verification or RD-BOT product work.
