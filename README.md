# Lar

[![CI](https://github.com/fernando-granco/Lar/actions/workflows/ci.yml/badge.svg)](https://github.com/fernando-granco/Lar/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-345a51.svg)](LICENSE)

Lar (Portuguese for "home") is a calm, self-hosted home hub for the people you live with — a shared shopping list, to-dos, projects, recipes, and a calendar in one friendly app, running on your own hardware.

No accounts, no subscriptions, no ads, and none of your household's plans end up on someone else's server. You run the container; you own the data.

## Why Lar

Most household apps want an account, a subscription, or your data. Lar is built to be the opposite of that:

- **Self-hosted.** One Docker container, one SQLite file. Your shopping list stays on your network.
- **No accounts.** Pick who you are from a list on each device. Add a password to a profile only if you want one.
- **Built for a shared screen.** Kid-friendly controls, large touch targets, and a dashboard every device can arrange for itself — it's as at home on a kitchen tablet as it is on your phone.
- **Installable.** A real PWA: add it to your home screen and it works like a native app, offline-tolerant shell included.
- **Agent-friendly.** A small REST API and an MCP server, so an AI assistant on your network can add to the list or check what's due, with its own name in the activity log.

## What it does

- Shared to-dos and shopping lists, with priorities, due dates, and "only mine" views
- Projects for repairs, trips, parties, and anything with milestones, a budget, or a shopping list of its own
- A recipe box with weekly menu planning and recurring meals
- A calendar that subscribes to Google/Apple/iCal feeds and publishes one back
- A dashboard each device can rearrange, resize, and recolor for itself
- Optional profile passwords and Cloudflare Access sign-in, kid-safe permissions, browser reminders, and local profile pictures
- A REST API and an MCP server for trusted helpers like Hermes or Claude

## Quick start

Lar needs Docker Compose and a place on your home network other devices can reach.

```bash
git clone https://github.com/fernando-granco/Lar.git
cd Lar
cp .env.example .env
docker compose up -d --build
```

Open `http://YOUR-SERVER:3001`, name your household, add the people who live there, and start with a shopping item or a small project. Everything else — passwords, calendars, the dashboard layout — can be set up later from the Household page.

## Guides

- [Installing Lar](docs/INSTALLING.md)
- [Using Lar with AI agents and MCP](docs/AI_AGENTS.md)
- [Deploying safely outside your home](docs/DEPLOYMENT.md)
- [Security policy](SECURITY.md)

## Tech stack

React, TypeScript, and Vite on the front end; Express and SQLite (via `better-sqlite3`) on the back end; one Docker image for both. No external services required — Cloudflare Access and calendar subscriptions are optional.

## A small security note

Lar is designed for a trusted household network, not a multi-tenant service — anyone who can reach it can pick any unprotected person. If you expose it to the internet, put it behind an authentication layer such as Cloudflare Access, Authelia, or an authenticated VPN. Never commit `.env`, backups, or household data. See [SECURITY.md](SECURITY.md) for the full deployment model and how to report a vulnerability.

## License

Lar is free and open source under the [AGPL-3.0 license](LICENSE). You control the server and the data.
