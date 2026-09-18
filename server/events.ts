import type { Response } from 'express';
import type { ChangeEvent } from '../shared/types.js';

/** A tiny in-process event bus that fans out changes to connected browsers over Server-Sent Events. */
const clients = new Set<Response>();

export function subscribe(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(`retry: 3000\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(`: ping\n\n`), 25_000);
  res.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
}

export function publish(event: ChangeEvent) {
  const payload = `event: change\ndata: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) res.write(payload);
}

export function clientCount() {
  return clients.size;
}
