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
