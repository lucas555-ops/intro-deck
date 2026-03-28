# STEP036 — Segmentation refinement + operator productivity pass

## Goal

Tighten daily operator workflows after STEP035 with more useful segments, faster shortcuts, and cleaner cross-links between admin surfaces.

## Implemented

- Refined Users segments with connected-no-profile, ready-no-skills, listed-active, listed-inactive, no-intros-yet, and recent-relinks buckets.
- Refined Intros segments with pending >24h, pending >72h, accepted recent, declined recent, and delivery-problem views.
- Refined Broadcast audiences with listed-inactive, connected-no-profile, ready-no-skills, and recent-pending-intros targeting.
- Added Admin-home quick actions for high-frequency operator paths.
- Added User Card shortcuts into direct message, scoped user intros, and scoped user audit.
- Added scoped Intros and scoped Audit list/detail drilldowns plus stronger audit-detail cross-links into intro and outbox records.
- Added smoke coverage for admin segmentation and operator productivity.

## Acceptance

- Operator can reach frequent paths in fewer taps from Admin home and User Card.
- Refined segments are available in Users, Intros, and Communications targeting.
- Scoped drilldowns do not break existing admin flows.
- No new migration is required.
