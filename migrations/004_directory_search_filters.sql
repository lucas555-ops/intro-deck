-- STEP009 directory search baseline.
-- Adds persisted text query and city narrowing on top of STEP008 filters.

alter table directory_filter_sessions
  add column if not exists text_query text,
  add column if not exists city_query text,
  add column if not exists pending_input_kind text,
  add column if not exists pending_input_expires_at timestamptz;

create index if not exists idx_directory_filter_sessions_pending_input_expires_at
  on directory_filter_sessions(pending_input_expires_at);
