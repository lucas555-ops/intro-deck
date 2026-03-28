# STEP039.1 — founder-only admin entry visibility hotfix

## Goal

Make the Telegram home menu expose `👑 Админка` only to founder/operator accounts resolved from `ADMIN_CHAT_ID` and `TG_OPERATOR_IDS`, while keeping backend admin gating intact and leaving the public command list unchanged.

## What changed

- kept the existing home-menu admin entrypoint and founder-only visibility contract
- moved operator allowlist source-of-truth to `ADMIN_CHAT_ID` + `TG_OPERATOR_IDS`
- preserved legacy `OPERATOR_TELEGRAM_USER_IDS` as compatibility fallback
- added `/admin` as an operator-only fallback entrypoint that mirrors `/ops`
- refreshed `.env.example`, docs freeze, and health/current-step markers
- added `smoke:founder-admin-visibility`

## Acceptance notes

- founder/admin users in `ADMIN_CHAT_ID` or `TG_OPERATOR_IDS` see `👑 Админка` on the home menu
- ordinary users do not see it
- tapping the button still opens the shared operator/admin console
- `/admin` works as a fallback without changing the public command list
- admin callbacks and admin screens still rely on the same allowlist checks
