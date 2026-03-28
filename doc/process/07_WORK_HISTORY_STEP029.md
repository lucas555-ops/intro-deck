# STEP029 — Users + User Card

- Added operator Users list with admin segments, pagination, and compact row summaries under `🧰 Operations`.
- Added User Card with public-card preview, hide/unhide listing controls, operator note flow, and message entrypoint scaffold.
- Added DB-backed operator note persistence plus note input sessions via migration `013_admin_user_notes.sql`.
- Preserved `/ops` admin shell gating and legacy retry diagnostics while extending the `adm:` namespace.
