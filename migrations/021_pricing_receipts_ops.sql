create table if not exists member_subscriptions (
  id bigserial primary key,
  user_id bigint not null unique references users(id) on delete cascade,
  plan_code text not null,
  state text not null check (state in ('none', 'active', 'expired', 'cancelled')),
  source text not null default 'telegram_stars',
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  telegram_payment_charge_id text,
  provider_payment_charge_id text,
  last_receipt_id bigint
);

create index if not exists idx_member_subscriptions_state_expires on member_subscriptions(state, expires_at desc);
create index if not exists idx_member_subscriptions_plan_state on member_subscriptions(plan_code, state, expires_at desc);

create table if not exists purchase_receipts (
  id bigserial primary key,
  user_id bigint not null references users(id) on delete cascade,
  receipt_type text not null check (receipt_type in ('subscription', 'contact_unlock', 'dm_open')),
  product_code text not null,
  amount_stars integer not null check (amount_stars > 0),
  status text not null default 'confirmed' check (status in ('created', 'pending', 'confirmed', 'failed', 'cancelled', 'refunded')),
  related_entity_type text,
  related_entity_id bigint,
  provider_receipt_ref text,
  telegram_payment_charge_id text,
  provider_payment_charge_id text,
  purchased_at timestamptz not null default now(),
  confirmed_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  raw_payload_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_purchase_receipts_telegram_charge on purchase_receipts(telegram_payment_charge_id) where telegram_payment_charge_id is not null;
create unique index if not exists uq_purchase_receipts_provider_charge on purchase_receipts(provider_payment_charge_id) where provider_payment_charge_id is not null;
create index if not exists idx_purchase_receipts_user_status on purchase_receipts(user_id, status, confirmed_at desc);
create index if not exists idx_purchase_receipts_type_status on purchase_receipts(receipt_type, status, confirmed_at desc);
create index if not exists idx_purchase_receipts_related_entity on purchase_receipts(related_entity_type, related_entity_id);
