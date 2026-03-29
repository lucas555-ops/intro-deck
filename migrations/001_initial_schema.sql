-- STEP004 baseline schema. Wired into runtime storage paths when DATABASE_URL is configured.

create table if not exists users (
  id bigserial primary key,
  telegram_user_id bigint not null unique,
  telegram_username text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists linkedin_accounts (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  linkedin_sub text not null unique,
  full_name text,
  given_name text,
  family_name text,
  picture_url text,
  email text,
  email_verified boolean not null default false,
  locale text,
  raw_oidc_claims_json jsonb,
  linked_at timestamptz not null default now(),
  last_refresh_at timestamptz,
  unique(user_id)
);

create table if not exists member_profiles (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  display_name text,
  headline_user text,
  company_user text,
  city_user text,
  industry_user text,
  about_user text,
  linkedin_public_url text,
  telegram_username_hidden text,
  visibility_status text not null default 'hidden',
  contact_mode text not null default 'intro_request',
  profile_state text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (visibility_status in ('hidden', 'listed')),
  check (contact_mode in ('intro_request', 'paid_unlock_requires_approval', 'telegram_only', 'external_link')),
  check (profile_state in ('draft', 'active', 'paused')),
  unique(user_id)
);

create table if not exists member_profile_skills (
  profile_id bigint not null references member_profiles(id) on delete cascade,
  skill_slug text not null,
  skill_label text not null,
  primary key (profile_id, skill_slug)
);

create index if not exists idx_linkedin_accounts_user_id on linkedin_accounts(user_id);
create index if not exists idx_member_profiles_visibility_state on member_profiles(visibility_status, profile_state);


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

create index if not exists idx_contact_unlock_requests_target_status on contact_unlock_requests(target_user_id, status, updated_at desc);
create index if not exists idx_contact_unlock_requests_requester_status on contact_unlock_requests(requester_user_id, status, updated_at desc);
create unique index if not exists uniq_contact_unlock_requests_active_pair on contact_unlock_requests(requester_user_id, target_profile_id, contact_type) where status in ('payment_pending', 'paid_pending_approval');


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
