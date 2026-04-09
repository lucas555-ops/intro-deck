# STEP051.1 — INVITE PHOTO-CARD UPLIFT

## Goal

Upgrade the primary STEP051 inline invite result from article/text into a photo-card that uses the production Intro Deck OG preview asset, while keeping raw-link and text-card fallbacks unchanged.

## Shipped contract

- primary `Share invite` inline result now prefers a photo result instead of an article/text result
- the photo card uses the shipped OG asset as the Telegram invite image
- inline invite caption is tightened to the current landing canon
- if `INVITE_PHOTO_FILE_ID` is configured, inline share can use Telegram cached-photo delivery
- if `INVITE_PHOTO_FILE_ID` is absent, inline share falls back to the public JPEG OG asset URL
- `Show link` and `Get invite card` remain unchanged
- invite attribution, counters, and fallback paths remain exactly as in STEP051

## Runtime truth

- Telegram inline photo results require a public JPEG URL when using URL-based delivery
- Telegram cached-photo delivery requires a valid `photo_file_id` already stored on Telegram
- STEP051.1 ships both paths source-side, but cached-photo activation still depends on one live Telegram upload and storing the resulting file id

## Out of scope

- changing invite attribution rules
- reward mechanics
- replacing the fallback text-card message with a photo send flow
- changing the landing hero or OG design itself

## Verification

- `npm run check`
- `node scripts/smoke_invite_contract.js`
- `node scripts/smoke_command_contract.js`
- `node scripts/smoke_product_surface_contract.js`
- `node scripts/smoke_help_fallback_callback_contract.js`
