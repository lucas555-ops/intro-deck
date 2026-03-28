# STEP033 — Direct operator messaging from User Card + Outbox unification

## Goal
Turn `✉️ Message` in User Card into a real operator flow with template selection, edit, preview, confirm, send, audit trail, and unified outbox records.

## Scope
- direct message drafts
- direct input sessions
- template picker
- preview + confirm send
- direct outbox records
- audit events for sent/failed direct messages

## SQL
- `migrations/016_admin_direct_message_outbox.sql`

## Acceptance
- operator can open User Card -> Message
- operator can apply a template or custom text
- operator can preview and confirm send
- direct messages are logged in Outbox with target user metadata
- audit records include direct message sent/failed events
