# 00_CURRENT_STATE

## Snapshot

- Project: LinkedIn Telegram Directory Bot
- Current STEP: STEP024.6
- Phase: runtime build / lightweight operator diagnostics surface over the existing intro, hardening, retention, split-runtime, receipt, retry, and deploy-readiness web surfaces
- Primary mode: Telegram SaaS / Bot + Engineering Ops
- Secondary mode: Hardening + Docs / Handoff discipline
- Runtime status: working scaffold with real auth, persistence, in-Telegram profile completion, curated skill selection, public browse, persisted per-user directory filters, text/city narrowing, outbound LinkedIn action, intro request persistence, fail-closed webhook secret guard, intro inbox decisions plus privacy-first contact unlocking, durable service notification receipts, protected retry, protected read-only receipt diagnostics, a narrow in-Telegram operator/admin diagnostics surface, and public web/legal surfaces for Vercel + LinkedIn app setup; still not production-ready

## Audit status

- Syntax check: passed
- Smoke suite: passed for env, auth, router, profile, skills, directory, filters, search, outbound, intro, webhook, intro-actions, intro-decisions, intro-contact, intro-detail, guards, intro-retention, code-split, data-split, receipts, notification-retry, notification-history, ops, cron, and legal
- Docs link scan: carried forward from STEP011C baseline and spot-checked after STEP024 docs additions
- Live deployment proof: still not available in this repo snapshot

## What exists now

- Telegram `/start` home surface
- LinkedIn OAuth start endpoint
- LinkedIn OAuth callback endpoint
- OIDC discovery + state signing + token exchange + ID token validation + userinfo fallback
- health endpoint
- Telegram webhook ingress with fail-closed secret-token guard
- PostgreSQL persistence baseline
- `users` upsert on Telegram touch
- `linkedin_accounts` upsert on callback
- `member_profiles` hidden draft creation on first successful LinkedIn connect
- profile snapshot read path for home surface
- in-Telegram profile editor menu
- profile preview surface
- edit sessions for text-field completion flow
- curated skills selection surface with inline toggle callbacks
- public directory list baseline for `listed + active` profiles
- public profile card surface with page-preserving back path
- outbound action row on public profile cards for intro-request creation, with public LinkedIn URL gated by contact contract rules
- intro request persistence table and repo/storage wiring
- intro inbox surface with row-level received/sent items
- inbox row actions for `Open profile`, real `Accept` / `Decline` decisions, and decision-aware contact buttons
- persisted directory filter sessions per Telegram user
- directory filters surface with text query, city, single-choice industry bucket, and multi-select skills narrowing
- pending filter input mode for Telegram text-entry search/city updates
- filtered public browse output with explicit empty state when no listed profiles match current filters
- docs operating system uplift: execution contract, handoff standard, truth-boundary rules, artifact protocol, mini-smoke standard, work modes, Telegram router contract, selection surfaces contract, ready-to-use new-chat handoff, and release-readiness checklist
- smoke scripts for env, auth contract, router contract, profile edit contract, skills contract, directory contract, directory filters contract, directory search contract, outbound contract, intro contract, webhook secret contract, intro inbox actions, intro decisions, intro contact, intro detail, runtime guard, receipt layer, retry layer, notification-history diagnostics, and ops diagnostics surface
- full new-chat activation prompt is kept inside the repo docs canon
- DB-backed runtime guard layer now covers duplicate webhook `update_id` receipts and short-lived intro send/decision throttles
- intro history now keeps sender/target snapshots on `intro_requests` and switches intro foreign keys to `ON DELETE SET NULL`, so surviving participants can still see archived intro history if related users/profiles are later removed
- bot runtime split into dedicated composers (`home`, `profile`, `directory`, `intro`, `operator`, `text`) plus shared surface builders and bot utility modules
- data layer now splits browse/search/filter SQL into `src/db/directoryRepo.js`, leaving `profileRepo.js` focused on profile truth, visibility, and skills
- notification / receipt layer now persists `notification_receipts` and sends best-effort Telegram service messages for intro create / accept / decline events
- notification retry baseline now tracks `attempt_count`, `last_attempt_at`, `next_attempt_at`, `max_attempts`, and `last_error_code`, and exposes a protected retry endpoint for due receipt re-delivery
- notification receipt diagnostics baseline now exposes protected read-only recent history, operator bucket counts, and per-intro drilldown summary
- lightweight operator/admin diagnostics surface now exists inside Telegram via `/ops` and an operator-only home entrypoint, gated by allowlisted Telegram user IDs
- public root landing page for Vercel default domain
- public privacy policy page for LinkedIn app registration
- public terms-of-use page linked from the landing and privacy surfaces

## What is intentionally still missing

- intro request message body contract
- intro reply / chat flow
- ranking or relevance scoring
- advanced search syntax
- premium logic
- end-user notification center
- resend / requeue mutations from operator diagnostics
- broad admin surfaces
- migration runner / deploy automation
- production observability
- custom domain and dedicated support/contact email

## Current truth

- LinkedIn login is identity bootstrap, not full professional profile import
- OIDC fields remain the only guaranteed auto-import baseline
- DB persistence is real when `DATABASE_URL` is configured
- Telegram webhook ingress now fails closed when `TELEGRAM_WEBHOOK_SECRET` is missing or mismatched
- profile completion is real inside Telegram for text fields and curated skills
- public browse only shows profiles that are both `listed` and `active`
- text query and city narrowing exist, but this is still not a search engine with ranking
- intro requests, accept/decline decisions, and decision-aware detail/contact surfaces persist in DB, but reply/chat flows are still intentionally missing
- receipt truth is durable in DB, retry truth is DB-backed, STEP023 adds protected operator read truth, STEP024 adds an allowlisted in-Telegram operator surface without turning the product into a broad notification center, STEP024.5 closes deploy-readiness gaps with shared secret compare, dual-mode retry auth for Vercel cron + manual fallback, retention-safe notification recipient FK policy, and retry-path runtime guard cleanup, and STEP024.6 adds public web/legal surfaces plus a Vercel config fix so the default domain can be used immediately for LinkedIn Page/App setup
- industry filtering is a curated bucket layer over user-entered industry text
- skill filtering matches any selected skill, not all selected skills
- search text matches display name, LinkedIn name, headline, company, industry, and about
- city narrowing matches free-text city fragments case-insensitively
- this project has an explicit docs/operating layer; future work should use it instead of ad-hoc narrative drift

## What must not break

- official-only LinkedIn auth baseline
- Telegram webhook secret guard
- current Telegram router discipline
- listed/active visibility truth for public browse
- durable intro request persistence and dedupe
- privacy-first contact unlock rules
- durable notification receipt truth and retry truth
- operator allowlist gating for diagnostics surfaces
- docs canon continuity between current state, handoff, and feature baselines

## Next recommended step

- STEP025 — live verification / release gate pass
