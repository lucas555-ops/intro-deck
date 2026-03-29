# STEP045 work history

- Normalized LinkedIn identity claim extraction so basic fields are persisted more explicitly, including robust locale handling.
- Preserved existing manual profile data by limiting profile draft display-name seeding to cases where the local card name is still empty/blank.
- Added user-facing callback/Telegram summaries that state only the basic identity layer was imported and that professional profile fields remain Telegram-managed.
- Bumped runtime/docs markers to STEP045 / 0.45.0 and added STEP045 smoke coverage for the new identity auto-seed contract.
