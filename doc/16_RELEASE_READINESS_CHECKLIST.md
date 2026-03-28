# 16_RELEASE_READINESS_CHECKLIST

This project is still not automatically release-ready.
STEP043 tightens this checklist around launch/runbook/freeze truth plus explicit verification/rehearsal discipline.

## Product truth

- [ ] Auth flow manually verified against a real LinkedIn app
- [ ] Listed/active visibility manually verified
- [ ] Intro flow manually verified end to end in deployed runtime
- [ ] Notice / Broadcast / Outbox manually verified in deployed runtime

## Runtime / env

- [ ] `DATABASE_URL` configured
- [ ] LinkedIn env configured
- [ ] callback URL configured in LinkedIn app
- [ ] operator allowlist env configured correctly

## Operator / launch discipline

- [ ] `73_LAUNCH_OPS_RUNBOOK_V1.md` matches real operator flow
- [ ] `74_LAUNCH_FREEZE_POLICY_V1.md` matches allowed-change policy
- [ ] `76_LIVE_VERIFICATION_PLAYBOOK_V1.md` matches the real verification pass order
- [ ] `77_LAUNCH_REHEARSAL_CHECKLIST_V1.md` matches the real rehearsal flow
- [ ] `78_GO_NO_GO_VERDICT_TEMPLATE_V1.md` is ready to record the outcome

## Smoke

- [ ] `npm run check`
- [ ] relevant smoke set passes
- [ ] runbook/freeze smoke exists in repo
- [ ] live-verification/rehearsal smoke exists in repo

## Docs

- [ ] `00_CURRENT_STATE.md` matches actual repo baseline
- [ ] current handoff is refreshed
- [ ] current start-new-chat prompt is refreshed
- [ ] recent work history is complete

## Not release-ready while any of these are true

- [ ] live deploy verification has not been done
- [ ] runbook/freeze/verification truth is missing or stale
- [ ] repo claims live readiness beyond evidence
