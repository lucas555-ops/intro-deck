# STEP035 — Admin polish + compact counters

## Goal

Tighten the operator UX after STEP034 with compact counters, clearer summaries, cleaner list rows, and consistent empty states/navigation.

## Implemented

- Added DB-backed admin dashboard summary loader for home/ops/comms/system counters.
- Added compact counters to Admin, Operations, Communications, and System hubs.
- Polished row formatting for Users, Intros, Delivery, Quality, Audit, and Outbox.
- Improved empty states and wording for operator surfaces.
- Synced health/docs/builders to STEP035.
- Fixed missing `buildAdminBroadcastFailuresSurface` wiring in `createBot()`.

## Acceptance

- Hub screens expose concise operational summaries.
- Existing operator flows remain intact.
- No new migration required.
