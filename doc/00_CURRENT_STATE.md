# 00_CURRENT_STATE

## Project
Intro Deck

## Current source baseline
STEP052.3 — Invite Rewards Foundation (earn_only first)

## Layer
Product hardening / invite expansion / rewards foundation

## Source-confirmed
- Invite layer remains a bounded module:
  - `📨 Share invite`
  - `🔗 Link + copy`
  - `🧾 Invite card`
  - `📊 Performance`
  - `📋 Invite history`
- Admin invite snapshot remains read-only under:
  - `👑 Админка` → `🧰 Операции` → `📨 Инвайты`
- Rewards foundation is now implemented in source:
  - settings truth for `off / earn_only / live / paused`
  - reward events table
  - ledger table
  - redemption skeleton table
  - pending activation reward creation
  - duplicate guard for one invited user -> one activation reward event
- Runtime accrual is intentionally mode-gated.
- Safe default remains `off` until manual verification.

## Rewards activation truth
For Intro Deck, a pending reward can exist only when the invited user:
1. is new to the system;
2. arrived through a valid invite attribution;
3. connected LinkedIn;
4. reached listed-ready state (`profile_state = active`) or is already listed.

Not rewardable:
- raw open
- `/start`
- deep-link open only
- self-invite
- existing user
- profile start without listed-ready threshold

## Pending foundation now in source
- activation reward points: `10`
- confirm window: `24h`
- pending reward is created only when mode is `earn_only` or `live`
- `off` and `paused` do not create new pending rewards
- spendable balance is still `available` only

## Runtime integration points
Pending reward accrual check is now re-run after:
- LinkedIn identity persistence
- profile field save
- skill toggle
- visibility toggle

## What this step still does not do
- no user-facing redeem runtime
- no founder mode controls
- no settlement job
- no pending -> available transition yet
- no rewards UI surfaces yet

## What must not break
- LinkedIn OIDC truth
- current invite layer
- admin IA and Russian operator layer
- current monetization / pricing surfaces
- webhook/runtime contracts
- docs canon and artifact protocol

## Live truth boundary
- source-confirmed: yes
- live-confirmed: no
- live status not confirmed — manual verification required

## Next recommended step
STEP052.4 — Invite Rewards Read Surfaces + Founder Read Truth
