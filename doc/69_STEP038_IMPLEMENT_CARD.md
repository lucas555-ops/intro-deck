# STEP038 — Broadcast/notice targeting refinement + templates polish

## Goal
Tighten operator targeting for Notice/Broadcast and replace the old templates placeholder with a real reusable templates layer.

## Scope
- Refined Notice audiences
- Refined Broadcast audiences
- Notice audience estimate
- Templates hub under Communications
- Notice template picker
- Broadcast template picker
- Template apply actions that prefill body + suggested audience
- STEP/docs/health sync

## Included audiences
### Notice
- CONNECTED_NO_PROFILE
- COMPLETE_NO_SKILLS
- LISTED_ACTIVE
- LISTED_INACTIVE

### Broadcast
- LISTED_ACTIVE
- ACCEPTED_RECENT
- DECLINED_RECENT
- RECENT_RELINKS

## Key callbacks
- adm:tpl
- adm:tpl:not
- adm:tpl:bc
- adm:tpl:direct
- adm:not:tpl
- adm:not:tpl:<key>
- adm:bc:tpl
- adm:bc:tpl:<key>

## Acceptance
- Communications hub exposes Templates
- Notice keyboard exposes Templates and estimated visibility
- Broadcast keyboard exposes Templates
- Notice template apply updates text + audience
- Broadcast template apply updates text + audience
- Existing Notice/Broadcast/Outbox flows keep working
- No migration required

## QA
- /ops -> Communications -> Templates
- Apply Notice template -> Notice
- Apply Broadcast template -> Broadcast
- Check refined audiences in pickers
- Confirm estimate on Notice
- Confirm existing Notice/Broadcast/Outbox screens still render
