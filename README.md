# Homebase

A calm, self-hosted hub for your household: shared **to-dos**, a smart **shopping list**, and lightweight **project management** for everything you're building and fixing at home.

Built for a family on a home network. No accounts, no cloud, one container.

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
git clone https://github.com/fernando-granco/Homebase.git
cd Homebase
cp .env.example .env        # optional: set TZ and an API key
docker compose up -d --build
```

Open `http://YOUR-SERVER-IP:3001` from any device on your network. The first visit asks for your household name and the people in it. Each device then remembers who is using it, no passwords involved.

Your data lives in the `homebase-data` Docker volume as a single SQLite file.

**Update** with `git pull && docker compose up -d --build`. Database migrations run automatically on start.

### Keep it on your LAN

Homebase has no authentication by design. If you ever expose it beyond your home network, put it behind a reverse proxy with HTTPS and an auth layer (Caddy, Authelia, Tailscale, or similar) and set `HOMEBASE_API_KEY` for the API.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port inside the container. Compose maps it to `3001` on the host. |
| `DATA_DIR` | `/app/data` | Where the SQLite database is stored. |
| `TZ` | `UTC` | Timezone used for "today" and due dates. |
| `HOMEBASE_API_KEY` | unset | When set, agents and scripts must send it as a Bearer token or `X-Api-Key` header. Browser use on the LAN is unaffected. |

## API

Everything the app does is available under `/api/v1`. Send `X-Homebase-Member: <id>` to act as a person, or `X-Homebase-Agent: <name>` to act as an agent, so the activity log stays meaningful.

| Area | Endpoints |
| --- | --- |
| Household | `GET /household`, `PATCH /household/settings`, `POST/PATCH/DELETE /members/:id`, `POST/PATCH/DELETE /groups/:id` |
| To-dos | `GET /tasks?status=open&member=1&due=today`, `POST /tasks`, `PATCH /tasks/:id`, `POST /tasks/:id/complete`, `POST /tasks/:id/reopen`, `DELETE /tasks/:id` |
| Shopping | `GET /shopping/lists`, `GET /shopping/items?list=1&status=open`, `POST /shopping/items`, `POST /shopping/items/:id/check`, `POST /shopping/lists/:id/clear-checked` |
| Projects | `GET /projects`, `GET /projects/:id` (full detail), `POST /projects`, `PATCH /projects/:id`, plus `/projects/:id/milestones`, `/projects/:id/expenses`, `/projects/:id/links` |
| Other | `GET /summary`, `GET /activity`, `GET /events` (server-sent events), `GET /health` |

Assignment is a list of member and group ids. An empty list means "everyone".

```bash
curl -X POST http://YOUR-SERVER-IP:3001/api/v1/shopping/items \
  -H 'Content-Type: application/json' -H 'X-Homebase-Agent: hermes' \
  -d '{"name":"Oat milk","quantity":2}'
```

## Roadmap

- Agent access through the Model Context Protocol (MCP), so Hermes Agent, Claude, and others can use Homebase as a tool.
- Calendar: an iCal feed you can subscribe to from Google or Apple Calendar, then two-way sync.
- Backup and restore from the Household page.

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
