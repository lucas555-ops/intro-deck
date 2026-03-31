# STEP050J — WORK HISTORY

## Goal

Run a schema-compat reality check and replace stale assumptions with explicit code truth for pre-STEP046 databases.

## What changed

- added `src/db/schemaCompat.js` to detect whether `member_profiles.telegram_username_hidden` and `contact_unlock_requests` are actually present
- restored schema-compatible profile/directory reads so home/profile/directory loads do not break on databases missing the hidden Telegram username column
- changed hidden Telegram username field writes to return an explicit migration-required block instead of crashing on missing column
- changed direct-contact unlock repo flows to return `contact_unlock_requires_migrations` when STEP046 migration `019_contact_unlock_requests.sql` is missing
- fixed duplicated requester joins inside `src/db/contactUnlockRepo.js` detail loading query
- added `scripts/smoke_schema_compat_contract.js` and updated docs truth in current state / handoff

## Verification

- `npm run check`
- `npm run smoke:schema-compat`
- `npm run smoke:landing`
- `npm run smoke:legal`
- `npm run smoke:landing-polish`

## Truth boundary

- profile/directory reads are backward-compatible again
- full STEP046 paid direct-contact functionality is **not** backward-compatible without migration `019_contact_unlock_requests.sql`
- this is intentional and explicit after STEP050J
