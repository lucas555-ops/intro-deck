# STEP043 — Live verification / launch rehearsal

## Goal

Freeze the current source baseline into an explicit manual verification and rehearsal contract without adding new product scope.

## In scope

- read-only System entrypoints for live verification and launch rehearsal
- verification/rehearsal docs
- go/no-go verdict template
- step/docs/health/version sync
- smoke coverage for the new System surfaces

## Out of scope

- claiming live readiness without proof
- new product features
- schema widening
- broad admin expansion

## Acceptance

- STEP043 is the repo source baseline
- System hub exposes `adm:verify` and `adm:rehearse`
- verification/rehearsal docs exist
- smoke coverage exists
- repo still says: live status not confirmed — manual verification required
