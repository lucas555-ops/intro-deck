# STEP037 — Compact admin analytics + trend counters

## Goal

Add lightweight operator trend visibility on top of the STEP036 admin baseline without introducing a heavyweight dashboard or new runtime domain.

## Implemented

- Extended admin dashboard summary queries with compact 24h / 7d trend counters for users, LinkedIn connects, listed profiles, intros, delivery failures, broadcasts, direct messages, and operator actions.
- Added trend summaries to `👑 Admin`, `🧰 Operations`, `💬 Communications`, and `⚙️ System` hub surfaces.
- Wired communications state with delivered/failed broadcast recipient trends and direct-message / outbox-failure windows.
- Added `smoke:admin-trends` coverage.
- Fixed two latent admin return-shape bugs while reconciling the STEP037 baseline:
  - removed stray `targetUserFilter` references from Users list state
  - removed stray `targetUserFilter` reference from broadcast-failures state
- Synced `api/health.js`, `README.md`, and `doc/00_CURRENT_STATE.md` to STEP037.

## Acceptance

- Admin hub screens now show compact 24h / 7d trend summaries.
- No migration is required.
- Existing admin flows remain intact.
- Product-facing user surfaces are unchanged.
