# STEP048 — PRICING / ANALYTICS / OPS

## Contract

STEP048 adds a narrow revenue/control layer without broad product rewrite.

### Shipped contract

- Pro monthly subscription exists as a first-class product surface
- purchase receipts are stored explicitly
- direct-contact and DM paid actions can be counted explicitly
- active Pro is an entitlement, not just a badge
- payment does not bypass recipient consent
- admin gets a compact monetization hub, not a bloated dashboard

### Current monetization truth

- `contact_unlock` and `dm_open` one-time purchase flows still exist
- active Pro covers those outbound actions while the subscription is active
- direct-contact approval still depends on target user approval
- DM request success still depends on recipient acceptance

### Current analytics truth

Admin monetization summary now exposes:
- active / expired Pro counts
- Stars revenue 7d / 30d
- Pro purchases 7d
- contact request / paid / revealed / declined counts 7d
- DM created / paid / delivered / accepted / blocked / reported counts 7d
- active DM threads now
- recent confirmed receipts feed

### Not claimed here

- no external BI/reporting stack
- no dynamic pricing lab
- no quota packs / bundles
- no enterprise plan layer
- no live production purchase proof inside this source-only step
