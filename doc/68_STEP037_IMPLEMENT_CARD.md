# STEP037 — Compact admin analytics + trend counters

## Goal

Give operators a fast 24h / 7d pulse across Admin / Operations / Communications / System hubs without adding a new analytics dashboard or new mutable workflows.

## Scope

- Extend admin dashboard summary queries.
- Add compact trend blocks to hub surfaces.
- Keep existing callback namespace and admin navigation intact.
- No schema migration.

## Surfaces

- `👑 Admin`
- `🧰 Operations`
- `💬 Communications`
- `⚙️ System`

## Data

- Users: new users, new LinkedIn connects, listed profiles.
- Intros: created, accepted, declined, pending older than 24h.
- Delivery: failures 24h / 7d, delivered 24h / 7d, exhausted now.
- Communications: broadcasts 7d, delivered/failed broadcast recipients 7d, direct messages 24h / 7d, outbox failures 24h / 7d.
- Audit: operator actions 24h / 7d, listing changes 7d, relinks 7d.

## Acceptance

- Trend counters render on all admin hubs.
- Existing admin flows keep working.
- No migration required.
- New smoke `smoke:admin-trends` passes.
