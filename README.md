# LinkedIn Telegram Directory Bot

STEP039.1 baseline for a Telegram-native professional directory with LinkedIn OIDC identity bootstrap, clean user-facing Telegram surfaces, durable notification receipts, explicit LinkedIn callback diagnostics, confirmed LinkedIn relink transfer flow, a first operator admin shell, operator Users + User Card surfaces, a first Communications layer with Notice / Broadcast / Outbox, operator Intros + Delivery read surfaces, direct operator messaging from User Card with unified Outbox records, refined admin segmentation/productivity shortcuts, and compact admin analytics + trend counters, refined notice/broadcast targeting, and a real admin templates layer.

## What this repo is

A Telegram-first professional directory:
- LinkedIn OIDC for identity bootstrap
- self-managed profile completion inside Telegram
- listed/active directory browse
- persisted intro requests
- row-level intro inbox actions with real decisions, privacy-first contact unlocking, and dedicated intro detail surfaces
- webhook secret guard for Telegram webhook ingress
- durable notification receipts with retry and operator diagnostics
- operator shell with communications controls
- operator intro and delivery visibility
- compact admin counters, refined segmentation, faster operator shortcuts, and compact admin trend summaries

Not:
- a LinkedIn clone
- a scraping tool
- an outreach automation tool
- a broad social network rewrite

## Core docs

- `doc/README.md` — docs map and reading order
- `doc/00_CURRENT_STATE.md` — current snapshot and next recommended step
- `doc/00_BOOT.md` — project framing and non-goals
- `doc/01_PROJECT_OPERATING_MANUAL.md` — working system for this project
- `doc/04_EXECUTION_CONTRACT.md` — what counts as good work here
- `doc/06_TRUTH_BOUNDARY_AND_SPIKE_RULES.md` — source/live/inference/blocked rules
- `doc/08_TELEGRAM_UI_ROUTER_CONTRACT.md` — app-like Telegram UX contract
- `doc/09_SELECTION_SURFACES_CONTRACT.md` — picker/filter/toggle contract

## Current STEP

- STEP024.7 — deploy-stable Vercel + webhook/init baseline
- STEP024.8 — OAuth route import fix
- STEP024.9 — repo/docs/smoke reconciliation baseline
- STEP025 — profile edit session schema fix for LinkedIn URL
- STEP026.2 — reconciled self-contained baseline for product surface polish + compatibility
- STEP026.6 — LinkedIn relink transfer flow for moving an identity to a new Telegram account
- STEP028 — operator admin shell baseline with `/ops` → Admin, section hubs, and `adm:` callback namespace
- STEP029 — Users + User Card with operator segments, listing controls, and DB-backed operator notes
- STEP030 — Notice + Broadcast baseline with singleton notice, bounded send flow, and outbox history
- STEP031 — Intros + Delivery operator surfaces with intro board/detail and receipt drilldown
- STEP032 — Directory Quality board + Audit detail
- STEP033 — Direct operator messaging from User Card with unified Outbox records
- STEP034 — Broadcast batching + delivery hardening with recipient materialization and failures trail
- STEP035 — Admin polish + compact counters across hub screens and operator lists
- STEP036 — Segmentation refinement + operator productivity pass across Users / Intros / Communications / Audit
- STEP037 — Compact admin analytics + trend counters across Admin / Operations / Communications / System hubs
- STEP038 — Broadcast/notice targeting refinement + templates polish
- STEP039.1 — founder-only admin entry visibility in the Telegram home menu with `/admin` fallback and allowlist wired to `ADMIN_CHAT_ID` + `TG_OPERATOR_IDS`

## Current code baseline

- Telegram `/start` home surface with state-based CTA ordering
- LinkedIn OIDC start + callback routes with friendly browser-facing error pages
- PostgreSQL persistence baseline
- in-Telegram profile completion
- curated skills selection
- public directory browse + filters + search narrowing
- public profile card outbound actions with privacy-first contact gating
- intro request persistence with row-level inbox actions, real decisions, and post-decision contact gating
- fail-closed Telegram webhook secret guard
- intro detail surfaces for received/sent requests
- DB-backed webhook update dedupe + short-lived intro action throttles
- intro history retention with archived snapshots and `SET NULL` foreign-key safety for removed users/profiles
- slim `createBot.js` with split composers, shared surface builders, and bot-runtime utility modules
- `directoryRepo.js` owns listed-profile browse/search/filter queries while `profileRepo.js` keeps profile truth, visibility, and skills logic
- best-effort Telegram service notifications with durable notification receipts for intro create / accept / decline events
- due receipt retry baseline with attempt counters, next-at scheduling, and a protected retry endpoint
- protected read-only receipt diagnostics endpoint with recent history, operator buckets, and per-intro summary
- allowlisted `/ops` operator shell with Admin / Operations / Communications / System hubs
- operator Users list with compact segments, pagination, and User Card drilldown
- User Card with view-card preview, hide/unhide listing controls, note flow, and message entrypoint scaffold
- singleton Notice with audience targeting and selected user-surface rendering
- bounded Broadcast draft → preview → confirm → send flow
- Outbox history with per-record drilldown for notice/broadcast events
- protected retry diagnostics surface still available inside the System section and via legacy `ops:*` callbacks
- operator Intros list with segment filters, Intro Detail, Delivery list, and Delivery Detail drilldown
- compact 24h / 7d admin trend summaries across Admin / Operations / Communications / System hubs
- public `/`, `/privacy`, and `/terms` static surfaces for Vercel + LinkedIn app setup
- Node 20.x deploy baseline, root `.npmrc`, and public npm lockfile hygiene
- migrations `012`, `013`, and `014` for LinkedIn URL edit sessions, operator notes, and communications baseline
- STEP031 is code-only: no new migration required

## Telegram public commands

Manual BotFather command list for the public menu:

```text
start - Start the bot
menu - Open the main menu
profile - Open your profile
browse - Browse the directory
inbox - Open your intro inbox
help - Learn how to use the bot
```

Operator-only command kept out of the public menu:

```text
ops - Open the operator admin shell
```

## Smoke commands

- `npm run check`
- `npm run smoke:env`
- `npm run smoke:auth`
- `npm run smoke:oauth-routes`
- `npm run smoke:router`
- `npm run smoke:storage`
- `npm run smoke:profile`
- `npm run smoke:profile-session-schema`
- `npm run smoke:skills`
- `npm run smoke:directory`
- `npm run smoke:filters`
- `npm run smoke:search`
- `npm run smoke:outbound`
- `npm run smoke:intro`
- `npm run smoke:webhook`
- `npm run smoke:intro-actions`
- `npm run smoke:intro-decisions`
- `npm run smoke:intro-contact`
- `npm run smoke:intro-detail`
- `npm run smoke:guards`
- `npm run smoke:intro-retention`
- `npm run smoke:code-split`
- `npm run smoke:data-split`
- `npm run smoke:receipts`
- `npm run smoke:notification-retry`
- `npm run smoke:notification-history`
- `npm run smoke:ops`
- `npm run smoke:cron`
- `npm run smoke:legal`
- `npm run smoke:bot-init`
- `npm run smoke:commands`
- `npm run smoke:admin-shell`
- `npm run smoke:admin-allowlist`
- `npm run smoke:admin-users`
- `npm run smoke:admin-user-card`
- `npm run smoke:notice`
- `npm run smoke:broadcast`
- `npm run smoke:outbox`

- STEP032 — Directory quality board + Audit detail with admin audit events and operator quality buckets
- STEP032 adds migration `015_admin_audit_events.sql`
- STEP033 — Direct operator messaging from User Card with unified Outbox `direct` records
- STEP033 adds migration `016_admin_direct_message_outbox.sql`
