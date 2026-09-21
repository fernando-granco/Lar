# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's **Report a vulnerability** feature instead of opening a public issue. Include the affected version or commit, deployment shape, reproduction steps, and likely impact. Do not include real household data, API keys, calendar feed tokens, passwords, or Cloudflare credentials.

## Deployment model

Lar is designed for a trusted household network. The browser interface is not a multi-tenant account system. If Lar is reachable from the internet, place it behind a maintained authentication proxy such as Cloudflare Access, Authelia, or an authenticated VPN, and set a strong `LAR_API_KEY` for agent traffic.

Profile passwords protect acting as an individual household member; they do not turn Lar into a fully isolated multi-user service. Calendar subscription URLs contain a private token and should be handled like credentials.

Supported security fixes target the current `main` branch.
