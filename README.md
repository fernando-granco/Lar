# Lar

Lar is a calm, self-hosted home hub for the people you live with.

Keep a shared shopping list, to-dos, projects, recipes, a weekly menu, and calendars in one friendly web app. It works on phones, tablets, and computers—and can be installed like an app without giving your household data to a third party.

## What it does

- Shared to-dos and shopping, including priorities and “only mine” views
- Projects for repairs, vacations, parties, landscaping, and more
- A recipe book with menu planning and recurring meals
- A dashboard that each device can arrange, hide, enlarge, and recolour
- Optional browser reminders and local profile pictures
- A small REST API and MCP server for trusted helpers such as Hermes

## Start here

```bash
git clone https://github.com/fernando-granco/Lar.git
cd Lar
cp .env.example .env
docker compose up -d --build
```

Open `http://YOUR-SERVER:3001`, add the people in your household, and start with a shopping item or a small project.

Lar is free and open source under the [AGPL-3.0 license](LICENSE). You control the server and the data.

## Guides

- [Installing Lar](docs/INSTALLING.md)
- [Using Lar with AI agents and MCP](docs/AI_AGENTS.md)
- [Deploying safely outside your home](docs/DEPLOYMENT.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## A small security note

Lar is designed for a trusted household. If you expose it to the internet, put it behind an authentication layer such as Cloudflare Access, Authelia, or an authenticated VPN. Never commit `.env`, backups, or household data.
