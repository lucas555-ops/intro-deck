# 07_WORK_HISTORY_STEP025

## STEP
STEP025 — profile edit-session schema fix for LinkedIn URL

## Goal
Fix the DB constraint drift that blocked the `🔗 LinkedIn URL` editor.

## What changed
- added migration `012_profile_edit_sessions_linkedin_url_field_key.sql`
- expanded `profile_edit_sessions_field_key_check` to include `li`
- added `scripts/smoke_profile_edit_session_schema_contract.js`

## Outcome
The code-level `li` editor and the DB schema contract are aligned.

## Truth
- source-confirmed: yes
- live-confirmed: requires migration application in the target database
