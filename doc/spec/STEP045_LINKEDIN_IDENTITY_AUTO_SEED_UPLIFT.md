# STEP045 — LINKEDIN IDENTITY AUTO-SEED UPLIFT

## Goal

Strengthen the LinkedIn OIDC callback/persistence flow so the bot auto-seeds only the safe identity layer:
- full name
- given name
- family name
- picture URL
- locale
- optional email if scope is explicitly enabled

## Contract

- LinkedIn remains an identity bootstrap, not a broad profile import
- display name may be seeded only when the local card name is still empty/blank
- reconnect must not silently overwrite existing manual Telegram profile fields
- callback and Telegram success copy must state clearly that only the basic identity layer was imported
- headline/company/city/industry/about/skills/public LinkedIn URL remain Telegram-managed

## Notes

- `LINKEDIN_SCOPES` defaults to `openid profile`
- email is optional and should only be enabled deliberately
- `locale` is stored internally and may be used later for UX defaults; it is not a public profile field in STEP045
