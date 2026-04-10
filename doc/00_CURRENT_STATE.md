# 00_CURRENT_STATE

## Snapshot

- Project: LinkedIn Telegram Directory Bot
- Current STEP: STEP051.7
- Phase: broadcast composer uplift on top of the STEP051.6 admin navigation/menu polish, the STEP051.5 pricing hotfix, and the STEP050M landing + STEP048.4 product baseline
- Primary mode: PRODUCT HARDENING / MONETIZATION FOUNDATION / TELEGRAM INVITE LAYER
- Runtime status: source-clean STEP051.7 baseline with the STEP048.4 product/runtime layer intact, the STEP050M landing/meta layer preserved, the STEP051 invite/share layer intact, the paired home/help rows preserved, `/start` still routed through a single handler, `/inbox` still hardened, the `Plans` surface restored, the compact admin communications/broadcast/system menu layout preserved, and the broadcast composer upgraded to support optional image, optional inline CTA button text/url, and smart text/photo delivery routing with outbox metadata preserved; live status not confirmed — manual verification required

## What exists now

- LinkedIn OIDC identity bootstrap
- Telegram profile completion, skills, browse, search, intro flow
- operator `/ops` / `/admin` entrypoints with allowlist gating
- Admin / Operations / Communications / System hubs in Russian
- Users, User Card, Notice, Broadcast, Outbox, Intros, Delivery, Quality, Audit
- compact admin counters, trend summaries, funnel drilldowns
- guarded bulk actions from user segments into Notice / Broadcast prep
- STEP045 LinkedIn identity auto-seed uplift for name / given / family / picture / locale persistence
- STEP046 hidden Telegram username + paid direct-contact request flow with owner approval
- STEP047 gated member DM relay with first-message payment + recipient accept/decline/block/report
- honest user-facing LinkedIn import summary and manual-fields reminder
- upgraded one-page public landing with stronger CTA hierarchy, product sections, FAQ, and final CTA
- branded OG/share-preview asset, favicon layer, and full homepage social metadata
- hero now uses a simplified single-master visual with shorter copy, calmer CTA framing, and one trust line instead of the prior rail / plaque density
- post-hero landing narrative is now compressed into clearer workflow, proof, audience, and FAQ layers with less duplication
- `See the workflow` now uses one cleaner gallery system: left-aligned section header, active step copy above the stage, and one active scene swapped by the thumbnail row
- the workflow gallery now defaults to `05 · Continuation`, so the section opens on the most concrete first-message outcome instead of the more abstract identity state
- STEP050H widens the workflow intro, strengthens active thumb emphasis, tightens the active-copy-to-stage rhythm, and raises the visual quality of `Why this works better`, `Who it's for`, and the final CTA without touching runtime/legal layers
- STEP050L replaces the heavy 2-column mobile nav wall with a calmer horizontal chip rail plus separate CTA, collapses the `How it works` bridge into a one-card-per-row mobile stack, and stabilizes workflow thumbnails as a true horizontal strip without overlap/clipping
- STEP050M narrows the public landing meta copy so root `<title>`, standard description, Open Graph, and Twitter preview text all use one cleaner canon: trusted intros and direct contact in Telegram, with LinkedIn as the identity layer
- STEP050M also realigns `scripts/smoke_og_social_contract.js` to the current `assets/social/intro-deck-og-1200x630.png` asset path so OG/social source checks match the repo state
- STEP051 invite contacts / Telegram-native inline share layer with primary inline share CTA, raw-link/card fallbacks, deep-link attribution truth, and honest invited/activated counters
- STEP051.1 upgrades the primary inline invite result from article/text into a photo-card built from the shipped OG preview asset, with caption polish and cached-photo readiness
- STEP051.2 reorganizes the user-facing home/help menu surfaces so the core flow reads more cleanly: profile/browse first, inboxes next, plans before invite, help near the bottom, and founder/operator admin pinned last
- STEP051.3 keeps the STEP051.2 order but compresses the home/help keyboards into cleaner two-button rows where it improves mobile scanning, without changing invite, DM, intro, or LinkedIn contracts
- STEP051.4 fixes command parity: `/start` now has one runtime owner, `/menu` stays the visible home fallback, `/inbox` gets a product-safe fallback path, and the accidental home-surface extra-notice leak is removed
- STEP051.5 restores the broken `Plans` surface by shipping the missing pricing text/keyboard render layer, so `⭐ Plans`, `/plans`, and `plans:root` no longer fail on `renderPricingText is not a function`
- STEP051.6 compacts the admin communications / broadcast / templates / system navigation into more consistent paired rows, keeps long audience selectors readable, and standardizes back/home navigation across the core admin menu surfaces
- STEP051.7 upgrades admin Broadcast composition so operators can send text-only, image-only, image + text, or text/image plus one inline CTA button, with smart routing for long image posts and media/button metadata persisted into draft/outbox state

## Current truth

- LinkedIn login is still identity bootstrap, not full professional import
- STEP045 auto-seeds only the safe identity layer and only seeds profile display name when the local card name is still empty
- existing manual Telegram profile fields are preserved on reconnect
- public browse still depends on listed + active truth
- STEP046 ships hidden Telegram handle + paid direct contact requests with owner approval
- STEP047 now ships the narrow DM request + active thread path
- landing is now structured as a real product entry page instead of a minimal placeholder
- STEP050A shifts the homepage hero from policy-first explanation toward a stronger access/trust/workflow framing
- STEP050B compresses the rest of the landing so the page reads as one product story instead of separate explanatory blocks
- STEP050C upgrades the workflow section from text-led cards into a more premium product gallery with clearer visual authority
- STEP050D tightens section rhythm, card heights, FAQ distribution, and hero/workflow responsive behavior for cleaner tablet/mobile presentation
- STEP050E de-densifies the hero by removing the workflow rail and explanatory plaque, shortening the hero copy, and integrating a cleaner rendered device visual as the main right-side anchor
- privacy and terms pages now share the same visual/navigation standard as the landing
- STEP048 pricing / analytics / ops remains the last shipped product/runtime layer beneath the landing uplift
- STEP051 keeps LinkedIn as the trust/identity bootstrap and adds invite sharing as a narrow Telegram-native growth layer without reward mechanics
- STEP051.1 keeps the STEP051 invite surface contract intact and only upgrades the primary share result to a richer photo-card path
- STEP051.2 keeps the invite/runtime contracts intact and only reorganizes menu entrypoint order plus help-surface discovery, including a first-class `Plans` entry on the home/help surfaces
- STEP051.3 keeps the same menu order but makes the keyboards more compact and organic on mobile by pairing the most related actions into shared rows
- STEP051.4 keeps the paired menu layout intact and only hardens slash-command behavior so `/start`, `/menu`, and `/inbox` behave like honest entrypoints instead of partially diverging from the button flow
- STEP051.5 keeps the STEP051.4 command/menu work intact and only restores the monetization member surface so the promoted `Plans` button is a working product screen again
- STEP051.6 keeps the STEP051 invite/share + STEP051.5 plans fixes intact and only reorganizes admin/operator menu layouts for compactness, consistency, and easier thumb navigation in Telegram
- STEP051.7 keeps the STEP051.6 admin navigation polish intact and only upgrades the broadcast composer so the founder/operator can attach one optional image, one optional inline CTA button, and still send normal text with raw links in-body without extra complexity
- invite attribution only applies to first-start new users and differentiates `inline_share`, `raw_link`, and `invite_card` sources

## What must not break

- LinkedIn OIDC flow and callback truth
- Telegram webhook secret guard
- async `createBot()` + awaited `bot.init()`
- listed/active visibility truth
- intro persistence / decision truth
- communications layer and outbox truth
- operator allowlist gating
- docs canon + artifact protocol

## Next recommended step

- deploy STEP051.7 and do a short live smoke on the real bot: verify admin `📬 Рассылка` supports text only, raw URL in text, image only, image + short text, image + long text split delivery, and optional inline CTA button text/url; confirm outbox rows show media/button metadata and confirm `⭐ Plans`, `/start`, `/menu`, and invite paths still behave normally

## STEP051.7 delta

- admin broadcast drafts now support optional `media_ref`, `button_text`, and `button_url` fields
- admin communications input sessions now accept broadcast media, button text, and button URL edit flows
- broadcast composition now supports text-only, image-only, image + short text, and image + long text delivery with smart routing
- one optional inline CTA button can now be attached to a broadcast by setting button text + URL
- operators can save media either by pasting a URL/file_id in the prompt or by sending a photo while the media input session is open
- outbox records now preserve and display media/button metadata for sent broadcasts


## STEP039.1 delta

- founder/operator-only admin visibility from `ADMIN_CHAT_ID` + `TG_OPERATOR_IDS`
- `/admin` mirrors `/ops` as operator-only fallback

## STEP040 delta

- Russian admin/operator layer
- compact analytics drilldowns and funnel readouts

## STEP041 delta

- safe bulk actions from user segments into Notice / Broadcast prep
- no destructive bulk mutations

## STEP042 delta

- launch/operator runbook added
- freeze policy added
- System hub now exposes `Регламент запуска` and `Freeze`
- release-readiness / handoff / roadmap / start-new-chat prompt aligned to STEP042

## STEP043.1 delta

- live-verification guidance added
- launch-rehearsal guidance added
- System hub now exposes `Live verification` and `Репетиция запуска`
- verification playbook / rehearsal checklist / go-no-go template added

## STEP045 delta

- LinkedIn OIDC claims now normalize and persist basic identity fields more explicitly
- profile draft seeding now fills display name only when the local card name is still empty/blank
- callback success surfaces now state clearly that only the basic identity layer was imported
- hidden/manual professional fields remain Telegram-managed and are not auto-scraped from LinkedIn

## STEP046 delta

- optional hidden Telegram username added to profile editing
- contact mode toggle added for intro-only vs paid direct-contact requests
- Telegram Stars one-time invoice path added for direct-contact requests
- owner approve/decline + controlled reveal flow added
- inbox/detail surfaces extended to include direct-contact requests


## STEP047 delta

- member DM request entity + compose session + message/event storage added
- first-message payment gate added for DM request delivery
- recipient review controls added: accept / decline / block / report
- active text-only bot-mediated DM thread replies added
- `/dm` inbox and DM thread detail surfaces added


## STEP048.1 hotfix

- Added schema-compatible profile/directory reads so legacy databases without `member_profiles.telegram_username_hidden` do not break LinkedIn transfer confirm or home/profile loads.
- Purpose: keep pre-STEP046 databases operational while migrations are still being applied.
- Note: paid unlock / DM / pricing features still require STEP046-STEP048 migrations to be applied for full functionality.


## STEP048.3 hotfix

- Scope: LinkedIn connect/relink copy polish + profile editor/preview readability + profile keyboard consistency.
- Product truth: LinkedIn OIDC basics are stored privately; only the initial card name is auto-seeded into public card fields by default.
- UX: profile editor now shows a dedicated LinkedIn block, preview clarifies what is public vs private, and callback success page includes an explicit button back to the bot.
- Buttons: profile preview/input/profile-saved flows now keep Back + Home on one row for tighter Telegram ergonomics.
- No schema changes. Live status not confirmed — manual verification required.


## STEP048.4 hotfix
- Fix: restore STEP048 pricing env contract exports after STEP048.3 UX hotfix accidentally dropped `getSubscriptionConfig` and Pro pricing fields from `src/config/env.js`.
- Impact: Vercel runtime no longer fails on `monetizationStore.js` import during startup.
- Scope: narrow compatibility/hardening only; no product-flow changes.


## STEP049B delta

- public `index.html` rebuilt into a production-grade one-page landing with clear section architecture
- hero CTA hierarchy cleaned up: primary bot-open CTA + secondary how-it-works anchor
- added sections for audience, workflow, product surfaces, FAQ, and final CTA
- `site.css` upgraded to a stronger dark premium layout system with better mobile behavior
- `privacy` and `terms` pages aligned to the same navigation and footer standard

## STEP049C delta

- homepage now ships full Open Graph and Twitter-card metadata with canonical/title/description polish
- branded OG card added at `assets/social/intro-deck-og-1200x630-v1.png`
- favicon + apple-touch icon layer added for landing/legal consistency
- `robots.txt` and `sitemap.xml` added for production metadata hygiene
- privacy and terms pages now include aligned canonical + favicon metadata

## STEP049D delta

- homepage polished with skip-link support, cleaner hero/footer microcopy, and tighter CTA hierarchy
- mobile nav layout upgraded so section links and the bot CTA remain readable and intentional
- privacy and terms pages rebuilt into one consistent legal-shell layout with quick summary blocks and aligned actions
- legal pages now include OG/Twitter metadata and landing polish has its own smoke check



## STEP049J delta

- Replaced the homepage/legal social preview asset with a new premium OG master `intro-deck-og-1200x630.png` plus WEBP companion.
- Updated homepage, privacy, and terms metadata to the new versioned OG path for cache-safe share refresh.
- This step is an asset/meta refresh only; no schema or bot runtime behavior changed.


## STEP049K delta

- Landing copy, spacing, and section alignment were tightened for a cleaner production presentation.
- Brand marks on homepage and legal pages now use the real Intro Deck asset instead of text-only placeholders.
- Product preview section now uses three balanced cards so desktop layout no longer leaves an empty column.
- Legal-page intro copy and action shells were cleaned up for better readability and consistency.


## STEP050A delta

- homepage hero rebuilt into a stronger product-first composition with one focal phone sculpture instead of the prior equal-weight feature grid
- hero copy now frames Intro Deck around warm access inside Telegram while keeping LinkedIn as the identity/trust layer
- added a compact five-step workflow rail so the value path reads immediately from identity to continuation
- kept runtime, legal pages, and product contracts untouched; scope is front-end-only `index.html` + `site.css` plus docs state alignment


## STEP050B delta

- landing narrative after the hero was compressed into a tighter sequence: audience → how it works → see the workflow → why this works better → FAQ
- removed the duplicated `What's inside` / `Product preview` split and replaced it with one unified workflow section
- how-it-works upgraded from four broad steps to a clearer five-step path that matches the product framing introduced in STEP050A
- FAQ shortened and tightened so the landing explains less repeatedly while preserving trust / privacy / LinkedIn truth
- smoke contracts were aligned to the new post-hero landing canon; runtime and legal surfaces remain untouched


## STEP050C delta

- `See the workflow` is now anchored by a larger product-stage showcase instead of a flat row of equally weighted text cards
- workflow section now uses a central master screen plus supporting fragments to express identity, discovery, contact, and continuation as one visual system
- each of the five workflow cards now includes a mini screen-state visual so the section feels product-led rather than copy-led
- kept scope front-end-only on `index.html` + `site.css` plus docs state alignment; runtime and legal layers remain untouched

## STEP050D delta

- responsive layout rhythm tightened after STEP050A-STEP050C so hero, workflow showcase, cards, FAQ, and CTA feel more balanced on tablet/mobile
- hero rail now stacks more cleanly on small screens, trust chips no longer crowd the first screen, and the phone/workflow stage uses calmer mobile heights
- audience/workflow/FAQ grids now keep stronger tablet distribution before collapsing to one column, reducing unnecessary vertical sprawl
- kept scope front-end-only on `site.css` plus docs state alignment; runtime, routing, and legal surfaces remain untouched



## STEP050E delta

- hero was rebuilt around one integrated rendered device visual instead of the prior HTML phone + float-card composition
- removed the hero workflow rail, explanatory plaque, and extra trust chips so the first screen reads shorter and cleaner
- headline/subhead/CTA stack now emphasizes warm professional access inside Telegram with one lighter trust line beneath the actions
- scope stays front-end-only on `index.html` + `site.css` + landing smoke alignment; runtime and legal surfaces remain untouched


## STEP050F delta

- moved `Who it's for` below workflow proof + mechanism advantages so the landing no longer drops into audience explanation immediately after the hero
- replaced the prior five-step post-hero explainer with a shorter four-card workflow bridge focused on identity, card, access path, and private continuation
- retuned nav order and hero secondary CTA so the page flows from hero into mechanism before visual proof, then audience/FAQ


## STEP050G-B delta

- `See the workflow` was rebuilt as one cleaner gallery system with a single active stage, short active copy, and five thumbnail switches instead of the prior triple-duplicated explainer layout
- each workflow step now uses one shared master scene asset for both mini preview and expanded stage so the gallery stays visually consistent and easier to maintain
- added optimized workflow assets under `assets/workflow/` and wired lightweight thumb switching directly in `index.html` so the section behaves like a product gallery rather than a content wall
- kept scope front-end-only on `index.html` + `site.css` + workflow assets + docs/smoke alignment; runtime and legal surfaces remain untouched


## STEP050H delta

- widened the workflow intro note, strengthened the active thumbnail state, and tightened the reading rhythm between active step copy and the large stage
- upgraded `Why this works better` into a more product-grade proof grid with clearer value labeling and stronger card hierarchy
- upgraded `Who it's for` with tighter audience copy, clearer micro-positioning, and calmer premium card styling
- rebuilt the final CTA into a cleaner action stage with a more compact message and a stronger right-side action stack

## STEP050M delta
- root landing meta copy updated so `<title>`, `meta name="description"`, `og:title`, `og:description`, `twitter:title`, and `twitter:description` all share the new trusted-intros/direct-contact wording
- no runtime, layout, OG-image, or legal-surface changes


## STEP051 delta

- `/invite` command and `📨 Invite contacts` user surface added
- primary share path now uses Telegram inline mode with raw-link and invite-card fallbacks
- `member_invites` stores first-start invite attribution truth
- home/help surfaces now expose invite entrypoints for connected members
- invite counters stay honest: `Friends invited` and `Activated`
- no reward mechanics, no quota bonuses, no leaderboard layer

## STEP051.1 delta

- primary inline invite result now prefers a photo-card instead of article/text
- shipped JPEG invite asset at `assets/social/intro-deck-og-1200x630.jpg` derived from the production OG preview
- inline invite caption now uses the tighter landing canon: trusted intros and direct contact in Telegram
- cached-photo readiness added via optional `INVITE_PHOTO_FILE_ID` env; when absent, the bot falls back to the public JPEG asset URL
- `Show link` and `Get invite card` remain unchanged as fallback paths


## STEP051.2 delta

- home surface buttons are now ordered more intentionally for member flow: profile/edit first, browse second, inboxes next, `Plans` before growth/share, help near the bottom, and admin still last
- help surface text now mentions plans / Pro status explicitly and the help keyboard mirrors the same core navigation order
- `⭐ Plans` is now promoted from a hidden shortcut/fallback path into the main home/help navigation so monetization entry is easier to discover without cluttering the invite flow
- scope is UI-order polish only; no schema, invite attribution, DM, intro, or LinkedIn auth contracts changed


## STEP051.3 delta

- home keyboard now uses paired rows where it improves readability on mobile: `Profile/Edit + Browse`, `Intro inbox + DM inbox`, and `Plans + Invite contacts`
- unconnected users now see a tighter compact row for `Browse directory + Plans` beneath `Connect LinkedIn`
- help keyboard mirrors the same paired navigation structure so home/help feel like one coherent surface instead of two different layouts
- `❓ Help` and founder/operator `👑 Админка` remain single-row actions so the bottom of the menu still reads clearly
- scope is layout polish only; no command routing, schema, invite attribution, DM, intro, or LinkedIn auth contracts changed

## STEP051.4 delta

- removed the duplicate `/start` runtime ownership so start/deep-link handling now lives in one place instead of rendering home twice
- `/menu` remains the explicit visible home fallback, separate from the hidden system `/start` entrypoint
- hardened `/inbox` with a product-safe fallback render and text clamping so the slash-command path no longer fails silently when the inbox surface cannot be rendered cleanly
- removed the accidental extra-notice leak on home renders where `appBaseUrl` could be passed into the home surface as if it were a notice
- updated command/router smoke coverage to assert one `/start` handler and the `/inbox` fallback path

## STEP051.6 delta

- admin home now pairs the top hub entrypoints as `Операции + Коммуникации` and `Монетизация + Система` so the founder/operator shell feels denser without becoming noisy
- communications / notice / broadcast / templates / outbox menus now use paired action rows where labels stay readable, while long audience/template selectors remain single-column for clarity
- system, monetization, search prompts, and many admin detail surfaces now share one compact `Back + Home` row instead of two stacked navigation rows
- no runtime schema, invite attribution, LinkedIn auth, or monetization logic changes
