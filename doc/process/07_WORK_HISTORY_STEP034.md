# STEP034 — Broadcast batching + delivery hardening

## Goal
Move operator broadcast delivery from a one-pass loop into a bounded, batch-safe flow with recipient materialization, progress truth in Outbox, and failure drilldown.

## Implemented
- Added migration `017_admin_broadcast_batching.sql`.
- Added batch/job metadata to `admin_comm_outbox`.
- Added `admin_broadcast_delivery_items` for materialized recipient delivery state.
- Broadcast confirm now clears the current draft before delivery, creates outbox + delivery items, then sends recipients in batches of 25.
- Outbox/detail now shows batch size, cursor, pending count, and last error.
- Added `Broadcast failures` surface and routing.
- Added smoke coverage for broadcast batching and idempotency.

## Notes
- This step stays read-first after send: no pause/resume UI and no bulk resend actions yet.
- Failed items are persisted for operator review; they are not automatically replayed in this step.
