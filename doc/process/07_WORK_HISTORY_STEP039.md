# STEP039 — Operator productivity shortcuts v2 + scoped search

## Goal
Add scoped operator search and faster shortcuts without creating a heavy global search system.

## Delivered
- `adm:search:users`
- `adm:search:intros`
- `adm:search:delivery`
- `adm:search:outbox`
- `adm:search:audit`
- search prompt surfaces
- search result surfaces with direct drilldowns
- quick search entrypoints on Admin Home and section screens

## Persistence
- Added `migrations/018_admin_scoped_search.sql`
- Reused admin input sessions for scoped search prompts
- Added persistent search state per operator and scope

## Acceptance
- Operator can run scoped search from admin surfaces
- Operator can paginate through results
- Operator can jump directly into the relevant entity detail
- Existing STEP028–038 flows remain intact
