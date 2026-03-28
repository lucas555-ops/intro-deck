create table if not exists admin_notice_state (
  singleton_id integer primary key check (singleton_id = 1),
  body text not null default '',
  audience_key text not null check (audience_key in ('ALL', 'CONNECTED', 'NOT_CONNECTED', 'PROFILE_INCOMPLETE', 'READY_NOT_LISTED', 'LISTED')),
  is_active boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by_user_id bigint references users(id) on delete set null
);

create table if not exists admin_broadcast_drafts (
  singleton_id integer primary key check (singleton_id = 1),
  body text not null default '',
  audience_key text not null check (audience_key in ('ALL_CONNECTED', 'ALL_LISTED', 'NOT_CONNECTED', 'PROFILE_INCOMPLETE', 'READY_NOT_LISTED', 'LISTED_NO_INTROS_YET', 'PENDING_INTROS')),
  updated_at timestamptz not null default now(),
  updated_by_user_id bigint references users(id) on delete set null
);

create table if not exists admin_comms_input_sessions (
  operator_telegram_user_id bigint primary key,
  input_kind text not null check (input_kind in ('notice_body', 'broadcast_body')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_comm_outbox (
  id bigserial primary key,
  event_type text not null check (event_type in ('notice', 'broadcast')),
  body text not null,
  audience_key text,
  status text not null check (status in ('draft', 'sending', 'sent', 'sent_with_failures', 'failed', 'disabled', 'cancelled')),
  estimated_recipient_count integer,
  delivered_count integer,
  failed_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  created_by_user_id bigint references users(id) on delete set null
);

create index if not exists admin_comm_outbox_created_at_idx on admin_comm_outbox (created_at desc);
