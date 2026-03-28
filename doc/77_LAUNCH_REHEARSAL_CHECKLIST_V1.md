# 77 — LAUNCH_REHEARSAL_CHECKLIST_V1

## Goal

Run one narrow founder/operator rehearsal before any real launch claim.

## Checklist

- [ ] Open `/api/health` and `/api/health?full=1`
- [ ] Confirm current step/docs step match source baseline
- [ ] Founder account sees `👑 Админка`
- [ ] Non-operator account does not get operator access
- [ ] `Админка / Операции / Коммуникации / Система` all open cleanly
- [ ] `Регламент запуска / Freeze / Live verification / Репетиция запуска` open cleanly
- [ ] User segments and funnel drilldowns still route correctly
- [ ] Bulk-prep still stays guarded
- [ ] Direct message test reaches the target user
- [ ] Notice/broadcast prep reaches preview without unintended send
- [ ] Outbox/Delivery/Audit reflect the rehearsal honestly
- [ ] Any issue is written down before changing scope

## Rule

If any critical item fails, rehearsal is not a partial success.
Freeze stays active until the issue is fixed and re-checked.
