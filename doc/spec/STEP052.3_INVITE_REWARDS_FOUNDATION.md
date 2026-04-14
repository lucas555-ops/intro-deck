# STEP052.3 — Invite Rewards Foundation (earn_only first)

## Goal
Внедрить rewards foundation поверх уже работающего invite-layer Intro Deck без включения redeem runtime.

## What this step adds
- `invite_program_settings`
- `invite_reward_events`
- `invite_reward_ledger`
- `invite_reward_redemptions` schema skeleton
- rewards mode truth: `off / earn_only / live / paused`
- pending activation reward creation for valid listed-ready invited users
- duplicate guard: one invited user -> one activation reward event
- repo/store read foundation for pending / available / redeemed

## Rewardable activation contract
Pending reward event может появиться только если invited user:
1. новый для системы;
2. пришёл по валидному invite;
3. подключил LinkedIn;
4. дошёл до listed-ready threshold (`profile_state = active`) или уже опубликован в каталоге.

Для Intro Deck этот шаг считает listed-ready достаточным host-level signal.

## Safe default
- default rewards mode = `off`
- accrual active only when mode is `earn_only` or `live`
- `paused` and `off` do not create new pending rewards

## Points + confirm window
- activation reward = `10` points
- confirm window = `24h`
- event is created as `pending`
- spendable balance is still `available` only

## Hooks added
Pending reward creation is re-checked after:
- LinkedIn identity persistence
- profile field save
- skill toggle
- visibility toggle

This keeps the integration narrow and avoids a broad router rewrite.

## Non-goals
This step does not add:
- user-facing redeem UI
- founder mode controls
- settlement job
- pending -> available transition
- Pro application via rewards

## Acceptance
- valid listed-ready invited user can create exactly one pending reward event when rewards mode accrues
- `off` and `paused` block new accrual
- self/existing/raw-open paths still do not qualify
- current invite surfaces stay intact
- docs canon remains under `doc/...`
