create table if not exists invite_program_settings (
  key text primary key,
  value_json jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists invite_reward_events (
  id bigserial primary key,
  referrer_user_id bigint not null references users(id) on delete cascade,
  invited_user_id bigint not null references users(id) on delete cascade,
  invite_link_id bigint references member_invites(id) on delete set null,
  invite_code text,
  event_type text not null,
  status text not null,
  points integer not null,
  activation_at timestamptz not null,
  confirm_after timestamptz not null,
  confirmed_at timestamptz,
  rejected_at timestamptz,
  reject_reason text,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (event_type in ('invite_activation_reward')),
  check (status in ('pending', 'available', 'rejected', 'redeemed')),
  check (points > 0)
);

create unique index if not exists uniq_invite_reward_activation_per_invited
  on invite_reward_events (invited_user_id, event_type);
create index if not exists idx_invite_reward_events_referrer_created_at
  on invite_reward_events (referrer_user_id, created_at desc);
create index if not exists idx_invite_reward_events_invited_user
  on invite_reward_events (invited_user_id);
create index if not exists idx_invite_reward_events_status_confirm_after
  on invite_reward_events (status, confirm_after);

create table if not exists invite_reward_ledger (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  reward_event_id bigint references invite_reward_events(id) on delete set null,
  entry_type text not null,
  points_delta integer not null,
  balance_bucket text not null,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (entry_type in ('pending_credit', 'pending_reversal', 'available_credit', 'redeem_debit')),
  check (balance_bucket in ('pending', 'available', 'redeemed'))
);

create unique index if not exists uniq_invite_reward_ledger_event_entry_type
  on invite_reward_ledger (reward_event_id, entry_type)
  where reward_event_id is not null;
create index if not exists idx_invite_reward_ledger_user_created_at
  on invite_reward_ledger (user_id, created_at desc);
create index if not exists idx_invite_reward_ledger_user_bucket_created_at
  on invite_reward_ledger (user_id, balance_bucket, created_at desc);

create table if not exists invite_reward_redemptions (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  catalog_code text not null,
  points_cost integer not null,
  status text not null,
  meta_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (status in ('requested', 'completed', 'failed')),
  check (points_cost > 0)
);

insert into invite_program_settings (key, value_json, updated_at, updated_by)
values ('invite_rewards_mode', '{"mode":"off"}'::jsonb, now(), null)
on conflict (key) do nothing;

insert into invite_program_settings (key, value_json, updated_at, updated_by)
values (
  'invite_rewards_config',
  '{"activationPoints":10,"activationConfirmHours":24,"activationRuleVersion":"introdeck_listed_ready_v1","catalogVersion":"v1"}'::jsonb,
  now(),
  null
)
on conflict (key) do nothing;
