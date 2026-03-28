# 76 — LIVE_VERIFICATION_PLAYBOOK_V1

## Purpose

This playbook defines the exact manual order for verifying the deployed Intro Deck baseline.
It is intentionally read-only and does not claim success by itself.

## Verification order

1. Public web
- open landing
- open privacy
- open terms
- confirm the Telegram bot link opens the expected bot

2. Health
- open `/api/health`
- open `/api/health?full=1`
- confirm `step` and `docsStep` match the current source baseline
- confirm key flags are configured as expected

3. Founder/operator access
- founder account: `/start` and `/menu`
- confirm `👑 Админка` is visible only to allowlisted operator/founder accounts
- confirm `/ops` and `/admin` still route into the operator shell

4. Admin surfaces
- open `Админка / Операции / Коммуникации / Система`
- open `Регламент запуска / Freeze / Live verification / Репетиция запуска`
- confirm there are no dead ends or broken callbacks

5. LinkedIn truth
- start connect flow
- confirm callback returns to the expected success/error path
- confirm identity/profile persistence truth looks correct

6. Communications
- send a narrow direct-message test
- prepare a notice safely
- prepare a broadcast preview safely
- confirm Outbox / Delivery / Audit reflect what actually happened

## Output

Record the result using the go/no-go template.
Allowed outcomes: go, no-go, or blocked.
