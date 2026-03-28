# STEP030 — Notice + Broadcast baseline

## Goal

Add the first operator communications layer on top of STEP029:
- singleton Notice
- bounded Broadcast flow
- Outbox history
- selected user-surface notice rendering

## What changed

- Added migration `014_admin_communications_baseline.sql`
- Added DB-backed singleton notice state
- Added DB-backed broadcast draft state
- Added DB-backed communications input sessions
- Added communications outbox history
- Added operator Notice surface:
  - edit text
  - audience selection
  - preview
  - activate / disable
- Added operator Broadcast surface:
  - edit text
  - audience selection
  - preview
  - confirm send
  - clear draft
- Added Outbox list + record detail
- Added active notice rendering on Home and Profile hub for matching audiences
- Preserved operator allowlist gating and existing `/ops` admin shell

## Audience model

### Notice
- ALL
- CONNECTED
- NOT_CONNECTED
- PROFILE_INCOMPLETE
- READY_NOT_LISTED
- LISTED

### Broadcast
- ALL_CONNECTED
- ALL_LISTED
- NOT_CONNECTED
- PROFILE_INCOMPLETE
- READY_NOT_LISTED
- LISTED_NO_INTROS_YET
- PENDING_INTROS

## Safety decisions

- Notice is singleton in v1
- Broadcast uses draft → preview → confirm → send
- Broadcast send is bounded and synchronous for the current product scale
- Outbox is read-only in this step
- Direct 1:1 messaging from User Card stays scaffolded for a later step
- Notice is rendered only on selected user surfaces in this step:
  - Home
  - Profile hub

## Smoke coverage added

- `smoke:notice`
- `smoke:broadcast`
- `smoke:outbox`

## Rollout notes

Before live validation:
1. apply migration `014_admin_communications_baseline.sql`
2. deploy STEP030
3. validate `/ops -> Communications`
4. validate notice on matching user states
5. validate bounded broadcast send on a small audience first
