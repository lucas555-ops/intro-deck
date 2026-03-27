-- STEP022 notification retry baseline.
-- Extends durable notification receipts with retry scheduling metadata.

alter table notification_receipts
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists max_attempts integer not null default 3,
  add column if not exists last_error_code text;

alter table notification_receipts
  drop constraint if exists notification_receipts_max_attempts_check;

alter table notification_receipts
  add constraint notification_receipts_max_attempts_check check (max_attempts > 0);

create index if not exists idx_notification_receipts_retry_due
  on notification_receipts(delivery_status, next_attempt_at, created_at)
  where delivery_status in ('pending', 'failed');
