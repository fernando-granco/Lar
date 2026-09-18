import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dataDir, isDist } from './db.js';
import { errorMiddleware } from './http.js';
import { household } from './routes/household.js';
import { tasks } from './routes/tasks.js';
import { shopping } from './routes/shopping.js';
import { projects } from './routes/projects.js';
import { misc } from './routes/misc.js';
import { mountMcp } from './mcp.js';
import { calendar, feedHandler } from './routes/calendar.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// Optional API key. When HOMEBASE_API_KEY is set, requests from outside the
// browser app (agents, scripts) must send it as a Bearer token or `X-Api-Key`.
// Browser requests carry no key, so the check is only enforced when a key is
// configured AND the request identifies as an agent or has no Origin header.
const apiKey = process.env.HOMEBASE_API_KEY;
app.use(['/api', '/mcp'], (req, res, next) => {
  if (!apiKey) return next();
  const supplied = req.header('x-api-key') || req.header('authorization')?.replace(/^Bearer\s+/i, '');
  const isBrowser = !!req.header('origin') || !!req.header('sec-fetch-mode');
  if (isBrowser && !req.header('x-homebase-agent')) return next();
  if (supplied === apiKey) return next();
  res.status(401).json({ error: 'A valid API key is required.' });
});

const api = express.Router();
api.use(household, tasks, shopping, projects, calendar, misc);
app.use('/api/v1', api);
mountMcp(app);
app.get('/calendar/homebase.ics', feedHandler);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route. The API lives under /api/v1.' }));
app.use(errorMiddleware);

// Serve the built client when it exists (production). In development Vite serves it.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, '..', 'client');
if (isDist && fs.existsSync(path.join(clientDir, 'index.html'))) {
  app.use(express.static(clientDir, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
}

const port = Number(process.env.HOMEBASE_PORT || process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Homebase is ready on http://localhost:${port}  (data in ${dataDir})`);
});
