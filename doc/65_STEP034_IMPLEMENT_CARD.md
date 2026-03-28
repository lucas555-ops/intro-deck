# STEP034 IMPLEMENT CARD

## Goal
Harden operator broadcast delivery with recipient materialization, bounded batching, outbox truth, and failures drilldown.

## Scope
- Broadcast job metadata in outbox
- Broadcast delivery item table
- Batch processing in `sendAdminBroadcast`
- Broadcast failures surface
- Outbox/detail progress fields
- Docs, health, smoke coverage

## Acceptance
- Broadcast draft is cleared before delivery starts
- Recipients are materialized once per broadcast
- Delivery runs in batches
- Outbox shows progress and failure counts
- Operator can open failures from Broadcast and Outbox detail
- Existing notice/direct/outbox flows keep working
