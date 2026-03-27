# LinkedIn Telegram Directory Bot

STEP026.5 baseline for a Telegram-native professional directory with LinkedIn OIDC identity bootstrap, clean user-facing Telegram surfaces, a reconciled command contract, durable notification receipts, an allowlisted operator diagnostics layer, deploy-stable Vercel settings, and explicit LinkedIn callback stage diagnostics for faster live debugging.

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
- STEP026.5 — mixed-state help fallback callback fix + staged LinkedIn callback diagnostics

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
- allowlisted `/ops` diagnostics surface with retry_due / failed / exhausted sections and per-intro drilldown
- public `/`, `/privacy`, and `/terms` static surfaces for Vercel + LinkedIn app setup
- Node 20.x deploy baseline, root `.npmrc`, and public npm lockfile hygiene
- migration `012_profile_edit_sessions_linkedin_url_field_key.sql` for the `li` edit-session contract

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
ops - Open operator diagnostics
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
- `npm run smoke:product-surfaces`

## Truth note

- Source baseline is ahead of live confirmation
- Last known live deploy baseline before this repo pass was STEP024.7 deploy-stable
- STEP026.2 source is self-contained and carries forward the STEP024.8, STEP024.9, STEP025, STEP026, and STEP026.1 fixes needed for consistency
- STEP026.5 keeps the public command layer clean, hardens the help-surface fallback callbacks against mixed deploys, and adds staged LinkedIn callback diagnostics for live failure triage
