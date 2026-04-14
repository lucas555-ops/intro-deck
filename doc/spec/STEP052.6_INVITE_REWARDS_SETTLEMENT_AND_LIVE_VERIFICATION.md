# STEP052.6 — Invite Rewards Settlement + Live Verification Hardening

## Scope
- add canonical pending -> available settlement path
- add reject path with pending reversal
- add settlement run log table and founder/operator manual run surface
- add reconciliation read truth and founder live verification checklist

## Source-confirmed
- settlement is manual founder/operator-triggered in this step
- `paused` blocks settlement writes
- `off` does not create new rewards, but existing pending rewards can still be settled manually
- event and ledger are kept in sync through `pending_reversal` + `available_credit`
- redeem path from STEP052.5 remains intact and still spends from `available` only

## Non-goals
- no cron auto-enable
- no new user rewards UX
- no new catalog items
- no broad admin rewrite
