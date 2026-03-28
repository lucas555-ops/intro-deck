# STEP032 — Directory Quality Board + Audit Detail

## Goal
Add operator-facing quality buckets for the directory and a readable audit trail with detail drilldown.

## Included
- Operations -> Quality
- quality buckets: listed incomplete, ready not listed, missing fields, duplicates, relinks
- System -> Audit
- Audit detail
- audit event persistence via `015_admin_audit_events.sql`

## Audit event coverage
- admin_listing_hidden
- admin_listing_unhidden
- admin_user_note_updated
- admin_notice_activated
- admin_notice_disabled
- admin_broadcast_sent
- admin_broadcast_failed
- linkedin_relink_transferred

## Rollout notes
Apply `migrations/015_admin_audit_events.sql` before using STEP032 operator mutations or quality/audit surfaces.
