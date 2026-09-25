# Using Lar with AI agents

Lar exposes a small REST API and an MCP endpoint at `/mcp`. An agent should identify itself with `X-Lar-Agent: <name>` so household activity stays understandable.

Agent access is **off by default**. An adult turns it on in Lar under **Settings → Connections → Let AI agents and scripts use Lar**. While it is off, `/mcp` and every API request that sends `X-Lar-Agent` get a `403` with `code: "agent_access_off"`; the Lar app itself keeps working. Households that already existed before this switch was added keep agent access on after upgrading. To force it on from the server regardless of the setting (for example in a scripted install), set `LAR_AGENT_ACCESS=1`.

Set a strong `LAR_API_KEY` in `.env` so only agents that know the key can use `/mcp` or act as `X-Lar-Agent`. The agent then sends it as `Authorization: Bearer <key>` or `X-Api-Key: <key>`. This is about attribution, not a general lock: Lar is an open household app, and anyone who can reach it can already use the ordinary REST API as a browser would, with or without a key. The key stops an unknown script from impersonating your agent in the activity log, and it is also accepted on the few routes (a full backup, a restore, the calendar feed link) that otherwise require picking an adult in the household first.

An agent on your trusted home LAN can use `http://SERVER-IP:3001/mcp`. For an agent outside the LAN, protect the public endpoint with Cloudflare Access or another authentication proxy as well.

The MCP tools cover to-dos, shopping, projects (including project notes), recipes, and meal plans. A to-do can be due on a day (`due_date`) or sometime in a week or month (`when`: `this_week`, `next_week`, `this_month`, `next_month`). Agents can read every project note, including private ones, because they act for the whole household. Use a named agent such as `hermes` so activity history says who made each change.
