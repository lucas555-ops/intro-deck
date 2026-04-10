alter table if exists admin_broadcast_drafts
  add column if not exists media_ref text,
  add column if not exists button_text text,
  add column if not exists button_url text;

alter table if exists admin_comm_outbox
  add column if not exists media_ref text,
  add column if not exists button_text text,
  add column if not exists button_url text;

alter table if exists admin_comms_input_sessions
  drop constraint if exists admin_comms_input_sessions_input_kind_check;

alter table if exists admin_comms_input_sessions
  add constraint admin_comms_input_sessions_input_kind_check
  check (input_kind in (
    'notice_body',
    'broadcast_body',
    'broadcast_media',
    'broadcast_button_text',
    'broadcast_button_url',
    'direct_body',
    'search_users',
    'search_intros',
    'search_delivery',
    'search_outbox',
    'search_audit'
  ));
