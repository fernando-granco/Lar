import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
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
import { backup } from './routes/backup.js';
import { auth } from './routes/auth.js';
import { requireUnlock } from './auth.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; manifest-src 'self'; worker-src 'self'",
  );
  if (req.secure || req.header('x-forwarded-proto') === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// Optional agent key. When LAR_API_KEY is set, every request to /mcp and every
// /api request that identifies as an agent (X-Lar-Agent) must send the key as
// a Bearer token or X-Api-Key. It does not protect the browser app: Lar is an
// open household app, and the key only stops unknown automations on your
// network from acting as an agent. Keep Lar off the public internet, or put an
// auth proxy such as Cloudflare Access in front of it.
const apiKey = process.env.LAR_API_KEY?.trim();
if (apiKey && apiKey.length < 32) {
  throw new Error('LAR_API_KEY must be at least 32 characters. Generate a random key instead of using a memorable password.');
}

function keyMatches(supplied: string | undefined) {
  if (!apiKey || !supplied) return false;
  const expected = crypto.createHash('sha256').update(apiKey).digest();
  const candidate = crypto.createHash('sha256').update(supplied).digest();
  return crypto.timingSafeEqual(expected, candidate);
}

app.use(['/api', '/mcp'], (req, res, next) => {
  if (!apiKey) return next();
  const isAgent = req.path.startsWith('/mcp') || req.baseUrl.startsWith('/mcp') || !!req.header('x-lar-agent');
  if (!isAgent) return next();
  const authorization = req.header('authorization');
  const supplied = req.header('x-api-key') || authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (keyMatches(supplied)) return next();
  res.status(401).json({ error: 'A valid agent API key is required (LAR_API_KEY).' });
});

// People who set a profile password must be unlocked on the device first.
app.use('/api', requireUnlock);

const api = express.Router();
api.use(auth, household, tasks, shopping, projects, calendar, backup, misc);
app.use('/api/v1', api);
mountMcp(app);
app.get('/calendar/lar.ics', feedHandler);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route. The API lives under /api/v1.' }));
app.use(errorMiddleware);

// Serve the built client when it exists (production). In development Vite serves it.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(here, '..', 'client');
if (isDist && fs.existsSync(path.join(clientDir, 'index.html'))) {
  app.use(
    express.static(clientDir, {
      index: false,
      maxAge: '1h',
      setHeaders: (res, file) => {
        // Browsers must revalidate the worker to discover app updates quickly.
        if (path.basename(file) === 'sw.js') res.setHeader('Cache-Control', 'no-cache');
        if (path.basename(file) === 'manifest.webmanifest') res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.get('*', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
}

const port = Number(process.env.LAR_PORT || process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Lar is ready on http://localhost:${port}  (data in ${dataDir})`);
});
