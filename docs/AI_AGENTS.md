# Using Lar with AI agents

Lar exposes a small REST API and an MCP endpoint at `/mcp`. An agent should identify itself with `X-Lar-Agent: <name>` so household activity stays understandable.

Set a strong `LAR_API_KEY` in `.env` before allowing an agent to change data. The agent then sends it as `Authorization: Bearer <key>` or `X-Api-Key: <key>`.

An agent on your trusted home LAN can use `http://SERVER-IP:3001/mcp`. For an agent outside the LAN, protect the public endpoint with Cloudflare Access or another authentication proxy as well.

The MCP tools cover to-dos, shopping, projects, recipes, and meal plans. Use a named agent such as `hermes` so activity history says who made each change.
