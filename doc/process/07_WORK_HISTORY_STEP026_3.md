# STEP026.3 — command contract cleanup

## Summary

STEP026.3 closes the drift between the Telegram command menu and the handlers actually registered in code. The public command layer now has real entrypoints for `/help`, `/profile`, `/browse`, and `/inbox`, while `/ops` stays supported but clearly operator-only.

## What changed

- added a real help surface with product-facing copy and CTA buttons
- registered `/help` in the home composer
- registered `/profile`, `/browse`, and `/inbox` in their owning composers
- kept `/ops` intact for operators, but changed the non-operator denial copy to be product-safe
- made the disconnected profile surface show a `Connect LinkedIn` CTA instead of edit actions
- added a command-contract smoke script to catch future drift
- refreshed README, current state, and health markers to STEP026.3

## Why this step exists

The product already worked primarily through buttons, but the public Telegram command menu had drifted away from the real router contract. Users could see commands that were not actually first-class entrypoints, while `/help` was missing as a real support surface. STEP026.3 fixes that mismatch without expanding the product scope.

## Operator / rollout notes

- update the BotFather public command list after deploy so Telegram's command menu matches the code contract
- keep `/ops` out of the public command list
- no database migration is required for STEP026.3 itself
