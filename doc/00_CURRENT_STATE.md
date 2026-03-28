# 00_CURRENT_STATE

## Snapshot

- Project: LinkedIn Telegram Directory Bot
- Current STEP: STEP043
- Phase: working product baseline + mature operator/admin layer + launch/ops runbook + freeze + live verification / rehearsal guidance
- Primary mode: HARDENING / HANDOFF / LAUNCH-READINESS
- Runtime status: source-clean STEP043 baseline with user-facing member flow, operator control plane, STEP040 analytics drilldowns, STEP041 guarded bulk actions, STEP042 read-only launch/freeze guidance, and STEP043 read-only live-verification / launch-rehearsal guidance; live status not confirmed — manual verification required

## What exists now

- LinkedIn OIDC identity bootstrap
- Telegram profile completion, skills, browse, search, intro flow
- operator `/ops` / `/admin` entrypoints with allowlist gating
- Admin / Operations / Communications / System hubs in Russian
- Users, User Card, Notice, Broadcast, Outbox, Intros, Delivery, Quality, Audit
- compact admin counters, trend summaries, funnel drilldowns
- guarded bulk actions from user segments into Notice / Broadcast prep
- read-only launch runbook and freeze guidance from the System hub
- read-only live-verification and launch-rehearsal guidance from the System hub

## Current truth

- LinkedIn login is identity bootstrap, not full professional import
- public browse still depends on listed + active truth
- communications and bulk-prep flows are real in source, but deployment proof is not refreshed here
- STEP042/STEP043 are operating/verification steps, not new product-domain steps

## What must not break

- LinkedIn OIDC flow and callback truth
- Telegram webhook secret guard
- async `createBot()` + awaited `bot.init()`
- listed/active visibility truth
- intro persistence / decision truth
- communications layer and outbox truth
- operator allowlist gating
- docs canon + artifact protocol

## Next recommended step

- execute the manual STEP043 verification + rehearsal pass on the deployed baseline
- record an honest go / no-go note before any new feature scope

## STEP039.1 delta

- founder/operator-only admin visibility from `ADMIN_CHAT_ID` + `TG_OPERATOR_IDS`
- `/admin` mirrors `/ops` as operator-only fallback

## STEP040 delta

- Russian admin/operator layer
- compact analytics drilldowns and funnel readouts

## STEP041 delta

- safe bulk actions from user segments into Notice / Broadcast prep
- no destructive bulk mutations

## STEP042 delta

- launch/operator runbook added
- freeze policy added
- System hub now exposes `Регламент запуска` and `Freeze`
- release-readiness / handoff / roadmap / start-new-chat prompt aligned to STEP042

## STEP043 delta

- live-verification guidance added
- launch-rehearsal guidance added
- System hub now exposes `Live verification` and `Репетиция запуска`
- verification playbook / rehearsal checklist / go-no-go template added
