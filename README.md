# LinkedIn Telegram Directory Bot

STEP047 baseline for a Telegram-native professional directory with LinkedIn OIDC identity bootstrap, user-facing Telegram member flow, mature operator/admin control plane, Russian admin analytics drilldowns, guarded bulk actions, launch/ops runbook + freeze discipline, and explicit live-verification / launch-rehearsal guidance.

## What this repo is

A Telegram-first professional directory:
- LinkedIn OIDC for identity bootstrap
- self-managed profile completion inside Telegram
- listed/active directory browse
- persisted intro requests and decisions
- gated member DM relay with first-message approval and paid request opening
- operator shell with communications, delivery, audit, quality, and search
- analytics drilldowns and guarded operator bulk-prep
- runbook/freeze launch discipline

## Current STEP corridor

- STEP039.1 — founder-only admin visibility + `/admin` fallback
- STEP040 — Russian admin analytics drilldowns + funnel readouts
- STEP041 — safe bulk actions
- STEP042 — launch/ops runbook + freeze
- STEP043.1 — live verification / launch rehearsal guidance
- STEP045 — LinkedIn identity auto-seed uplift
- STEP046 — private handle + paid direct contact unlock
- STEP047 — gated member DM relay

## Core docs

- `doc/00_CURRENT_STATE.md`
- `doc/15_NEW_CHAT_HANDOFF.md`
- `doc/16_RELEASE_READINESS_CHECKLIST.md`
- `doc/17_START_NEW_CHAT_PROMPT_LINKEDIN_DIRECTORY_BOT.md`
- `doc/73_LAUNCH_OPS_RUNBOOK_V1.md`
- `doc/74_LAUNCH_FREEZE_POLICY_V1.md`
- `doc/76_LIVE_VERIFICATION_PLAYBOOK_V1.md`
- `doc/77_LAUNCH_REHEARSAL_CHECKLIST_V1.md`
- `doc/78_GO_NO_GO_VERDICT_TEMPLATE_V1.md`

## Smoke

- `npm run check`
- `npm run smoke:admin-shell`
- `npm run smoke:admin-russian-layer`
- `npm run smoke:admin-bulk-actions`
- `npm run smoke:admin-runbook-freeze`
- `npm run smoke:admin-live-verification`
- `npm run smoke:dm-relay`
- `npm run smoke:dm-payments`
