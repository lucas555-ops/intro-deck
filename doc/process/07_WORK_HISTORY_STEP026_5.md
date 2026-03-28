# STEP026.5 — Help Fallback Callback Hotfix + LinkedIn Callback Diagnostics

## What changed

- fixed the mixed-state help fallback keyboard so its callbacks match the live router contract
- `Profile` fallback button now routes to `p:menu`
- `Browse directory` fallback button now routes to `dir:list:0`
- `Home` fallback button now routes to `home:root`
- added explicit staged diagnostics in `api/oauth/callback/linkedin.js` so live failures can be localized without guessing
- callback failure page now includes the failing stage name while keeping the message otherwise concise
- added source-contract smokes for fallback help callbacks and LinkedIn callback stage logging

## Why

STEP026.4 made the help surface mixed-state safe, but its local fallback keyboard still used stale callback ids from an older router contract. In a mixed deploy that produced a visible help screen with non-working `Home`, `Profile`, and `Browse directory` buttons.

Separately, LinkedIn callback failures still collapsed into a single generic page. Without stage-level logging, live triage required guesswork across state verification, discovery, token exchange, id token validation, userinfo fetch, and persistence.

## Acceptance

- fallback help keyboard uses only live callback ids
- stale callback ids are absent from the fallback builder
- LinkedIn callback failures log a structured stage label
- callback failure page shows the stage label for quick operator triage
- no startup import regressions introduced
