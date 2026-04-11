# 07_WORK_HISTORY_STEP051_7_2

## STEP051.7.2 — broadcast status closure audit pass

### Why this step exists

By STEP051.7.1 the broadcast composer itself was already working again, but the operator loop was still slightly unfinished.

The founder/operator could:
- compose a draft
- preview it as text summary
- send it
- inspect outbox manually

But the cycle still felt incomplete because:
- the broadcast screen did not expose the latest task directly
- preview was still only a summary screen, not a live Telegram-format sample
- the latest status block on `📬 Рассылка` was useful, but still too thin for a clean operator loop
- opening an outbox record from broadcast still forced a generic outbox-style back path

This step closes that operator loop without rewriting delivery infrastructure.

### What changed

#### 1. Direct last-task path from broadcast

The main `📬 Рассылка` surface now exposes:
- `📄 Последняя задача`
- and, when relevant, `🧾 Ошибки`

So the operator can jump from the active composer directly into the latest broadcast outbox record.

This removes the longer path:
`Коммуникации → Исходящие → открыть запись`

#### 2. More complete latest-task status block

The latest broadcast block on `📬 Рассылка` now shows a more complete operational summary:
- task id
- status
- delivered / failed / pending counts
- started / finished timestamps
- batch / cursor
- last error when present

This makes the broadcast screen feel more like an operator console and less like just a draft editor.

#### 3. Live preview to self

`👁 Превью` now supports `🧪 Отправить превью себе`.

This sends a real Telegram-format sample into the current operator chat using the same delivery routing contract as the actual broadcast:
- text only
- photo only
- photo + caption
- photo, then text when the body is longer than caption limits
- optional inline URL button when both label and URL are configured

Important:
- preview-to-self does **not** create broadcast outbox rows
- preview-to-self does **not** create delivery items
- preview-to-self does **not** distort broadcast statistics

So it behaves like a live sample, not like a real send.

#### 4. Back navigation parity for outbox records opened from broadcast

Outbox records opened through the new broadcast shortcut can now return directly back to `📬 Рассылка`.

This keeps the flow cohesive:
`broadcast → latest task → back to broadcast`

instead of forcing every path back through the generic `📤 Исходящие` list.

### What did not change

This step intentionally does **not** change:
- background delivery model
- retry/recovery actions
- outbox schema
- audience logic
- media/button composer fields
- invite/share layer
- pricing layer
- LinkedIn/product runtime contracts

### Product result

After STEP051.7.2 the broadcast loop is much more complete:
- compose
- preview summary
- send live preview to self
- confirm send
- open latest task
- inspect errors
- return directly to the broadcast console

The infrastructure is still the same, but the operator experience is far more finished.

### Verification

Source checks run:
- `npm run check`
- `node scripts/smoke_broadcast_contract.js`
- `node scripts/smoke_broadcast_status_closure_contract.js`
- `node scripts/smoke_outbox_contract.js`

Live status not confirmed — manual verification required.
