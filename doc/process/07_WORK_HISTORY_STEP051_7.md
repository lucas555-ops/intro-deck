# 07_WORK_HISTORY_STEP051_7

## STEP051.7 — broadcast composer uplift

### Why this step exists

The admin broadcast layer previously supported only a body text plus audience selection.

That was too narrow for real operator work:
- no optional image attachment
- no optional inline CTA button
- no clean way to keep raw links inside text while also attaching richer media when needed
- no smart handling for Telegram's shorter photo-caption limit

The product ask for this step was narrow and practical:
- keep text-only broadcast simple
- allow image + text when useful
- allow one optional inline button with custom label + URL
- avoid albums and extra complexity

### What changed

#### Schema / persistence

Migration `023_admin_broadcast_composer_uplift.sql` adds:
- `media_ref`
- `button_text`
- `button_url`

to both:
- `admin_broadcast_drafts`
- `admin_comm_outbox`

It also expands admin comms input-session kinds so the operator can edit:
- broadcast media
- broadcast button text
- broadcast button URL

#### Draft / store layer

Broadcast draft storage now supports:
- optional media reference
- optional button text
- optional button URL
- clear-media action
- clear-button action

Outbox records now persist the same media/button metadata so sent-broadcast history stays honest.

#### Composer / surface layer

The admin `📬 Рассылка` surface now supports:
- `✏️ Изменить текст`
- `📌 Шаблоны`
- `🎯 Аудитория`
- `👁 Превью`
- `🖼 Картинка`
- `🔘 Кнопка`
- `📨 Отправить`
- `🔄 Обновить`
- conditional clear actions for image/button where relevant

A dedicated button-edit surface was added for:
- button text
- button URL
- clear button

Broadcast preview now shows:
- audience
- estimated recipients
- delivery mode
- image status
- button status
- text preview

#### Input handling

Operators can now provide media in two ways:
- paste a URL or existing file_id into the media input flow
- send a photo while the media input session is open

#### Smart delivery routing

Broadcast sending now routes automatically by payload shape:
- text only → Telegram text message
- image only → Telegram photo message
- image + short text → photo with caption
- image + long text → photo first, then text message

This keeps the operator flow simple while respecting Telegram caption limits.

#### CTA button support

One optional inline CTA button is now supported on broadcasts.

If both button text and button URL are set, the sent message attaches that inline button.

### Product result

Founder/operator can now compose more useful broadcasts without turning the admin flow into a heavy campaign builder.

The practical supported shapes are now:
- text only
- text with raw link inside the text
- image only
- image + text
- text + inline CTA button
- image + caption + inline CTA button
- image + long text, automatically split into photo then text

### What was not changed

This step intentionally does **not** add:
- media albums
- multi-button keyboards
- campaign analytics rewrite
- invite/runtime changes
- LinkedIn/auth changes
- DM flow changes
- reward/growth mechanics

### Verification

Source checks run:
- `npm run check`
- `node scripts/smoke_broadcast_contract.js`
- `node scripts/smoke_command_contract.js`
- `node scripts/smoke_admin_templates_contract.js`
- `node scripts/smoke_outbox_contract.js`

Live status not confirmed — manual verification required.
