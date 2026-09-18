# Lar

**The family's home hub.** Shared **to-dos**, a smart **shopping list**, and lightweight **project management** for everything you're building and fixing at home. Self-hosted, calm, and built for a family on a home network. No accounts, no cloud, one container.

*Lar* is Portuguese for "home", the hearth-and-family kind.

## What it does

- **To-dos** for everyone or for specific people and groups (like "Kids"). Due dates, priorities, repeating chores, and a quick-add that understands "Call plumber tomorrow !high".
- **Shopping list** with quantities, aisle grouping, suggestions from what you usually buy, and extra lists for the hardware store or a big Costco run. "2x oat milk" just works.
- **Projects** with milestones, to-dos, a shopping list inside the project, budget and expense tracking, notes, and links. Enough to run a backyard refresh or a kitchen remodel without becoming a chore itself.
- **Today** view that shows what needs attention right now.
- **Live updates** between phones and computers on the network.
- **Phone friendly** and installable to the home screen. Light and dark themes.
- **REST API** for scripts and agents, with an activity log of who changed what.

## Run it with Docker

```bash
git clone https://github.com/fernando-granco/Lar.git
cd Lar
cp .env.example .env        # optional: set TZ and an API key
docker compose up -d --build
```

Open `http://YOUR-SERVER-IP:3001` from any device on your network. The first visit asks for your household name and the people in it. Each device then remembers who is using it, no passwords involved.

Your data lives in the `lar-data` Docker volume as a single SQLite file.

**Update** with `git pull && docker compose up -d --build`. Database migrations run automatically on start.

### Keep it on your LAN

Lar has no authentication by design. If you ever expose it beyond your home network, put it behind a reverse proxy with HTTPS and an auth layer (Caddy, Authelia, Tailscale, or similar) and set `LAR_API_KEY` for the API.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port inside the container. Compose maps it to `3001` on the host. |
| `DATA_DIR` | `/app/data` | Where the SQLite database is stored. |
| `TZ` | `UTC` | Timezone used for "today" and due dates. |
| `LAR_API_KEY` | unset | When set, agents and scripts must send it as a Bearer token or `X-Api-Key` header. Browser use on the LAN is unaffected. |

## API

Everything the app does is available under `/api/v1`. Send `X-Lar-Member: <id>` to act as a person, or `X-Lar-Agent: <name>` to act as an agent, so the activity log stays meaningful.

| Area | Endpoints |
| --- | --- |
| Household | `GET /household`, `PATCH /household/settings`, `POST/PATCH/DELETE /members/:id`, `POST/PATCH/DELETE /groups/:id` |
| To-dos | `GET /tasks?status=open&member=1&due=today`, `POST /tasks`, `PATCH /tasks/:id`, `POST /tasks/:id/complete`, `POST /tasks/:id/reopen`, `DELETE /tasks/:id` |
| Shopping | `GET /shopping/lists`, `GET /shopping/items?list=1&status=open`, `POST /shopping/items`, `POST /shopping/items/:id/check`, `POST /shopping/lists/:id/clear-checked` |
| Projects | `GET /projects`, `GET /projects/:id` (full detail), `POST /projects`, `PATCH /projects/:id`, plus `/projects/:id/milestones`, `/projects/:id/expenses`, `/projects/:id/links` |
| Calendar | `GET /calendars`, `POST /calendars`, `GET /calendar/events?days=7`, `GET /calendar/feed-info`; public feed at `/calendar/lar.ics?token=…` |
| Other | `GET /summary`, `GET /activity`, `GET /events` (server-sent events), `GET /backup`, `POST /restore`, `GET /health` |

Assignment is a list of member and group ids. An empty list means "everyone".

```bash
curl -X POST http://YOUR-SERVER-IP:3001/api/v1/shopping/items \
  -H 'Content-Type: application/json' -H 'X-Lar-Agent: hermes' \
  -d '{"name":"Oat milk","quantity":2}'
```

## Agents (MCP)

Lar is an MCP server. Point any Model Context Protocol client at `http://YOUR-SERVER-IP:3001/mcp` (Streamable HTTP, stateless) and it gets tools such as `lar_overview`, `list_todos`, `add_todo`, `complete_todo`, `add_shopping_items`, `check_shopping_items`, `list_projects`, `get_project`, `add_milestone`, and `add_expense`. Tools take people and projects by name, so "add oat milk for Fernando" just works.

Send `X-Lar-Agent: <name>` so the activity log says who did it. If `LAR_API_KEY` is set, also send `Authorization: Bearer <key>`.

Claude Code:

```bash
claude mcp add --transport http lar http://YOUR-SERVER-IP:3001/mcp --header "X-Lar-Agent: claude"
```

Hermes Agent or any other MCP-aware agent: add an HTTP MCP server with the same URL and headers. Agents without MCP support can use the REST API above; `GET /api/v1` lists every route.

## Calendars

Two directions, no OAuth setup required:

- **Lar in your calendar.** The Household page shows a private feed address (`/calendar/lar.ics?token=…`). Subscribe to it from Google Calendar (Other calendars → From URL) or Apple Calendar (File → New Calendar Subscription) and to-do due dates, milestones, and project target dates appear there. You can pick a feed for one person's items only.
- **Your calendars in Lar.** Paste the private iCal link of a Google, iCloud, Outlook, or school calendar and the next days' events show on the Today page. Recurring events are expanded, links are refreshed every ten minutes.

## Behind Cloudflare Access (or any auth proxy)

Lar works behind Cloudflare Access, Authelia, or a similar login layer with two adjustments:

- **Calendar feed.** Google and Apple fetch `/calendar/lar.ics` without a browser session, so a login page breaks the subscription. Add an Access application for the path `your-domain/calendar/*` with a **Bypass** policy. The feed stays protected by its own token.
- **Agents and scripts.** Requests to `/mcp` and `/api/v1` must pass Access. Either give the agent a Cloudflare **Service Token** and send the `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers, or let an agent on your home network use the LAN address directly and skip the tunnel. Set `LAR_API_KEY` as well if the API is reachable from outside.

The browser app, live updates, and the iCal links you import all work unchanged. Access identifies who logged in, so a future version can pick the household member from that automatically.

## Backup

The Household page has **Download backup**, which gives you one JSON file with everything, and **Restore from file**, which replaces all data with a backup. The same is available at `GET /api/v1/backup` and `POST /api/v1/restore` for scripts and cron jobs.

## Roadmap

- Direct Google and Apple account sync (OAuth / CalDAV) once the feed approach is not enough.
- Drag-and-drop reordering and swipe gestures on phones.
- Notifications (push or via your agent) for overdue items.

## Development

```bash
npm install
npm run dev        # API on :3000, Vite dev server on :5173
npm run build      # production build into dist/
npm start          # run the production build
```

The server is Express plus better-sqlite3 (TypeScript). The client is React, TypeScript, and Vite with hand-written CSS. Shared types live in `shared/`.

## License

MIT
