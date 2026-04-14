# 00_CURRENT_STATE

## Project
Intro Deck

## Current source baseline
STEP052.6 — Invite Rewards Settlement + Live Verification Hardening

## Layer
Product hardening / invite expansion / rewards settlement truth + live verification hardening

## Source-confirmed
- Invite layer remains a bounded module:
  - `📨 Share invite`
  - `🔗 Link + copy`
  - `🧾 Invite card`
  - `📊 Performance`
  - `📋 Invite history`
- Admin invite snapshot remains read-only under:
  - `👑 Админка` → `🧰 Операции` → `📨 Инвайты`
- Rewards foundation remains implemented in source.
- User read surfaces are now implemented:
  - `🎯 Points` read screen inside invite layer
  - invite root points preview
  - performance/history navigation into points
- Founder/admin invite read truth now includes mode audit, settlement summary, reconciliation warnings, and mode-switch controls on the existing admin invite surface.
- User redeem path remains implemented inside invite rewards surfaces.
- Runtime accrual remains mode-gated.
- Manual settlement batch can now move due pending rewards into available or rejected states.
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

## Settlement truth now in source
- due pending rewards can be processed through a founder/operator-triggered settlement batch
- confirm writes both `pending_reversal` and `available_credit`
- reject writes `pending_reversal` and a `reject_reason` on the reward event
- repeated settlement runs stay idempotent through event status + ledger entry uniqueness
- `paused` blocks settlement writes

## What this step still does not do
- no cron auto-enable for settlement
- no broad rewards dashboard rewrite
- no new catalog or payout semantics

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

## Redeem truth now in source
- starter catalog:
  - `100 points -> 7 days Pro`
  - `250 points -> 30 days Pro`
- redeem runs only from `available`
- redeem stays blocked in `off`, `earn_only`, and `paused`
- successful redeem uses the canonical Pro subscription rail
- repeated confirm on the same redemption request resolves safely without double-completing that request

## Founder/operator controls now in source
- current mode remains visible in `👑 Админка -> 🧰 Операции -> 📨 Инвайты`
- founder/operator allowlist can switch:
  - `off`
  - `earn_only`
  - `live`
  - `paused`
- recent mode audit is visible in the same admin invite surface

## Rewards corridor continuity
- STEP052.3 — Invite Rewards Foundation remains in source
- STEP052.4 — Invite Rewards Read Surfaces + Founder Read Truth remains in source
- STEP052.5 — Invite Rewards Redeem Foundation + Founder Mode Controls remains in source
- STEP052.6 now adds settlement and live verification hardening on top of that corridor

## Live verification additions now in source
- admin invite surface shows last settlement run summary
- admin invite surface shows reconciliation warning counts
- founder/operator can run a bounded settlement batch from the same invite ops screen
- checklist doc added: `doc/76A_INVITE_REWARDS_LIVE_VERIFICATION_CHECKLIST.md`

## Next recommended step
STEP052.7 — Invite Rewards Ops Polish or broader STEP053 monetization/ops continuation after manual verification
