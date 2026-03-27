# 07_WORK_HISTORY_STEP024_6

## STEP
STEP024.6 — public legal/web surfaces baseline + Vercel config fix

## Goal
Unblock immediate LinkedIn app creation and first Vercel deploy by adding real public-facing legal pages and fixing the invalid Vercel runtime config that was blocking deployment.

## What changed
- added public root landing page at `/`
- added public privacy policy page at `/privacy`
- added public terms-of-use page at `/terms`
- added shared site stylesheet for minimal branded web surfaces
- fixed `vercel.json` by removing the invalid `functions.runtime` block and keeping only the cron config
- pinned `package.json` Node engine to `20.x` for a stable Vercel baseline
- added `smoke:legal` contract to verify the public/legal surfaces exist and contain required product text
- updated repo docs to reflect the new deploy/app-registration baseline

## Why
The project needed a real privacy policy URL and public-facing product surface for LinkedIn Page/App setup. The repo also needed a Vercel config fix before the first production deploy could succeed.

## Outcome
The repo now contains a minimal but product-grade public web surface that can be deployed to the default `vercel.app` domain and used immediately for:
- LinkedIn Company Page website field
- LinkedIn App privacy policy URL
- basic public product presence before a custom domain exists

## Validation
- `npm run check`
- `npm run smoke:env`
- `npm run smoke:cron`
- `npm run smoke:legal`

## Truth
- source-confirmed: yes
- live-confirmed: no
- blocked: still requires a real Vercel deployment, live environment variables, and manual LinkedIn/Telegram setup in STEP025
