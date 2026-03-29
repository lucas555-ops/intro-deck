# 00_CURRENT_STATE

## Snapshot

- Project: LinkedIn Telegram Directory Bot
- Current STEP: STEP049B
- Phase: landing production uplift on top of the STEP048.4 product baseline
- Primary mode: PRODUCT HARDENING / MONETIZATION FOUNDATION / LANDING PRODUCTION UPLIFT
- Runtime status: source-clean STEP049B baseline with the STEP048.4 product/runtime layer intact plus a rebuilt public landing and upgraded legal-page presentation; live status not confirmed — manual verification required

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
- upgraded one-page public landing with stronger CTA hierarchy, product sections, FAQ, and final CTA

## Current truth

- LinkedIn login is still identity bootstrap, not full professional import
- STEP045 auto-seeds only the safe identity layer and only seeds profile display name when the local card name is still empty
- existing manual Telegram profile fields are preserved on reconnect
- public browse still depends on listed + active truth
- STEP046 ships hidden Telegram handle + paid direct contact requests with owner approval
- STEP047 now ships the narrow DM request + active thread path
- landing is now structured as a real product entry page instead of a minimal placeholder
- privacy and terms pages now share the same visual/navigation standard as the landing
- STEP048 pricing / analytics / ops remains the last shipped product/runtime layer beneath the landing uplift

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

- implement STEP049C — OG / social / metadata uplift
- keep the rollout narrow: branded OG asset, full og/twitter tags, title/description polish, and share-preview verification

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


## STEP048.1 hotfix

- Added schema-compatible profile/directory reads so legacy databases without `member_profiles.telegram_username_hidden` do not break LinkedIn transfer confirm or home/profile loads.
- Purpose: keep pre-STEP046 databases operational while migrations are still being applied.
- Note: paid unlock / DM / pricing features still require STEP046-STEP048 migrations to be applied for full functionality.


## STEP048.3 hotfix

- Scope: LinkedIn connect/relink copy polish + profile editor/preview readability + profile keyboard consistency.
- Product truth: LinkedIn OIDC basics are stored privately; only the initial card name is auto-seeded into public card fields by default.
- UX: profile editor now shows a dedicated LinkedIn block, preview clarifies what is public vs private, and callback success page includes an explicit button back to the bot.
- Buttons: profile preview/input/profile-saved flows now keep Back + Home on one row for tighter Telegram ergonomics.
- No schema changes. Live status not confirmed — manual verification required.


## STEP048.4 hotfix
- Fix: restore STEP048 pricing env contract exports after STEP048.3 UX hotfix accidentally dropped `getSubscriptionConfig` and Pro pricing fields from `src/config/env.js`.
- Impact: Vercel runtime no longer fails on `monetizationStore.js` import during startup.
- Scope: narrow compatibility/hardening only; no product-flow changes.


## STEP049B delta

- public `index.html` rebuilt into a production-grade one-page landing with clear section architecture
- hero CTA hierarchy cleaned up: primary bot-open CTA + secondary how-it-works anchor
- added sections for audience, workflow, product surfaces, FAQ, and final CTA
- `site.css` upgraded to a stronger dark premium layout system with better mobile behavior
- `privacy` and `terms` pages aligned to the same navigation and footer standard
