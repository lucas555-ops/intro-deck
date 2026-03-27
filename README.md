# LinkedIn Telegram Directory Bot

STEP024.8 baseline for a Telegram-native professional directory with LinkedIn OIDC identity bootstrap, durable notification receipt diagnostics, an allowlisted in-Telegram operator surface, deploy-readiness micro-hardening, public legal/web surfaces for app registration, and a live OAuth route import-resolution hotfix.

## What this repo is

A Telegram-first professional directory:
- LinkedIn OIDC for identity bootstrap
- self-managed profile completion inside Telegram
- listed/active directory browse
- persisted intro requests
- row-level intro inbox actions with real decisions, privacy-first contact unlocking, and dedicated intro detail surfaces
- webhook secret guard for Telegram webhook ingress
- durable notification receipts with retry and operator diagnostics

Not:
- a LinkedIn clone
- a scraping tool
- an outreach automation tool
- a broad social network rewrite

## Core docs

- `docs/README.md` — docs map and reading order
- `docs/00_CURRENT_STATE.md` — current snapshot and next recommended step
- `docs/00_BOOT.md` — project framing and non-goals
- `docs/01_PROJECT_OPERATING_MANUAL.md` — working system for this project
- `docs/04_EXECUTION_CONTRACT.md` — what counts as good work here
- `docs/06_TRUTH_BOUNDARY_AND_SPIKE_RULES.md` — source/live/inference/blocked rules
- `docs/08_TELEGRAM_UI_ROUTER_CONTRACT.md` — app-like Telegram UX contract
- `docs/09_SELECTION_SURFACES_CONTRACT.md` — picker/filter/toggle contract

## Current STEP

- STEP012 — webhook secret hardening + intro inbox row actions baseline
- STEP013 — real intro accept/decline transitions + inbox decision visibility
- STEP014 — privacy-first post-decision contact contract around submitted LinkedIn URLs
- STEP015 — intro detail surfaces / sent-received decision visibility
- STEP016 — anti-abuse / retry / dedupe hardening
- STEP017 — intro retention / history safety baseline
- STEP018 — bot runtime code split refactor
- STEP019 — data-layer split refactor / `directoryRepo` extraction
- STEP020 — notification / receipt layer
- STEP021 — notification retry / receipt history SPIKE
- STEP022 — notification retry baseline
- STEP023 — receipt history / operator diagnostics baseline
- STEP024 — lightweight operator/admin diagnostics surface
- STEP024.5 — micro-hardening / deploy-readiness gap close
- STEP024.6 — public legal/web surfaces baseline + Vercel config fix
- STEP024.8 — LinkedIn OAuth route import-resolution hotfix + regression smoke

## Current code baseline

- Telegram `/start` home surface
- LinkedIn OIDC start + callback scaffold
- PostgreSQL persistence baseline
- In-Telegram profile completion
- Curated skills selection
- Public directory browse + filters + search narrowing
- Public profile card outbound actions with privacy-first contact gating
- Intro request persistence baseline with row-level inbox actions, real decisions, and post-decision contact gating
- Fail-closed Telegram webhook secret guard
- intro detail surfaces for received/sent requests
- DB-backed webhook update dedupe + short-lived intro action throttles
- Intro history retention with archived snapshots and `SET NULL` foreign-key safety for removed users/profiles
- Slim `createBot.js` with split composers, shared surface builders, and bot-runtime utility modules
- `directoryRepo.js` now owns listed-profile browse/search/filter queries while `profileRepo.js` keeps profile truth, visibility, and skills logic
- best-effort Telegram service notifications with durable notification receipts for intro create / accept / decline events
- due receipt retry baseline with attempt counters, next-at scheduling, and a protected retry endpoint
- protected read-only receipt diagnostics endpoint with recent history, operator buckets, and per-intro summary
- allowlisted `/ops` diagnostics surface with retry_due / failed / exhausted sections and per-intro drilldown
- public `/`, `/privacy`, and `/terms` static surfaces for Vercel + LinkedIn app setup
- Vercel config aligned for default Node.js API handling and a stable Node 20.x deploy baseline

## Smoke commands

- `npm run check`
- `npm run smoke:env`
- `npm run smoke:auth`
- `npm run smoke:router`
- `npm run smoke:profile`
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
- `npm run smoke:cron`
- `npm run smoke:notification-history`
- `npm run smoke:ops`
- `npm run smoke:legal`

## Truth note

- Source baseline is ahead of live confirmation
- Live status not confirmed — manual verification required
