-- STEP029 admin users baseline.
-- Adds durable operator notes and DB-backed operator note input sessions.

create table if not exists admin_user_notes (
  user_id bigint primary key references users(id) on delete cascade,
  note_text text not null,
  updated_at timestamptz not null default now(),
  updated_by_user_id bigint references users(id) on delete set null
);

create table if not exists admin_user_note_sessions (
  operator_telegram_user_id bigint primary key,
  target_user_id bigint not null references users(id) on delete cascade,
  segment_key text not null default 'all',
  page integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (segment_key in ('all', 'conn', 'inc', 'ready', 'listd', 'pend')),
  check (page >= 0)
);

create index if not exists idx_admin_user_note_sessions_target_user_id
  on admin_user_note_sessions(target_user_id);
