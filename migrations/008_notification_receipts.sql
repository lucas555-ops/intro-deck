-- STEP020 notification / receipt layer.
-- Adds durable notification receipts for intro lifecycle service messages.

create table if not exists notification_receipts (
  id bigserial primary key,
  event_key text not null unique,
  event_type text not null,
  intro_request_id bigint references intro_requests(id) on delete set null,
  recipient_user_id bigint not null references users(id) on delete cascade,
  recipient_telegram_user_id bigint,
  delivery_status text not null default 'pending',
  sent_message_id bigint,
  error_message text,
  payload_json jsonb,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  check (delivery_status in ('pending', 'sent', 'failed', 'skipped'))
);

create index if not exists idx_notification_receipts_recipient_created_at
  on notification_receipts(recipient_user_id, created_at desc);
create index if not exists idx_notification_receipts_intro_request
  on notification_receipts(intro_request_id, created_at desc);
