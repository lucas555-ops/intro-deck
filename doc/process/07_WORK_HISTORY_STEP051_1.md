# STEP051.1 — Invite photo-card uplift

## Goal
Upgrade the primary STEP051 invite inline result into a richer photo-card using the production Intro Deck OG preview asset, while keeping fallback paths and attribution truth unchanged.

## What changed
- added a JPEG copy of the production OG preview at `assets/social/intro-deck-og-1200x630.jpg`;
- primary inline invite result now prefers a photo result with caption + button instead of article/text;
- added cached-photo readiness via optional `INVITE_PHOTO_FILE_ID` env;
- when no cached photo file id is configured, inline share falls back to the public JPEG asset URL;
- invite caption now uses tighter landing-aligned copy;
- raw-link and text-card fallbacks remain unchanged.

## Important truth
- URL-based inline photo share should work immediately after deploy if the JPEG asset is publicly reachable from `APP_BASE_URL`;
- cached-photo delivery is source-shipped but still requires one live Telegram upload to obtain a valid file id;
- live status not confirmed — manual verification required.

## Verification
- `npm run check`
- `node scripts/smoke_invite_contract.js`
- `node scripts/smoke_command_contract.js`
- `node scripts/smoke_product_surface_contract.js`
- `node scripts/smoke_help_fallback_callback_contract.js`
