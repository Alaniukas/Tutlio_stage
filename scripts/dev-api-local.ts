/**
 * Local API dev server — same routes as Vercel `/api/*`, no `vercel login` required.
 * Listens on DEV_API_PORT (default 3002) for Vite proxy.
 */
import http from 'node:http';
import { Readable } from 'node:stream';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { VercelRequest, VercelResponse } from '../api/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const apiDir = join(projectRoot, 'api');
const PORT = Number(process.env.DEV_API_PORT || 3002);

function loadEnvFile(name: string) {
  const p = join(projectRoot, name);
  if (!existsSync(p)) return;
  const text = readFileSync(p, 'utf8');
  for (const line of text.split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');
/** Let API handlers infer browser origin on localhost even if VERCEL=1 leaked into .env */
process.env.TUTLIO_DEV_API_LOCAL = '1';

function buildQuery(url: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of url.searchParams.keys()) {
    const all = url.searchParams.getAll(key);
    out[key] = all.length <= 1 ? (all[0] ?? '') : all;
  }
  return out;
}

function patchResponse(res: ServerResponse): VercelResponse {
  const r = res as VercelResponse & { __vercelPatched?: boolean };
  if (r.__vercelPatched) return r;
  r.__vercelPatched = true;

  (r as VercelResponse & { status: (code: number) => VercelResponse }).status = function (
    this: VercelResponse,
    code: number,
  ) {
    this.statusCode = code;
    return this;
  };

  (r as VercelResponse & { json: (body: unknown) => void }).json = function (this: VercelResponse, body: unknown) {
    if (this.writableEnded || this.headersSent) return;
    this.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.end(JSON.stringify(body));
  };

  (r as VercelResponse & { send: (body: unknown) => void }).send = function (this: VercelResponse, body: unknown) {
    if (this.writableEnded || this.headersSent) return;
    if (Buffer.isBuffer(body)) {
      this.end(body);
      return;
    }
    if (typeof body === 'object' && body !== null) {
      this.setHeader('Content-Type', 'application/json; charset=utf-8');
      this.end(JSON.stringify(body));
      return;
    }
    const s = typeof body === 'string' ? body : String(body);
    if (!this.getHeader('Content-Type')) {
      this.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
    this.end(s);
  };

  (r as VercelResponse & { redirect: (loc: string | number, code?: number) => void }).redirect = function (
    this: VercelResponse,
    location: string | number,
    code?: number,
  ) {
    if (this.writableEnded || this.headersSent) return;
    if (typeof location === 'number') {
      const status = location;
      const loc = typeof code === 'string' ? code : '/';
      this.statusCode = status;
      this.setHeader('Location', loc);
      this.end();
      return;
    }
    const statusCode = typeof code === 'number' ? code : 302;
    this.statusCode = statusCode;
    this.setHeader('Location', location);
    this.end();
  };

  return r;
}

async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

const handlerCache = new Map<
  string,
  {
    mtimeMs: number;
    mod: { default: (req: VercelRequest, res: VercelResponse) => Promise<void>; config?: { api?: { bodyParser?: boolean } } };
  }
>();

async function getHandler(route: string) {
  const filePath = join(apiDir, `${route}.ts`);
  if (!existsSync(filePath)) return null;
  const mtimeMs = statSync(filePath).mtimeMs;
  const hit = handlerCache.get(route);
  if (hit && hit.mtimeMs === mtimeMs) return hit.mod;
  const href = `${pathToFileURL(filePath).href}?t=${mtimeMs}`;
  const mod = (await import(href)) as {
    default: (req: VercelRequest, res: VercelResponse) => Promise<void>;
    config?: { api?: { bodyParser?: boolean } };
  };
  handlerCache.set(route, { mtimeMs, mod });
  return mod;
}

const server = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host ?? 'localhost';
    const url = new URL(req.url ?? '/', `http://${host}`);
    if (!url.pathname.startsWith('/api/')) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    const parts = url.pathname.slice('/api/'.length).split('/').filter(Boolean);
    const route = parts[0];
    if (!route || route.startsWith('_') || route.includes('..')) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    const mod = await getHandler(route);
    if (!mod?.default) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'API route not found' }));
      return;
    }

    const rawBodyParserOff = route === 'stripe-webhook' || mod.config?.api?.bodyParser === false;
    const vRes = patchResponse(res);
    const query = buildQuery(url);

    const method = req.method ?? 'GET';
    if (method === 'GET' || method === 'HEAD') {
      const vReq = req as VercelRequest;
      vReq.query = query;
      vReq.body = undefined;
      await mod.default(vReq, vRes);
      return;
    }

    if (rawBodyParserOff) {
      const buf = await readRawBody(req);
      const stream = Readable.from(buf) as IncomingMessage & { body?: Buffer };
      stream.headers = req.headers;
      stream.method = req.method;
      stream.url = req.url;
      stream.httpVersion = req.httpVersion;
      const vReq = stream as unknown as VercelRequest;
      vReq.query = query;
      vReq.body = buf;
      await mod.default(vReq, vRes);
      return;
    }

    const buf = await readRawBody(req);
    const vReq = req as VercelRequest;
    vReq.query = query;
    const ct = (req.headers['content-type'] ?? '').toLowerCase();
    if (ct.includes('application/json')) {
      const text = buf.toString('utf8');
      try {
        vReq.body = text ? JSON.parse(text) : {};
      } catch {
        vReq.body = {};
      }
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      const text = buf.toString('utf8');
      const sp = new URLSearchParams(text);
      const obj: Record<string, unknown> = {};
      for (const [k, v] of sp.entries()) obj[k] = v;
      vReq.body = obj;
    } else if (buf.length === 0) {
      vReq.body = {};
    } else {
      vReq.body = buf;
    }

    await mod.default(vReq, vRes);
  } catch (e) {
    console.error('[dev-api-local]', e);
    if (!res.headersSent && !res.writableEnded) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      const m = e instanceof Error ? e.message : String(e);
      res.end(JSON.stringify({ error: m, message: m }));
    }
  }
});

async function startListening(): Promise<void> {
  const killPort = (await import('kill-port')).default as (port: number) => Promise<unknown>;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onErr = (err: NodeJS.ErrnoException) => {
          server.off('error', onErr);
          reject(err);
        };
        server.once('error', onErr);
        server.listen(PORT, '0.0.0.0', () => {
          server.off('error', onErr);
          resolve();
        });
      });
      console.log(
        `[dev-api-local] API listening on http://localhost:${PORT}/api/* (proxied by Vite; no login to Vercel needed)`,
      );
      return;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== 'EADDRINUSE') throw err;
      if (attempt >= 1) {
        console.error(
          `[dev-api-local] Port ${PORT} is still busy. Run: npm run free:3002 — or set DEV_API_PORT`,
        );
        process.exit(1);
      }
      console.warn(`[dev-api-local] Port ${PORT} busy (leftover server). Clearing it once…`);
      try {
        await killPort(PORT);
      } catch {
        /* nothing listening or kill-package message — retry listen anyway */
      }
    }
  }
}

startListening().catch((e) => {
  console.error('[dev-api-local] Failed to start:', e);
  process.exit(1);
});
