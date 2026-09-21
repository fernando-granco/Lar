# Contributing to Lar

Thanks for helping make Lar better for households.

## Before opening a change

1. Keep the default experience calm and useful on a phone.
2. Preserve existing SQLite data with an additive migration in `server/migrations/` when the schema changes.
3. Never commit `.env`, databases, backups, calendar URLs, access tokens, or household data.
4. Keep browser-facing changes accessible by keyboard and with meaningful labels.
5. Run `npm run typecheck` and `npm run build`.

For larger features, open an issue first so the user experience and migration path can be discussed. Bug fixes should describe how the problem was reproduced and verified.

Lar is licensed under AGPL-3.0. Contributions are accepted under the same license.
