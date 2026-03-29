# STEP046 work history

- Added `telegram_username_hidden` as an optional profile field plus profile-level contact mode toggle for `intro_request` vs `paid_unlock_requires_approval`.
- Added `contact_unlock_requests` persistence with payment-pending, paid-pending-approval, revealed, and declined states.
- Added Telegram Stars invoice payload flow for direct-contact requests plus pre-checkout and successful-payment handling.
- Added owner approve/decline callbacks and controlled reveal of the hidden Telegram username only after approved state.
- Extended inbox/detail surfaces so sent and received direct-contact requests are reviewable from the existing inbox plane.
- Bumped runtime/docs markers to STEP046 / 0.46.0 and added dedicated smoke coverage for contact-unlock contract and payment payloads.
