# 07_WORK_HISTORY_STEP024_7

## STEP
STEP024.7 — deploy-stable LinkedIn bot webhook init + npm registry continuity

## Goal
Lock a working production baseline for the Vercel deploy, Telegram webhook, and bot init path.

## What changed
- pinned the working production domain to `https://intro-deck.vercel.app`
- fixed the async bot init contract so `createBot()` awaits `bot.init()`
- updated the webhook handler to await `createBot()` before `handleUpdate()`
- locked Vercel expectations: root directory empty, framework preset `Other`, Node `20.x`
- kept root `.npmrc` on public npm and documented lockfile hygiene against internal registries

## Outcome
The live baseline became deploy-stable with healthy webhook `200` responses and `pending_update_count = 0`.

## Truth
- source-confirmed: carried into STEP026 docs
- live-confirmed: yes, from prior project verification
