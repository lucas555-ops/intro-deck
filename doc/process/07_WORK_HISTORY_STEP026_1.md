# STEP026.1 — profile render export compatibility hotfix

Date: 2026-03-27

## Why
STEP026 introduced a regression by making profile and text composers import `renderProfileSavedKeyboard` directly. Some live baselines still had the older render export surface, which caused runtime startup failure on Vercel.

## What changed
- reverted profileComposer to stable `renderProfilePreviewKeyboard` import
- reverted textComposer to stable `renderProfilePreviewKeyboard` import
- added smoke `smoke_profile_render_export_compat.js`

## Result
The bot no longer requires the newer `renderProfileSavedKeyboard` export to boot. The profile save flow still lands on preview/profile actions safely.
