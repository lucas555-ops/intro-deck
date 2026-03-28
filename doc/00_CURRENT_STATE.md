# 00_CURRENT_STATE

## Snapshot

- Project: LinkedIn Telegram Directory Bot
- Current STEP: STEP033
- Phase: live user-product baseline plus operator communications and intro/delivery operator baseline
- Primary mode: Telegram SaaS / Bot + product hardening
- Secondary mode: Docs / Handoff discipline
- Runtime status: working source baseline with LinkedIn auth, persistence, in-Telegram profile completion, curated skill selection, public browse, intro inbox/detail, notification retry diagnostics, LinkedIn relink transfer flow, operator admin shell, operator Users + User Card, and a first Communications layer with Notice / Broadcast / Outbox; still needs live re-deploy to confirm STEP033 in production

## Audit status

- Syntax check: ready to run in-repo
- Smoke suite: expanded with oauth-route, bot-init, product-surface, admin-shell, admin-users, admin-user-card, notice, broadcast, outbox, admin-intros, and admin-delivery contracts
- Docs link scan: updated through STEP033 continuity
- Live deployment proof: not refreshed from this repo snapshot

## What exists now

- Telegram `/start` home surface
- Telegram `/menu`, `/help`, `/profile`, `/browse`, and `/inbox` command entrypoints with state-based CTA ordering
- LinkedIn OAuth start endpoint with friendly browser-facing failure page
- LinkedIn OAuth callback endpoint with friendly browser-facing completion/failure pages
- OIDC discovery + state signing + token exchange + ID token validation + userinfo fallback
- health endpoint
- Telegram webhook ingress with fail-closed secret-token guard
- PostgreSQL persistence
- `users` upsert on Telegram touch
- `linkedin_accounts` upsert on callback
- `member_profiles` hidden draft creation on first successful LinkedIn connect
- profile snapshot read path for home surface
- in-Telegram profile editor menu
- profile preview surface
- edit sessions for text-field completion flow
- curated skills selection surface with inline toggle callbacks
- public directory list for `listed + active` profiles
- public profile card surface with page-preserving back path
- outbound action row on public profile cards for intro-request creation, with public LinkedIn URL gated by contact contract rules
- intro request persistence table and repo/storage wiring
- intro inbox surface with row-level received/sent items
- inbox row actions for `Open profile`, real `Accept` / `Decline` decisions, and decision-aware contact buttons
- persisted directory filter sessions per Telegram user
- directory filters surface with text query, city, single-choice industry bucket, and multi-select skills narrowing
- pending filter input mode for Telegram text-entry search/city updates
- filtered public browse output with explicit empty state and profile-aware CTA uplift
- DB-backed runtime guard layer for duplicate webhook `update_id` receipts and short-lived intro send/decision throttles
- intro history keeps sender/target snapshots on `intro_requests` and uses `ON DELETE SET NULL`, so surviving participants can still see archived intro history if related users/profiles are later removed
- bot runtime split into dedicated composers plus shared surface builders and bot utility modules
- data layer split between profile truth and directory browse/search/filter SQL
- notification / receipt layer with best-effort Telegram service messages for intro create / accept / decline events
- notification retry baseline with attempt counters, next-at scheduling, and a protected retry endpoint
- notification receipt diagnostics surface with protected read-only recent history, operator bucket counts, and per-intro drilldown summary
- operator admin shell inside Telegram via `/ops` with Admin / Operations / Communications / System hubs
- operator Users list with segments, pagination, and compact row summaries
- operator User Card with listing controls, public-card preview, note flow, and message entrypoint scaffold
- singleton operator Notice with activate / disable flow and audience targeting
- operator Broadcast draft with audience selection, preview, confirm-send, and bounded delivery through Telegram
- operator Outbox with notice/broadcast history and per-record drilldown
- operator Intros board with segment filters and Intro Detail drilldown
- operator Delivery board with segment filters and Delivery Detail drilldown
- active operator Notice can appear on user home and profile hub when the audience matches
- protected retry diagnostics surface still available for operators from the System section and legacy `ops:*` callbacks
- public command layer now supports `/start`, `/menu`, `/help`, `/profile`, `/browse`, and `/inbox` as real entrypoints
- public root landing page, privacy policy page, and terms-of-use page
- deploy-stable Node 20.x / root `.npmrc` / public npm lockfile baseline
- migration `012_profile_edit_sessions_linkedin_url_field_key.sql` for `field_key = 'li'`
- migration `013_admin_user_notes.sql` for operator notes
- migration `014_admin_communications_baseline.sql` for notice, broadcast draft, outbox, and communications input sessions
- STEP031 is code-only and does not add a new migration

## What is intentionally still missing

- intro request message body contract
- intro reply / chat flow
- ranking or relevance scoring
- advanced search syntax
- premium logic
- end-user notification center
- resend / requeue mutations from operator diagnostics
- direct 1:1 operator message send flow from User Card
- Directory quality board and Audit detail admin read surfaces
- migration runner / deploy automation
- direct resend / repair actions from delivery detail
- production observability beyond `/api/health`
- custom domain and dedicated support/contact email

## Current truth

- LinkedIn login is identity bootstrap, not full professional profile import
- OIDC fields remain the only guaranteed auto-import layer
- DB persistence is real when `DATABASE_URL` is configured
- Telegram webhook ingress fails closed when `TELEGRAM_WEBHOOK_SECRET` is missing or mismatched
- profile completion is real inside Telegram for text fields and curated skills
- public browse only shows profiles that are both `listed` and `active`
- text query and city narrowing exist, but this is still not a ranked search engine
- intro requests, accept/decline decisions, and decision-aware detail/contact surfaces persist in DB, but reply/chat flows are still intentionally missing
- durable notification receipt truth and DB-backed retry truth remain intact
- operator admin shell stays allowlisted and retry diagnostics remain read-only
- STEP024.8 fixed OAuth route import drift
- STEP024.9 reconciled repo/docs/smoke continuity gaps
- STEP025 added the required schema migration for LinkedIn URL edit sessions
- STEP026.2 is the reconciled self-contained baseline: it carries forward STEP024.8, STEP024.9, STEP025, STEP026, and STEP026.1 so the product-surface polish, OAuth import fix, schema continuity, and render-export compatibility live in one deployable source state
- STEP028 added the first operator admin shell with a clean `adm:` callback namespace and kept retry diagnostics nested under the new System section
- STEP029 added Users + User Card, listing controls, and DB-backed operator notes on top of the STEP028 admin shell
- STEP030 adds the first operator communications layer with singleton Notice, bounded Broadcast, Outbox history, and user-facing notice rendering on selected surfaces
- STEP031 adds operator Intros + Delivery read surfaces with intro board/detail, delivery board/detail, and drilldown into sender/recipient user cards

## What must not break

- official-only LinkedIn auth baseline
- Telegram webhook secret guard
- async `createBot()` + awaited `bot.init()` contract
- awaited `createBot()` before webhook `handleUpdate()`
- listed/active visibility truth for public browse
- durable intro request persistence and dedupe
- privacy-first contact unlock rules
- durable notification receipt truth and retry truth
- operator allowlist gating for diagnostics and admin surfaces
- docs canon continuity between current state, handoff, and feature baselines
- profile edit-session schema acceptance for `li`
- admin note and communications migrations when those features are used live

## Next recommended step

- STEP032 — Directory quality board + Audit detail on top of the STEP031 operator baseline


## STEP032 delta
- Adds operator `Quality` board under Operations.
- Adds operator `Audit` list/detail under System.
- Adds DB migration `015_admin_audit_events.sql` for admin audit events.
- Audit now records listing hide/unhide, operator note updates, notice activate/disable, broadcast send/failure, and LinkedIn relink transfers.


## STEP033 delta

- Added direct operator messaging from User Card.
- Added direct message compose, template picker, preview, confirm, and send flow.
- Unified `admin_comm_outbox` with `direct` records and target-user drilldown.
- Added migration `016_admin_direct_message_outbox.sql`.
