-- STEP016 anti-abuse / retry / dedupe hardening.
-- Adds DB-backed webhook update receipts and short-lived per-user action guards.

create table if not exists telegram_update_receipts (
  update_id bigint primary key,
  received_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_telegram_update_receipts_expires_at
  on telegram_update_receipts(expires_at);

create table if not exists user_action_guards (
  guard_key text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_action_guards_expires_at
  on user_action_guards(expires_at);
