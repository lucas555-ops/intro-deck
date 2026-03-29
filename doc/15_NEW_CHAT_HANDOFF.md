# 15_NEW_CHAT_HANDOFF

## Executive summary

- Project: LinkedIn Telegram Directory Bot
- Current baseline: STEP049B
- Current mode: PRODUCT HARDENING / CONTACT + DM MONETIZATION FOUNDATION / LANDING PRODUCTION UPLIFT
- Current focus: keep the STEP048.4 runtime/product layer stable while upgrading the public landing into a production-grade entry page
- Must not break: LinkedIn OIDC truth, webhook secret guard, router contract, listed/active browse truth, intro persistence, communications/outbox truth, operator allowlist gating

## Source-confirmed

- mature operator/admin layer exists in source
- STEP040 Russian admin analytics drilldowns exist in source
- STEP041 safe bulk actions exist in source
- STEP042 launch runbook and freeze policy exist in source
- STEP043.1 live-verification and rehearsal guidance exist in source
- STEP045 LinkedIn identity auto-seed uplift now exists in source
- STEP046 private handle + paid contact unlock now exists in source
- STEP047 gated member DM relay now exists in source
- LinkedIn callback/user notification copy now explicitly says only the basic identity layer was imported
- profile draft seeding now preserves existing manual display name values on reconnect
- profile-level hidden Telegram username and direct-contact approval flow now exist in source
- rebuilt public landing now exists in source with stronger section architecture and CTA hierarchy

## Live-confirmed

- syntax/smoke can be run from repo
- docs canon exists
- source-level STEP049B checks pass locally

## Inference

- the next safe landing step is STEP049C OG / social / metadata uplift, not a broad website rewrite
- the strongest product/runtime rails remain paid direct-contact requests plus gated DM initiation beneath the landing uplift

## Blocked / unconfirmed

- fresh production `/api/health` / `/api/health?full=1` verification is not closed here
- real deployed LinkedIn callback verification for STEP045 copy/seed behavior is not closed here
- real deployed Telegram Stars direct-contact request flow is not closed here
- real deployed Telegram Stars DM flow is not closed here
- branded OG/social preview layer is not implemented yet

## Required wording

When deployment proof is missing, say exactly:
- **live status not confirmed — manual verification required**

When contract certainty is missing, say exactly:
- **contract not confirmed — SPIKE required**

## Key source docs

- `doc/00_CURRENT_STATE.md`
- `doc/spec/STEP045_LINKEDIN_IDENTITY_AUTO_SEED_UPLIFT.md`
- `doc/spec/STEP046_PRIVATE_TELEGRAM_HANDLE_AND_PAID_CONTACT_UNLOCK_V1.md`
- `doc/spec/STEP047_MEMBER_DM_RELAY_V1.md`
- `doc/spec/STEP049B_LANDING_IMPLEMENTATION.md`
- `doc/process/07_WORK_HISTORY_STEP045.md`
- `doc/process/07_WORK_HISTORY_STEP046.md`
- `doc/process/07_WORK_HISTORY_STEP047.md`
- `doc/process/07_WORK_HISTORY_STEP049B.md`
- `doc/17_START_NEW_CHAT_PROMPT_LINKEDIN_DIRECTORY_BOT.md`


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

- Rebuilt the public landing into a stronger one-page product entry page with hero, audience, workflow, product surfaces, FAQ, and final CTA sections.
- Cleaned up CTA hierarchy so legal links no longer compete with the main product action.
- Upgraded `site.css` and aligned `privacy` / `terms` pages to the same navigation and footer standard.
