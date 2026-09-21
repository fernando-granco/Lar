# Deploying Lar safely

Keep Lar private by default. A reverse proxy or tunnel should require authentication for the browser, API, and MCP endpoints.

If you use Cloudflare Access, a separate bypass policy is appropriate only for `/calendar/*`, because calendar apps cannot complete a browser login. The calendar feed URL contains its own private token—treat it like a password.

Before replacing a running container, download a Household → Data backup and keep a raw copy of the SQLite volume. Build the replacement image before stopping the old container, verify `/api/v1/health`, and retain the old image as a rollback tag.
