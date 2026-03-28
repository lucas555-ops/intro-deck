# STEP026.4 — Help Surface Render Compatibility Hotfix

## Why
`src/bot/surfaces/appSurfaces.js` imported `renderHelpText` and `renderHelpKeyboard` as named exports. In mixed deploy states where `appSurfaces.js` was updated but `src/lib/telegram/render.js` still came from an older baseline without those exports, the bot crashed on startup before handling webhook traffic.

## What changed
- switched `appSurfaces.js` to a namespace import for telegram render helpers
- added local fallback help text and keyboard builders
- preserved normal behavior when the newer `renderHelpText` and `renderHelpKeyboard` exports are present
- added `scripts/smoke_help_surface_compat.js` and `npm run smoke:help-surface-compat`

## Result
Help surface no longer hard-crashes the runtime during mixed-state deploys. The bot can start and serve traffic while still using the richer help surface whenever the newer render exports are available.
