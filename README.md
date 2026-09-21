# Lar

**The family's home hub.** Shared **to-dos**, a smart **shopping list**, and lightweight **project management** for everything you're building and fixing at home. Self-hosted, calm, and built for a family on a home network. No accounts, no cloud, one container.

*Lar* is Portuguese for "home", the hearth-and-family kind.

## What it does

- **To-dos** for everyone or for specific people and groups (like "Kids"). Due dates, priorities, repeating chores, and a quick-add that understands "Call plumber tomorrow !high".
- **Shopping list** with priorities, quantities, aisle grouping, suggestions from what you usually buy, extra lists, and a one-tap mobile fast-add. "2x oat milk !urgent" just works.
- **Projects** with milestones, to-dos, a shopping list inside the project, budget and expense tracking, notes, and links. Enough to run a backyard refresh or a kitchen remodel without becoming a chore itself.
- **Today** view with per-device ordering and show/hide controls for to-dos, shopping, calendar, menu, and projects.
- **Recipes and weekly menu**, opt-in from Household settings so families that do not need it keep a simpler Lar.
- **Live updates** between phones and computers on the network.
- **Phone friendly** and installable to the home screen, with a one-tap shopping action beside the mobile to-do button. Light and dark themes, larger text options, and configurable checked-item behaviour.
- **Customizable project overviews** with show/hide, ordering, card widths, compact/comfortable layouts, and direct creation of milestones, to-dos, shopping items, expenses, notes, and links.
- **REST API and MCP server** for scripts and agents, with an activity log of who changed what.

## Personalize Lar

The **Household** screen is split into focused tabs for Family, General, Display, Connections, Activity, and Data. Display preferences are stored on the current device, so a wall tablet, phone, and laptop can each use a layout and text size that suits them.

- Reorder or hide individual cards on the Today dashboard.
- Choose when checked to-dos and shopping items move out of the active list.
- Choose standard, large, or extra-large text.
- Enable the recipe book and weekly menu only when the household wants it.
- Customize project Overview cards by visibility, order, width, and density. New project to-dos and shopping items automatically start assigned to the project's owner and involved people.

## Run it with Docker

```bash
git clone https://github.com/fernando-granco/Lar.git
cd Lar
cp .env.example .env        # optional: set TZ and an API key
docker compose up -d --build
```

Open `http://YOUR-SERVER-IP:3001` from any device on your network. The first visit asks for your household name and the people in it. Each device then remembers who is using it, no passwords involved.

### Install it like an app

Installation requires the HTTPS address for your Lar instance (for example `https://lar.example.com`); browsers do not offer full PWA installation from a plain LAN IP address.

- **iPhone/iPad:** open Lar, tap **Share**, choose **Add to Home Screen**, then tap **Add**.
- **Android:** open Lar in Chrome or Samsung Internet and use Lar's **Household → Install Lar** button. You can also choose **Install app** or **Add to Home screen** from the browser menu.

Lar then has its own icon, launches in a standalone window, respects safe areas, and keeps the app shell available if the network briefly drops. Household data still comes from your server.

Your data lives in the `lar-data` Docker volume as a single SQLite file.

**Update** with `git pull && docker compose up -d --build`. Database migrations run automatically on start.

### Who is who, and the security model

Lar has no accounts. Each device picks a person from the household, and that choice is remembered. Anyone who can reach Lar can read and change everything, which is the point for a family on a home network.

- **Optional profile password.** Any person can add a password to their profile on the Household page. From then on a device must enter it once before acting as that person. Everything else stays open. Forgot it? On the server: `docker exec lar node dist/server/cli.js reset-password NAME`.
- **Kid profiles.** Mark a person as a kid to prevent that profile from adding people, removing itself, or adding/changing its own password. These limits are enforced by the API as well as hidden in the interface.
- **Keep it on your LAN.** To use Lar away from home, put it behind HTTPS and an auth layer (Cloudflare Access, Authelia, Tailscale, or similar). See the Cloudflare Access section below: with a little configuration it also signs people in automatically.
- **Agents.** Set `LAR_API_KEY` so only automations that know the key can act as an agent (see Agents below). It does not protect the browser app.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port inside the container. Compose maps it to `3001` on the host. |
| `DATA_DIR` | `/app/data` | Where the SQLite database is stored. |
| `TZ` | `UTC` | Timezone used for "today" and due dates. |
| `LAR_API_KEY` | unset | When set, every MCP request and every API request that identifies as an agent must send it as a Bearer token or `X-Api-Key` header. The browser app is unaffected. |
| `LAR_CF_ACCESS_TEAM` | unset | Your Cloudflare Access team name (the part before `.cloudflareaccess.com`). With `LAR_CF_ACCESS_AUD`, people coming through Access are signed in automatically by the email on their profile. |
| `LAR_CF_ACCESS_AUD` | unset | The Access application's Audience (AUD) tag. |

## API

Everything the app does is available under `/api/v1`. Send `X-Lar-Member: <id>` to act as a person, or `X-Lar-Agent: <name>` to act as an agent, so the activity log stays meaningful. Acting as a person who set a password needs an `X-Lar-Unlock` token from `POST /auth/unlock`.

`PATCH` endpoints update only the fields included in the request, so a small edit never resets the other values on an item.

| Area | Endpoints |
| --- | --- |
| Household | `GET /household`, `PATCH /household/settings`, `POST/PATCH/DELETE /members/:id`, `POST/PATCH/DELETE /groups/:id` |
| To-dos | `GET /tasks?status=open&member=1&due=today`, `POST /tasks`, `PATCH /tasks/:id`, `POST /tasks/:id/complete`, `POST /tasks/:id/reopen`, `DELETE /tasks/:id` |
| Shopping | `GET /shopping/lists`, `GET /shopping/items?list=1&status=open`, `POST /shopping/items`, `POST /shopping/items/:id/check`, `POST /shopping/lists/:id/clear-checked` |
| Projects | `GET /projects`, `GET /projects/:id` (full detail), `POST /projects`, `PATCH /projects/:id`, plus `/projects/:id/milestones`, `/projects/:id/expenses`, `/projects/:id/links` |
| Recipes | `GET/POST /recipes`, `GET/PATCH/DELETE /recipes/:id`, `GET /menu?from=YYYY-MM-DD&to=YYYY-MM-DD`, `POST /menu`, `DELETE /menu/:id` |
| Calendar | `GET /calendars`, `POST /calendars`, `GET /calendar/events?days=7`, `GET /calendar/feed-info`; public feed at `/calendar/lar.ics?token=…` |
| Other | `GET /summary`, `GET /activity`, `GET /events` (server-sent events), `GET /backup`, `POST /restore`, `GET /health` |

Assignment is a list of member and group ids. An empty list means "everyone".

```bash
curl -X POST http://YOUR-SERVER-IP:3001/api/v1/shopping/items \
  -H 'Content-Type: application/json' -H 'X-Lar-Agent: hermes' \
  -d '{"name":"Oat milk","quantity":2}'
```

## Agents (MCP)

Lar is an MCP server. Point any Model Context Protocol client at `http://YOUR-SERVER-IP:3001/mcp` (Streamable HTTP, stateless) and it gets tools such as `lar_overview`, `list_todos`, `add_todo`, `complete_todo`, `add_shopping_items`, `check_shopping_items`, `list_projects`, `get_project`, `add_milestone`, `add_expense`, `list_recipes`, and `plan_meal`. Tools take people and projects by name, so "add urgent oat milk for Alex" or "plan tacos for Friday dinner" just works.

Send `X-Lar-Agent: <name>` so the activity log says who did it. If `LAR_API_KEY` is set, also send `Authorization: Bearer <key>`.

Use a random key of at least 32 characters; do not use a memorable password or commit the key to Git. One way to generate one on the server is `openssl rand -hex 32`. Lar refuses to start with a shorter configured key. `GET /api/v1/health` reports `agent_api_protected: true` when protection is active without revealing the key.

Claude Code:

```bash
claude mcp add --transport http lar http://YOUR-SERVER-IP:3001/mcp --header "X-Lar-Agent: claude"
```

Hermes Agent or any other MCP-aware agent: add an HTTP MCP server with the same URL and headers. Agents without MCP support can use the REST API above; `GET /api/v1` lists every route.

## Calendars

Two directions, no OAuth setup required:

- **Lar in your calendar.** The Household page shows a private feed address (`/calendar/lar.ics?token=…`). Subscribe to it from Google Calendar (Other calendars → From URL) or Apple Calendar (File → New Calendar Subscription) and to-do due dates, milestones, and project target dates appear there. You can pick a feed for one person's items only.
- **Your calendars in Lar.** Paste the private iCal link of a Google, iCloud, Outlook, or school calendar and the next days' events show on the Today page. Recurring events are expanded, links are refreshed every ten minutes. Links to addresses on your own network are refused unless you allow them on the Household page, so nobody can point Lar at other devices in the house.

## Behind Cloudflare Access (or any auth proxy)

Lar works behind Cloudflare Access, Authelia, or a similar login layer with two adjustments:

- **Calendar feed.** Google and Apple fetch `/calendar/lar.ics` without a browser session, so a login page breaks the subscription. Add an Access application for the path `your-domain/calendar/*` with a **Bypass** policy. The feed stays protected by its own token.
- **Agents and scripts.** Requests to `/mcp` and `/api/v1` must pass Access. Either give the agent a Cloudflare **Service Token** and send the `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers, or let an agent on your home network use the LAN address directly and skip the tunnel. Set `LAR_API_KEY` as well if the API is reachable from outside.

The browser app, live updates, and the iCal links you import all work unchanged.

**Automatic sign-in.** Set `LAR_CF_ACCESS_TEAM` and `LAR_CF_ACCESS_AUD` (both shown in the Access application's settings) and put each person's email on their profile. Lar verifies the signed identity Cloudflare attaches to every request and picks that person on the device, unlocking their profile if it has a password. On the home network, where Access is not involved, the usual picker appears.

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

Before submitting a change, run:

```bash
npm run typecheck
npm run build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the project conventions and [SECURITY.md](SECURITY.md) for responsible vulnerability reporting.

## License

AGPL-3.0
