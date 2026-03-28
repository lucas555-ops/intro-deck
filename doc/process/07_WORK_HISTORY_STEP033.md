# STEP033 — Direct operator messaging from User Card + Outbox unification

## Goal
Add real direct operator messaging from User Card, with preview/confirm/send and unified Outbox records.

## What changed
- Added migration `016_admin_direct_message_outbox.sql`.
- Added direct message drafts and direct input session support.
- Added direct message compose, template picker, preview, confirm, and clear flows.
- Added direct outbox records with target-user drilldown.
- Added audit events for direct message sent/failed.

## Result
The admin layer now supports point-to-point operator communication from User Card without breaking existing Notice/Broadcast flows.
