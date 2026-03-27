-- STEP024.5 micro-hardening / deploy-readiness.
-- Aligns notification receipt retention with intro history safety.

alter table notification_receipts
  drop constraint if exists notification_receipts_recipient_user_id_fkey;

alter table notification_receipts
  alter column recipient_user_id drop not null;

alter table notification_receipts
  add constraint notification_receipts_recipient_user_id_fkey
  foreign key (recipient_user_id) references users(id) on delete set null;
