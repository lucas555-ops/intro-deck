create table if not exists admin_audit_events (
  id bigserial primary key,
  event_type text not null,
  actor_user_id bigint references users(id) on delete set null,
  target_user_id bigint references users(id) on delete set null,
  secondary_target_user_id bigint references users(id) on delete set null,
  intro_request_id bigint references intro_requests(id) on delete set null,
  notification_receipt_id bigint references notification_receipts(id) on delete set null,
  summary text not null default '',
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_events_event_type_idx on admin_audit_events (event_type, created_at desc);
create index if not exists admin_audit_events_target_user_idx on admin_audit_events (target_user_id, created_at desc);
create index if not exists admin_audit_events_actor_user_idx on admin_audit_events (actor_user_id, created_at desc);
