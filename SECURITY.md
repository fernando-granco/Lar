# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's **Report a vulnerability** feature instead of opening a public issue. Include the affected version or commit, deployment shape, reproduction steps, and likely impact. Do not include real household data, API keys, calendar feed tokens, passwords, or Cloudflare credentials.

## Deployment model

Lar is designed for a trusted household network. The browser interface is not a multi-tenant account system: anyone who can reach it can pick any unprotected person and use the app as them. If Lar is reachable from the internet, place it behind a maintained authentication proxy such as Cloudflare Access, Authelia, or an authenticated VPN, and set a strong `LAR_API_KEY` for agent traffic.

The server also refuses cross-origin browser requests (checked by the `Origin` header) and trusts `X-Forwarded-For` only when `LAR_TRUST_PROXY=1` is set, so a malicious page open in someone's browser, or a device spoofing its address, cannot use either as a way in.

Profile passwords protect acting as an individual household member; they do not turn Lar into a fully isolated multi-user service. `LAR_API_KEY` protects two different things: it is required on every request to `/mcp`, and on any `/api` request that identifies itself as an agent with `X-Lar-Agent` — but it does not gate ordinary browser use, which stays open by design. A full data export (`GET /backup`), a restore, and the private calendar feed link additionally require the request to come from an adult who has picked themselves on that device (or supply the API key), since those hand back more than any one person should see by accident. Calendar subscription URLs and downloaded backups contain a private token and password hashes respectively, and should be handled like credentials.

Supported security fixes target the current `main` branch.
