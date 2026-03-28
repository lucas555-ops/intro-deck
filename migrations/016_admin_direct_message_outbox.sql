alter table if exists admin_comms_input_sessions
  drop constraint if exists admin_comms_input_sessions_input_kind_check;

alter table if exists admin_comms_input_sessions
  add column if not exists target_user_id bigint references users(id) on delete cascade,
  add column if not exists segment_key text,
  add column if not exists page integer;

update admin_comms_input_sessions
set segment_key = coalesce(segment_key, 'all'),
    page = coalesce(page, 0)
where segment_key is null or page is null;

alter table if exists admin_comms_input_sessions
  alter column segment_key set default 'all',
  alter column segment_key set not null,
  alter column page set default 0,
  alter column page set not null;

alter table if exists admin_comms_input_sessions
  add constraint admin_comms_input_sessions_input_kind_check
  check (input_kind in ('notice_body', 'broadcast_body', 'direct_body'));

create table if not exists admin_direct_message_drafts (
  operator_telegram_user_id bigint primary key,
  target_user_id bigint not null references users(id) on delete cascade,
  body text not null default '',
  template_key text,
  segment_key text not null default 'all',
  page integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by_user_id bigint references users(id) on delete set null
);

alter table if exists admin_comm_outbox
  drop constraint if exists admin_comm_outbox_event_type_check;

alter table if exists admin_comm_outbox
  add column if not exists target_user_id bigint references users(id) on delete set null;

alter table if exists admin_comm_outbox
  add constraint admin_comm_outbox_event_type_check
  check (event_type in ('notice', 'broadcast', 'direct'));

create index if not exists admin_comm_outbox_target_user_id_idx on admin_comm_outbox (target_user_id);
create index if not exists admin_direct_message_drafts_target_user_id_idx on admin_direct_message_drafts (target_user_id);
