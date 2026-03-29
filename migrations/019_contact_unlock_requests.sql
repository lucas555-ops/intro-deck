-- STEP046 — private Telegram handle + paid contact unlock v1

alter table if exists member_profiles
  add column if not exists telegram_username_hidden text;

alter table if exists member_profiles
  drop constraint if exists member_profiles_contact_mode_check;

alter table if exists member_profiles
  add constraint member_profiles_contact_mode_check
  check (contact_mode in ('intro_request', 'paid_unlock_requires_approval', 'telegram_only', 'external_link'));

create table if not exists contact_unlock_requests (
  id bigserial primary key,
  requester_user_id bigint not null references users(id) on delete cascade,
  target_user_id bigint not null references users(id) on delete cascade,
  target_profile_id bigint not null references member_profiles(id) on delete cascade,
  contact_type text not null default 'telegram_username',
  status text not null default 'payment_pending',
  payment_state text not null default 'pending',
  price_stars_snapshot integer not null,
  policy_snapshot text not null,
  requester_display_name text,
  requester_headline_user text,
  target_display_name text,
  target_headline_user text,
  telegram_payment_charge_id text,
  provider_payment_charge_id text,
  revealed_contact_value text,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  declined_at timestamptz,
  revealed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (contact_type in ('telegram_username')),
  check (status in ('payment_pending', 'paid_pending_approval', 'revealed', 'declined', 'cancelled')),
  check (payment_state in ('pending', 'paid', 'failed', 'refunded')),
  check (price_stars_snapshot > 0),
  unique (telegram_payment_charge_id)
);

create index if not exists idx_contact_unlock_requests_target_status
  on contact_unlock_requests(target_user_id, status, updated_at desc);

create index if not exists idx_contact_unlock_requests_requester_status
  on contact_unlock_requests(requester_user_id, status, updated_at desc);

create unique index if not exists uniq_contact_unlock_requests_active_pair
  on contact_unlock_requests(requester_user_id, target_profile_id, contact_type)
  where status in ('payment_pending', 'paid_pending_approval');
