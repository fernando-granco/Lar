# Using Lar with AI agents

Lar exposes a small REST API and an MCP endpoint at `/mcp`. An agent should identify itself with `X-Lar-Agent: <name>` so household activity stays understandable.

Set a strong `LAR_API_KEY` in `.env` so only agents that know the key can use `/mcp` or act as `X-Lar-Agent`. The agent then sends it as `Authorization: Bearer <key>` or `X-Api-Key: <key>`. This is about attribution, not a general lock: Lar is an open household app, and anyone who can reach it can already use the ordinary REST API as a browser would, with or without a key. The key stops an unknown script from impersonating your agent in the activity log, and it is also accepted on the few routes (a full backup, a restore, the calendar feed link) that otherwise require picking an adult in the household first.

An agent on your trusted home LAN can use `http://SERVER-IP:3001/mcp`. For an agent outside the LAN, protect the public endpoint with Cloudflare Access or another authentication proxy as well.

The MCP tools cover to-dos, shopping, projects, recipes, and meal plans. Use a named agent such as `hermes` so activity history says who made each change.
