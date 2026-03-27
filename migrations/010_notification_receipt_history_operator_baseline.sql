-- STEP023 receipt history / operator diagnostics baseline.
-- Adds narrow read-path indexes for recent receipt diagnostics and per-intro drilldowns.

create index if not exists idx_notification_receipts_intro_recent
  on notification_receipts(intro_request_id, created_at desc, last_attempt_at desc);

create index if not exists idx_notification_receipts_status_recent
  on notification_receipts(delivery_status, created_at desc, last_attempt_at desc);
