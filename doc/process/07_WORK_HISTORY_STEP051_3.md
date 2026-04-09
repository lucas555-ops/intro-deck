# STEP051.3 — Menu row pairing polish

## Goal
Keep the STEP051.2 menu order, but make the home/help keyboards feel more compact and organic on mobile by grouping the most related actions into two-button rows.

## What changed
- paired `🧩 Edit/Complete profile` with `🌐 Browse directory` for connected members;
- paired `📥 Intro inbox` with `💬 DM inbox`;
- paired `⭐ Plans` with `📨 Invite contacts`;
- for non-connected users, paired `🌐 Browse directory` with `⭐ Plans` beneath the single `🔐 Connect LinkedIn` CTA;
- mirrored the same paired layout on the Help keyboard so home/help feel consistent;
- kept `❓ Help` and `👑 Админка` on their own rows so bottom-of-menu actions stay clear.

## Important truth
- this step changes button arrangement only;
- no command routing, schema, invite attribution, LinkedIn auth, intro inbox, or DM contracts were changed;
- live status not confirmed — manual verification required.

## Verification
- `npm run check`
- `node scripts/smoke_command_contract.js`
- `node scripts/smoke_product_surface_contract.js`
- `node scripts/smoke_help_fallback_callback_contract.js`
