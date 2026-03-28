alter table if exists admin_comm_outbox
  add column if not exists batch_size integer,
  add column if not exists cursor integer not null default 0,
  add column if not exists started_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists last_error text;

alter table if exists admin_comm_outbox
  drop constraint if exists admin_comm_outbox_status_check;

alter table if exists admin_comm_outbox
  add constraint admin_comm_outbox_status_check
  check (status in ('draft', 'queued', 'sending', 'sent', 'sent_with_failures', 'failed', 'disabled', 'cancelled'));

create table if not exists admin_broadcast_delivery_items (
  id bigserial primary key,
  outbox_id bigint not null references admin_comm_outbox(id) on delete cascade,
  target_user_id bigint not null references users(id) on delete cascade,
  target_telegram_user_id bigint not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed', 'retry_due', 'exhausted')),
  attempts integer not null default 0,
  last_error text,
  retry_due_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (outbox_id, target_user_id)
);

create index if not exists admin_broadcast_delivery_items_outbox_id_idx on admin_broadcast_delivery_items (outbox_id, id);
create index if not exists admin_broadcast_delivery_items_status_idx on admin_broadcast_delivery_items (status, retry_due_at);
