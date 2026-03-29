create table if not exists member_dm_threads (
  id bigserial primary key,
  initiator_user_id bigint not null references users(id) on delete cascade,
  recipient_user_id bigint not null references users(id) on delete cascade,
  target_profile_id bigint references member_profiles(id) on delete set null,
  opened_via text not null default 'profile_card' check (opened_via in ('profile_card', 'contact_unlock', 'intro_followup', 'other')),
  status text not null default 'draft' check (status in ('draft', 'payment_pending', 'pending_recipient', 'active', 'declined', 'blocked', 'closed')),
  payment_state text not null default 'draft' check (payment_state in ('draft', 'pending', 'confirmed', 'not_required')),
  price_stars_snapshot integer not null default 0,
  first_message_text text,
  blocked_by_user_id bigint references users(id) on delete set null,
  reported_by_user_id bigint references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  blocked_at timestamptz,
  closed_at timestamptz,
  last_message_at timestamptz,
  last_sender_user_id bigint references users(id) on delete set null,
  telegram_payment_charge_id text,
  provider_payment_charge_id text,
  check (initiator_user_id <> recipient_user_id)
);

create index if not exists member_dm_threads_initiator_status_idx on member_dm_threads (initiator_user_id, status, updated_at desc);
create index if not exists member_dm_threads_recipient_status_idx on member_dm_threads (recipient_user_id, status, updated_at desc);
create index if not exists member_dm_threads_pair_idx on member_dm_threads (least(initiator_user_id, recipient_user_id), greatest(initiator_user_id, recipient_user_id), updated_at desc);

create table if not exists member_dm_messages (
  id bigserial primary key,
  thread_id bigint not null references member_dm_threads(id) on delete cascade,
  sender_user_id bigint not null references users(id) on delete cascade,
  recipient_user_id bigint not null references users(id) on delete cascade,
  message_kind text not null default 'message' check (message_kind in ('request', 'message')),
  message_text text not null,
  delivery_state text not null default 'delivered' check (delivery_state in ('created', 'delivered', 'failed')),
  created_at timestamptz not null default now(),
  delivered_at timestamptz,
  failed_at timestamptz
);

create index if not exists member_dm_messages_thread_id_idx on member_dm_messages (thread_id, id desc);

create table if not exists member_dm_compose_sessions (
  user_id bigint primary key references users(id) on delete cascade,
  thread_id bigint not null references member_dm_threads(id) on delete cascade,
  compose_mode text not null check (compose_mode in ('request', 'reply')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists member_dm_compose_sessions_expires_at_idx on member_dm_compose_sessions (expires_at);

create table if not exists member_dm_events (
  id bigserial primary key,
  thread_id bigint not null references member_dm_threads(id) on delete cascade,
  actor_user_id bigint references users(id) on delete set null,
  event_type text not null,
  detail_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists member_dm_events_thread_id_idx on member_dm_events (thread_id, created_at desc);
