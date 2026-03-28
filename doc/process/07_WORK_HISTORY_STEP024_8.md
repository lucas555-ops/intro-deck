# 07_WORK_HISTORY_STEP024_8

## STEP
STEP024.8 — OAuth route import hotfix

## Goal
Fix the LinkedIn connect route crash caused by broken relative imports inside the Vercel API routes.

## What changed
- corrected relative imports in `api/oauth/start/linkedin.js`
- corrected relative imports in `api/oauth/callback/linkedin.js`
- added `scripts/smoke_oauth_route_imports.js`

## Outcome
The LinkedIn connect route can load on Vercel instead of crashing during module resolution.

## Truth
- source-confirmed: yes
- live-confirmed: not re-verified from this repo snapshot
