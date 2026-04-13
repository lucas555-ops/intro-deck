# STEP052.1 — Invite Completion / UX Hardening

## Goal
Finish the Module A invite layer so `Performance`, `Invite history`, empty-states, and the read-only admin invite snapshot feel like completed product surfaces instead of partial secondary paths.

## What changed
- invite root now always exposes both `Performance` and `Invite history`;
- `Invite history` is now an always-on screen, including a real empty-state with clear next actions;
- `Performance` now focuses on all-time invite quality, source split, and recent 7-day momentum instead of repeating the invite hub;
- per-user invite snapshot now carries source counts and recent 7-day counters;
- admin `📨 Инвайты` snapshot copy is cleaner and reads more like a finished read-only operator view;
- source-checks were updated so the invite contract now expects history to stay available even at zero invites.

## Important truth
- this step does not add rewards, points, redeem, or founder reward-mode controls;
- activation wording remains honest to the current Intro Deck signal and is still not a reward settlement contract;
- live status not confirmed — manual verification required.

## Verification
- `npm run check`
- `node scripts/smoke_invite_contract.js`
- `node scripts/smoke_admin_funnel_drilldowns.js`
- `node scripts/smoke_command_contract.js`
