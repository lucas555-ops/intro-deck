# Invite Rewards Live Verification Checklist

1. Apply migrations through `026_invite_rewards_settlement_hardening.sql`.
2. Confirm admin invite surface opens and shows rewards mode, settlement summary, and reconciliation warnings.
3. Create or locate at least one pending reward event whose `confirm_after` is already due.
4. In `👑 Админка -> 🧰 Операции -> 📨 Инвайты`, run `✅ Run batch`.
5. Verify the run summary:
   - processed count
   - confirmed count
   - rejected count
   - skipped count
6. Verify DB truth for one confirmed event:
   - `invite_reward_events.status = 'available'`
   - `invite_reward_ledger` has `pending_reversal`
   - `invite_reward_ledger` has `available_credit`
7. Verify DB truth for one rejected event, if present:
   - `invite_reward_events.status = 'rejected'`
   - `reject_reason` is present
   - no spendable available credit was created
8. Open `🎯 Points` for the referrer and confirm available balance changed only for confirmed events.
9. Redeem from available only and confirm Pro extension still works.
10. Confirm paid Pro flow still works and receipts/subscription truth remain intact.
