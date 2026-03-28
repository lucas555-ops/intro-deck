# STEP028 — Admin Home + Skeleton Hubs

## Goal

Add the first operator admin shell for Intro Deck without breaking the live user-facing product baseline.

## What changed

- turned `/ops` into the gated operator entrypoint for `👑 Admin`
- added Admin / Operations / Communications / System hubs
- introduced clean `adm:` callback namespace for admin navigation
- moved the operator home CTA from direct diagnostics to the admin shell
- kept retry diagnostics reachable for operators through System → Retry and legacy `ops:*` callbacks
- added operator-only denial surface with a Home escape path
- added admin shell and admin allowlist smoke contracts
- updated step markers and current-state docs to STEP028

## Why

The product already had a working user-facing baseline. The next safe move was to freeze a narrow operator shell before building Users, User Card, Notice, Broadcast, and Delivery surfaces.

## Result

Intro Deck now has a first operator control plane inside Telegram, while preserving the existing diagnostics path and leaving future admin mutations for later focused steps.
