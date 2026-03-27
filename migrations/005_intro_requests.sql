-- STEP011 intro request persistence baseline.
-- Adds durable intro request rows and powers the first inbox placeholder surface.

create table if not exists intro_requests (
  id bigserial primary key,
  requester_user_id bigint not null references users(id) on delete cascade,
  target_user_id bigint not null references users(id) on delete cascade,
  target_profile_id bigint not null references member_profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  unique (requester_user_id, target_profile_id)
);

create index if not exists idx_intro_requests_target_user_status on intro_requests(target_user_id, status, created_at desc);
create index if not exists idx_intro_requests_requester_user_status on intro_requests(requester_user_id, status, created_at desc);
