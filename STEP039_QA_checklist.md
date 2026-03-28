# STEP039 QA checklist

## Rollout
1. Apply `migrations/018_admin_scoped_search.sql`.
2. Merge STEP039 on top of STEP038.
3. Redeploy.
4. Verify `/api/health` reports `STEP039`.

## Manual checks
- `/ops` opens Admin with search shortcuts.
- `Admin Home` shows `🔎 Users`, `🔎 Intros`, `🔎 Delivery`, `🔎 Audit`.
- `Operations` shows `🔎 Search users` and `🔎 Search intros`.
- `Communications` shows `🔎 Search outbox`.
- `System` shows `🔎 Search audit` and `🔎 Search delivery`.
- `Users` screen search opens prompt, accepts text, returns results, and opens User Card.
- `Intros` screen search opens prompt, accepts text, returns results, and opens Intro Detail.
- `Delivery` search returns records and opens Delivery Detail.
- `Outbox` search returns records and opens Outbox Detail.
- `Audit` search returns records and opens Audit Detail.
- Search pagination works for any scope with more than one page.
- `Search again` returns to the correct prompt scope.
- `Back` from search results returns to the correct parent surface.

## Regression checks
- `/start`, `/menu`, `/help`, `/profile`, `/browse`, `/inbox`.
- `/ops` admin shell.
- Users + User Card.
- Direct message flow.
- Notice flow.
- Broadcast flow.
- Outbox.
- Intros + Delivery.
- Quality + Audit.

## Smoke checks run
- `npm run check`
- `npm run smoke:admin-search`
- `npm run smoke:admin-search-results`
- `npm run smoke:admin-productivity`
- `npm run smoke:admin-segmentation`
- `npm run smoke:admin-users`
- `npm run smoke:admin-intros`
- `npm run smoke:outbox`
- `npm run smoke:direct-message`
- `npm run smoke:admin-shell`
- `npm run smoke:admin-allowlist`
- `npm run smoke:admin-counters`
- `npm run smoke:admin-trends`
- `npm run smoke:broadcast`
- `npm run smoke:notice`
- `npm run smoke:audit-detail`
- `npm run smoke:router`
- `npm run smoke:product-surfaces`
