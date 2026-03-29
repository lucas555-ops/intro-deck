# 00_CURRENT_STATE

## Snapshot

- Project: LinkedIn Telegram Directory Bot
- Current STEP: STEP048
- Phase: pricing / analytics / ops baseline
- Primary mode: PRODUCT HARDENING / IDENTITY UPLIFT / MONETIZATION FOUNDATION
- Runtime status: source-clean STEP048 baseline with LinkedIn OIDC identity auto-seed uplift, paid direct-contact unlock, gated member DM relay, Pro pricing surface, receipt persistence, and admin monetization counters layered on top of the existing member flow and operator/admin plane; live status not confirmed — manual verification required

## What exists now

- LinkedIn OIDC identity bootstrap
- Telegram profile completion, skills, browse, search, intro flow
- operator `/ops` / `/admin` entrypoints with allowlist gating
- Admin / Operations / Communications / System hubs in Russian
- Users, User Card, Notice, Broadcast, Outbox, Intros, Delivery, Quality, Audit
- compact admin counters, trend summaries, funnel drilldowns
- guarded bulk actions from user segments into Notice / Broadcast prep
- STEP045 LinkedIn identity auto-seed uplift for name / given / family / picture / locale persistence
- STEP046 hidden Telegram username + paid direct-contact request flow with owner approval
- STEP047 gated member DM relay with first-message payment + recipient accept/decline/block/report
- honest user-facing LinkedIn import summary and manual-fields reminder
- `/plans` + Pro subscription surface with receipt + entitlement layer
- admin monetization hub with revenue / funnel / abuse counters

## Current truth

- LinkedIn login is still identity bootstrap, not full professional import
- STEP045 auto-seeds only the safe identity layer and only seeds profile display name when the local card name is still empty
- existing manual Telegram profile fields are preserved on reconnect
- public browse still depends on listed + active truth
- STEP046 ships hidden Telegram handle + paid direct contact requests with owner approval
- STEP047 now ships the narrow DM request + active thread path
- STEP048 pricing / analytics / ops now ships in source: Pro subscription invoice path, receipt persistence, entitlement checks, and admin monetization counters

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

- run manual live verification for STEP048 end-to-end
- verify production Telegram Stars flows for: Pro monthly, paid direct contact, paid DM, and Pro-covered no-invoice paths
- keep rollout narrow: verify counters, receipts, and admin monetization truth before any new pricing expansion

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

## STEP043.1 delta

- live-verification guidance added
- launch-rehearsal guidance added
- System hub now exposes `Live verification` and `Репетиция запуска`
- verification playbook / rehearsal checklist / go-no-go template added

## STEP045 delta

- LinkedIn OIDC claims now normalize and persist basic identity fields more explicitly
- profile draft seeding now fills display name only when the local card name is still empty/blank
- callback success surfaces now state clearly that only the basic identity layer was imported
- hidden/manual professional fields remain Telegram-managed and are not auto-scraped from LinkedIn

## STEP046 delta

- optional hidden Telegram username added to profile editing
- contact mode toggle added for intro-only vs paid direct-contact requests
- Telegram Stars one-time invoice path added for direct-contact requests
- owner approve/decline + controlled reveal flow added
- inbox/detail surfaces extended to include direct-contact requests


## STEP047 delta

- member DM request entity + compose session + message/event storage added
- first-message payment gate added for DM request delivery
- recipient review controls added: accept / decline / block / report
- active text-only bot-mediated DM thread replies added
- `/dm` inbox and DM thread detail surfaces added


## STEP048 delta

- `/plans` surface and Pro monthly Telegram Stars purchase path added
- `member_subscriptions` + `purchase_receipts` persistence added
- active Pro now covers direct-contact and DM outbound action fees while subscription is active
- compact Russian admin monetization hub added with revenue, funnel, abuse, and recent receipt visibility
