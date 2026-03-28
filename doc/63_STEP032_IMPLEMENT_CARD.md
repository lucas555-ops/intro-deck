# STEP032 — Directory Quality Board + Audit Detail

## Goal
Add operator-facing directory quality buckets and a readable audit trail with detail drilldown.

## Scope
- Operations -> Quality
- quality buckets: listed incomplete, ready not listed, missing fields, duplicates, relinks
- System -> Audit list/detail
- audit event persistence and read models

## Acceptance
- `/ops -> Operations -> Quality` works for operator-only users
- `/ops -> System -> Audit` works for operator-only users
- quality list rows drill down into User Card
- audit list rows drill down into Audit Detail
- audit records are written for listing hide/unhide, operator note update, notice activate/disable, broadcast send/failure, LinkedIn relink transfer
- no user-facing regressions

## Rollout
1. Apply `migrations/015_admin_audit_events.sql`
2. Deploy STEP032
3. Verify `/api/health` -> `STEP032`
4. QA Quality and Audit surfaces in Telegram
