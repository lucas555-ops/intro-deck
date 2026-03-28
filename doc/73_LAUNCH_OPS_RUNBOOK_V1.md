# 73 — LAUNCH / OPS RUNBOOK V1

## Purpose

This runbook defines how to operate the current Intro Deck baseline during a narrow launch window.
It is operational, not aspirational.

## Source truth

- Current source baseline: **STEP043**
- Required wording without deployment proof: **live status not confirmed — manual verification required**

## Daily operator rhythm

1. Open `⚙️ Система` and inspect retry / exhausted / failures.
2. Open `🧰 Операции` and inspect bottlenecks: no profile, ready-not-listed, pending >24h, delivery issues.
3. Open `💬 Коммуникации` and inspect active notice, latest broadcast, outbox failures.
4. Open `📜 Аудит` and inspect unusual relink / listing changes / bulk-prep.
5. Only then prepare notice, broadcast, or direct follow-up.

## Preflight before notice/broadcast

- no fresh callback/deploy incident
- no delivery failure spike
- audience matches the real bottleneck
- copy confirmed
- post-send check planned through Outbox / Delivery

## Incident routing

### LinkedIn callback degradation
- stop communications that assume fresh onboarding
- verify env / callback / health truth

### Delivery failure spike
- pause new broadcasts
- inspect Delivery / Outbox / Audit

### Listed-incomplete quality drift
- route through Users / Quality first
- clean quality before pushing traffic


## STEP043 companion docs

- `76_LIVE_VERIFICATION_PLAYBOOK_V1.md`
- `77_LAUNCH_REHEARSAL_CHECKLIST_V1.md`
- `78_GO_NO_GO_VERDICT_TEMPLATE_V1.md`
