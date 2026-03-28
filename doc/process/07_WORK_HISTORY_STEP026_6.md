# STEP026.6 — LinkedIn relink transfer flow

## Goal
Allow a LinkedIn identity that is already connected to one Telegram account to be explicitly moved to a different Telegram account after successful LinkedIn OAuth, instead of failing with a raw database unique-constraint error.

## What changed
- Added conflict detection by `linkedin_sub` before persistence.
- Added an explicit transfer-required result from LinkedIn identity persistence.
- Added a browser confirmation page with a signed short-lived transfer token.
- Added confirm-transfer handling in `api/oauth/callback/linkedin.js`.
- Added atomic transfer behavior:
  - hide the previous account's public listing
  - move the LinkedIn account row to the new Telegram user
  - ensure a profile draft exists for the new owner
- Added Telegram notices:
  - success notice to the new owner
  - previous-owner notice after a confirmed move
- Added smoke coverage for relink transfer routing and storage behavior.

## Product effect
- One LinkedIn identity still maps to one Telegram account at a time.
- Reconnecting the same LinkedIn on a different Telegram account no longer dies on a raw `23505` database error.
- The user now gets an explicit “Move connection here” confirmation step.
- The previous Telegram account is disconnected and hidden from the public directory after transfer.

## Files touched
- `api/oauth/callback/linkedin.js`
- `src/lib/storage/linkedinIdentityStore.js`
- `src/db/linkedinRepo.js`
- `src/db/profileRepo.js`
- `scripts/smoke_linkedin_relink_transfer_contract.js`
- `scripts/smoke_linkedin_identity_store_transfer_contract.js`
- `package.json`
- `README.md`
- `doc/00_CURRENT_STATE.md`
- `api/health.js`
