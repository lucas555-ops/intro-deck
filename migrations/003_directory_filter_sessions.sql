-- STEP008 directory browse filters baseline.
-- Persists narrow per-user filter state for public directory browsing.

create table if not exists directory_filter_sessions (
  user_id bigint primary key references users(id) on delete cascade,
  selected_industry_slug text,
  selected_skill_slugs text[] not null default '{}'::text[],
  updated_at timestamptz not null default now()
);

create index if not exists idx_directory_filter_sessions_updated_at on directory_filter_sessions(updated_at);
