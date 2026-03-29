# STEP046 — PRIVATE TELEGRAM HANDLE + PAID CONTACT UNLOCK V1

## Goal

Add an optional hidden Telegram username plus a gated paid direct-contact request flow that preserves privacy and owner consent.

## Shipped in source

- optional hidden `telegram_username_hidden` profile field
- profile-level contact mode toggle between `intro_request` and `paid_unlock_requires_approval`
- public directory CTA for `⭐ Request direct contact` when the profile allows it
- Telegram Stars invoice payload path for one-time direct-contact requests
- request persistence in `contact_unlock_requests`
- owner approve/decline callbacks
- reveal of Telegram username only after paid request + owner approval
- inbox/detail surfaces for sent and received direct-contact requests

## Explicit limits

- payment does not bypass recipient consent
- raw hidden Telegram username is never shown on public cards
- no subscriptions yet
- no member DM relay yet
- no broad pricing/analytics layer yet

## Truth boundary

- source-confirmed: hidden handle + paid unlock request + owner approval + controlled reveal
- live status not confirmed — manual verification required
