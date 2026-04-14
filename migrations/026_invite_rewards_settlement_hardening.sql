alter table invite_reward_events
  add column if not exists settled_at timestamptz,
  add column if not exists settlement_run_id text,
  add column if not exists state_version integer not null default 1;

create index if not exists idx_invite_reward_events_status_settled_at
  on invite_reward_events(status, settled_at desc nulls last);
create index if not exists idx_invite_reward_events_settlement_run_id
  on invite_reward_events(settlement_run_id)
  where settlement_run_id is not null;

create table if not exists invite_reward_settlement_runs (
  id bigserial primary key,
  run_id text not null unique,
  mode_snapshot text not null,
  status text not null,
  processed_count integer not null default 0,
  confirmed_count integer not null default 0,
  rejected_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  meta_json jsonb not null default '{}'::jsonb,
  check (status in ('running', 'completed', 'failed')),
  check (mode_snapshot in ('off', 'earn_only', 'live', 'paused'))
);

create index if not exists idx_invite_reward_settlement_runs_started_at
  on invite_reward_settlement_runs(started_at desc);
create index if not exists idx_invite_reward_settlement_runs_status_started_at
  on invite_reward_settlement_runs(status, started_at desc);

alter table invite_reward_redemptions
  add column if not exists source_available_entry_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'invite_reward_redemptions_source_available_entry_fk'
  ) then
    alter table invite_reward_redemptions
      add constraint invite_reward_redemptions_source_available_entry_fk
      foreign key (source_available_entry_id) references invite_reward_ledger(id) on delete set null;
  end if;
end $$;

create index if not exists idx_invite_reward_redemptions_status_completed_at
  on invite_reward_redemptions(status, completed_at desc nulls last);
