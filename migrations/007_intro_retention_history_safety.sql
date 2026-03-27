-- STEP017 intro retention / history safety baseline.
-- Preserve intro history when related profiles or users are later removed.
-- Strategy:
-- 1) store sender/target snapshots on intro_requests
-- 2) allow nullable foreign keys on intro_requests
-- 3) switch from ON DELETE CASCADE to ON DELETE SET NULL for intro history rows

alter table intro_requests
  add column if not exists requester_display_name text,
  add column if not exists requester_headline_user text,
  add column if not exists requester_linkedin_public_url text,
  add column if not exists target_display_name text,
  add column if not exists target_headline_user text,
  add column if not exists target_linkedin_public_url text;

update intro_requests ir
set requester_display_name = coalesce(ir.requester_display_name, nullif(mp.display_name, ''), la.full_name),
    requester_headline_user = coalesce(ir.requester_headline_user, mp.headline_user),
    requester_linkedin_public_url = coalesce(ir.requester_linkedin_public_url, mp.linkedin_public_url)
from users u
left join member_profiles mp on mp.user_id = u.id
left join linkedin_accounts la on la.user_id = u.id
where u.id = ir.requester_user_id;

update intro_requests ir
set target_display_name = coalesce(ir.target_display_name, nullif(mp.display_name, ''), la.full_name),
    target_headline_user = coalesce(ir.target_headline_user, mp.headline_user),
    target_linkedin_public_url = coalesce(ir.target_linkedin_public_url, mp.linkedin_public_url)
from users u
left join member_profiles mp on mp.user_id = u.id
left join linkedin_accounts la on la.user_id = u.id
where u.id = ir.target_user_id;

alter table intro_requests
  alter column requester_user_id drop not null,
  alter column target_user_id drop not null,
  alter column target_profile_id drop not null;

alter table intro_requests drop constraint if exists intro_requests_requester_user_id_fkey;
alter table intro_requests drop constraint if exists intro_requests_target_user_id_fkey;
alter table intro_requests drop constraint if exists intro_requests_target_profile_id_fkey;

alter table intro_requests
  add constraint intro_requests_requester_user_id_fkey
    foreign key (requester_user_id) references users(id) on delete set null,
  add constraint intro_requests_target_user_id_fkey
    foreign key (target_user_id) references users(id) on delete set null,
  add constraint intro_requests_target_profile_id_fkey
    foreign key (target_profile_id) references member_profiles(id) on delete set null;
