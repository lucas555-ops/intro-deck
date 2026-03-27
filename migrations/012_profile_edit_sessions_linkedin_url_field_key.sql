-- STEP025: allow LinkedIn URL edit sessions to persist using field_key = 'li'

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'profile_edit_sessions'
      and constraint_name = 'profile_edit_sessions_field_key_check'
  ) then
    alter table profile_edit_sessions
      drop constraint profile_edit_sessions_field_key_check;
  end if;
end $$;

alter table profile_edit_sessions
  add constraint profile_edit_sessions_field_key_check
  check (field_key in ('dn', 'hl', 'co', 'ci', 'in', 'ab', 'li'));
