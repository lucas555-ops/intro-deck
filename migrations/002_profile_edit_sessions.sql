-- STEP005 profile edit sessions for in-Telegram profile completion input mode.

create table if not exists profile_edit_sessions (
  user_id bigint primary key references users(id) on delete cascade,
  field_key text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  check (field_key in ('dn', 'hl', 'co', 'ci', 'in', 'ab'))
);

create index if not exists idx_profile_edit_sessions_expires_at on profile_edit_sessions(expires_at);
