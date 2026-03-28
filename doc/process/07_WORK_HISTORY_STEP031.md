# STEP031 — Intros + Delivery operator surfaces

## Goal

Add read-first operator visibility for the intro pipeline and notification delivery pipeline on top of the STEP030 admin shell and communications baseline.

## Delivered

- `🧰 Operations -> 📨 Intros`
- intro segment filters: All / Pending / Accepted / Declined / Stale / Failed notify
- intro pagination and compact list rows
- `📄 Intro Detail` with sender / recipient summaries and receipt summary
- drilldown from Intro Detail to sender and recipient User Card
- `🧾 Delivery` list with segment filters: All / Recent failures / Retry due / Exhausted / Delivered recent
- intro-scoped delivery drilldown from Intro Detail
- `🧾 Delivery Detail` with sanitized error summary and open-intro back path
- `adm:` callback routing for intro and delivery surfaces
- smoke coverage for admin intro and delivery routing contracts

## Notes

- STEP031 is code-only and does not require a new migration.
- Existing retry diagnostics remain available in `System -> Retry` and via legacy `ops:*` callbacks.
- Delivery surfaces stay read-first in this step: no resend / repair mutations were added.
- Intro detail reflects the current durable intro payload model; there is still no free-form intro message body contract.

## Validation

- `npm run check`
- `npm run smoke:admin-shell`
- `npm run smoke:admin-allowlist`
- `npm run smoke:admin-users`
- `npm run smoke:admin-user-card`
- `npm run smoke:notice`
- `npm run smoke:broadcast`
- `npm run smoke:outbox`
- `npm run smoke:admin-intros`
- `npm run smoke:admin-delivery`
- `npm run smoke:ops`
- `npm run smoke:commands`
- `npm run smoke:bot-init`
- `npm run smoke:auth`
- `npm run smoke:oauth-routes`

## Next

- STEP032 — Directory quality board + Audit detail
