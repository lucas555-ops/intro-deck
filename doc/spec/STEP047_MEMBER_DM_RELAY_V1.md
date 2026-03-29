# STEP047 — MEMBER DM RELAY V1

## Goal

Ship a narrow, bot-mediated member DM layer with:
- first-message gating,
- paid request open,
- recipient accept / decline / block / report,
- active thread replies only after acceptance.

## Shipped contract

- DM requests start from the public directory card.
- The initiator drafts the first message in Telegram chat.
- The first message creates a `payment_pending` DM request.
- Telegram Stars payment moves the request to `pending_recipient` and delivers it for review.
- The recipient controls the outcome:
  - `accept`
  - `decline`
  - `block`
  - `report`
- Only accepted requests become `active` DM threads.
- Active threads support text-only bot-mediated replies.
- Payment never overrides recipient consent.

## Out of scope

- subscriptions,
- quota analytics,
- media attachments,
- public Telegram contact reveal,
- full messenger parity.

## Core entities

- `member_dm_threads`
- `member_dm_messages`
- `member_dm_compose_sessions`
- `member_dm_events`

## UX surfaces

- directory card `DM request` CTA
- `/dm` command
- `dm:inbox` surface
- `dm:view:<id>` thread detail surface
- compose prompt for first request message and active-thread reply

## Safety notes

- text-only
- one DM path per pair at a time
- block/report terminate the normal path
- active replies require thread acceptance first
- live status not confirmed — manual verification required
