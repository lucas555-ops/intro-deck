# 15_NEW_CHAT_HANDOFF

## Executive summary

- Project: LinkedIn Telegram Directory Bot
- Current baseline: STEP043
- Current mode: HARDENING / HANDOFF / LAUNCH-READINESS
- Current focus: execute manual live verification + launch rehearsal on the deployed baseline without widening scope
- Must not break: LinkedIn OIDC truth, webhook secret guard, router contract, listed/active browse truth, intro persistence, communications/outbox truth, operator allowlist gating

## Source-confirmed

- mature operator/admin layer exists in source
- STEP040 Russian admin analytics drilldowns exist in source
- STEP041 safe bulk actions exist in source
- STEP042 launch runbook and freeze policy exist in source
- STEP043 live-verification and rehearsal guidance now exist in source
- System hub exposes read-only `adm:runbook`, `adm:freeze`, `adm:verify`, and `adm:rehearse`

## Live-confirmed

- syntax/smoke can be run from repo
- docs canon exists
- public landing is reachable at the production domain when checked externally

## Inference

- the next safe move is a manual verification pass and honest go/no-go, not a new feature step

## Blocked / unconfirmed

- fresh production `/api/health` / `/api/health?full=1` verification is not closed here
- real deployed LinkedIn callback verification is not closed here
- real deployed direct message / notice / broadcast rehearsal is not closed here

## Required wording

When deployment proof is missing, say exactly:
- **live status not confirmed — manual verification required**

## Verification/freeze source docs

- `doc/73_LAUNCH_OPS_RUNBOOK_V1.md`
- `doc/74_LAUNCH_FREEZE_POLICY_V1.md`
- `doc/76_LIVE_VERIFICATION_PLAYBOOK_V1.md`
- `doc/77_LAUNCH_REHEARSAL_CHECKLIST_V1.md`
- `doc/78_GO_NO_GO_VERDICT_TEMPLATE_V1.md`
