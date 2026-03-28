create table if not exists admin_search_states (
  operator_telegram_user_id bigint not null,
  scope_key text not null check (scope_key in ('users', 'intros', 'delivery', 'outbox', 'audit')),
  query_text text not null default '',
  page integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (operator_telegram_user_id, scope_key)
);

alter table if exists admin_comms_input_sessions
  drop constraint if exists admin_comms_input_sessions_input_kind_check;

alter table if exists admin_comms_input_sessions
  add constraint admin_comms_input_sessions_input_kind_check
  check (input_kind in (
    'notice_body',
    'broadcast_body',
    'direct_body',
    'search_users',
    'search_intros',
    'search_delivery',
    'search_outbox',
    'search_audit'
  ));

create index if not exists admin_search_states_updated_at_idx on admin_search_states (updated_at desc);
