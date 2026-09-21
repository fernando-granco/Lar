import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { z, type ZodTypeAny } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const notFound = (what = 'Not found') => new HttpError(404, what);
export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);

/** Wrap an async or sync handler so thrown errors reach the error middleware. */
export const handler =
  (fn: (req: Request, res: Response) => unknown | Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve()
      .then(() => fn(req, res))
      .then((result) => {
        if (res.headersSent) return;
        if (result === undefined) res.end();
        else res.json(result);
      })
      .catch(next);
  };

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`);
    throw badRequest(issues[0] ?? 'Invalid input', issues);
  }
  return result.data;
}

/** Keep PATCH semantics strict when defaults inside a partial Zod schema materialize omitted keys. */
export function onlySupplied<T extends Record<string, unknown>>(input: unknown, parsed: T): T {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return parsed;
  return Object.fromEntries(Object.entries(parsed).filter(([key]) => Object.prototype.hasOwnProperty.call(input, key))) as T;
}

export function idParam(req: Request, name = 'id'): number {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id <= 0) throw badRequest(`Invalid ${name}`);
  return id;
}

export function errorMiddleware(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    res.status(400).json({ error: 'Malformed JSON body' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
}

// Reusable zod pieces
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
export const zTime = z.string().regex(/^\d{2}:\d{2}$/, 'Expected HH:MM');
export const zColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a hex color like #345a51');
export const zIdList = z.array(z.number().int().positive()).default([]);
export const zAssignees = z
  .object({ member_ids: zIdList, group_ids: zIdList })
  .default({ member_ids: [], group_ids: [] });
