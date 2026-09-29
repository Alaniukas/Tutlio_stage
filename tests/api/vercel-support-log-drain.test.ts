import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getClient: vi.fn() }));
vi.mock('../../api/_lib/supportPersistence.js', () => ({ getSupportServiceClient: mocks.getClient }));

import handler, { config } from '../../api/vercel-support-log-drain';
import { getCorrelatedSupportVercelLogs, parseSupportVercelLogBatch } from '../../api/_lib/supportVercelLogs';

const originalProjectId = process.env.VERCEL_PROJECT_ID;
const originalSecret = process.env.VERCEL_LOG_DRAIN_SECRET;

function log(overrides: Record<string, unknown> = {}) {
  return {
    id: '1573817250283254651097202070',
    projectId: 'project-123',
    source: 'lambda',
    timestamp: Date.now(),
    level: 'error',
    message: 'TypeError at /api/book?private from 192.0.2.15 and user@example.com',
    proxy: {
      vercelId: 'iad1::abc123',
      path: '/api/book?student=private',
      method: 'POST',
      statusCode: 500,
      clientIp: '192.0.2.15',
      userAgent: ['Mozilla/5.0 secret'],
    },
    ...overrides,
  };
}

function request(raw: string, signature?: string) {
  const req = Readable.from([Buffer.from(raw)]) as any;
  req.method = 'POST';
  req.headers = { 'x-vercel-signature': signature || createHmac('sha1', 'drain-secret').update(raw).digest('hex') };
  return req;
}

function response() {
  const result = { statusCode: 200, body: null as unknown };
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn((code: number) => { result.statusCode = code; return res; }),
    json: vi.fn((body: unknown) => { result.body = body; return res; }),
  };
  return { res, result };
}

beforeEach(() => {
  process.env.VERCEL_PROJECT_ID = 'project-123';
  process.env.VERCEL_LOG_DRAIN_SECRET = 'drain-secret';
  mocks.getClient.mockReset();
});

afterEach(() => {
  if (originalProjectId === undefined) delete process.env.VERCEL_PROJECT_ID;
  else process.env.VERCEL_PROJECT_ID = originalProjectId;
  if (originalSecret === undefined) delete process.env.VERCEL_LOG_DRAIN_SECRET;
  else process.env.VERCEL_LOG_DRAIN_SECRET = originalSecret;
});

describe('Vercel support log drain', () => {
  it('uses the raw Vercel body parser mode', () => {
    expect(config.api.bodyParser).toBe(false);
  });

  it('retains only correlated warning/error rows for the configured project without private request fields', () => {
    const rows = parseSupportVercelLogBatch([
      log(),
      log({ id: 'info-id', level: 'info' }),
      log({ id: 'wrong-project', projectId: 'other-project' }),
      log({ id: 'no-correlation', proxy: { path: '/api/book', method: 'POST' } }),
      log({ id: 'warning-id', level: 'warning', message: '{"requestBody":{"student":"Alice"}}' }),
    ], 'project-123');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      vercel_id: 'iad1::abc123',
      level: 'error',
      method: 'POST',
      path: '/api/book',
      status_code: 500,
    });
    expect(rows[0].message).not.toContain('?private');
    expect(rows[0].message).not.toContain('192.0.2.15');
    expect(rows[0].message).not.toContain('user@example.com');
    expect(JSON.stringify(rows)).not.toContain('Mozilla');
    expect(JSON.stringify(rows)).not.toContain('student=private');
    expect(rows[1].message).toBeNull();
  });

  it('drops dynamic path segments that can contain personal data', () => {
    const [row] = parseSupportVercelLogBatch([
      log({ proxy: { vercelId: 'iad1::abc123', path: '/api/client/192.0.2.15?token=private', method: 'GET' } }),
    ], 'project-123');

    expect(row.path).toBe('/api/client');
  });

  it('does not retain the drain endpoint’s own failed deliveries', () => {
    const rows = parseSupportVercelLogBatch([
      log({ proxy: { vercelId: 'iad1::drain', path: '/api/vercel-support-log-drain', method: 'POST', statusCode: 500 } }),
    ], 'project-123');

    expect(rows).toEqual([]);
  });

  it('verifies the exact raw-body signature before writing and makes retries idempotent', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const prune = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert, delete: () => ({ lt: prune }) }));
    mocks.getClient.mockReturnValue({ from });
    const raw = JSON.stringify([log()]);
    const { res, result } = response();

    await handler(request(raw), res);

    expect(result).toEqual({ statusCode: 200, body: { ok: true, accepted: 1 } });
    expect(from).toHaveBeenCalledWith('support_vercel_log_events');
    expect(upsert).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({
      log_id: '1573817250283254651097202070',
      vercel_id: 'iad1::abc123',
    })]), { onConflict: 'project_id,log_id', ignoreDuplicates: true });
    expect(prune).toHaveBeenCalledWith('occurred_at', expect.any(String));
    const cutoff = Date.parse(prune.mock.calls[0][1]);
    expect(Date.now() - cutoff).toBeGreaterThanOrEqual(13 * 24 * 60 * 60 * 1000);
    expect(Date.now() - cutoff).toBeLessThanOrEqual(15 * 24 * 60 * 60 * 1000);
  });

  it('rejects an invalid signature without querying the database', async () => {
    const raw = JSON.stringify([log()]);
    const { res, result } = response();

    await handler(request(raw, '0'.repeat(40)), res);

    expect(result.statusCode).toBe(403);
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it('looks up a bounded set of Vercel IDs only within the configured project', async () => {
    const query: any = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.in = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.limit = vi.fn(async () => ({ data: [{ vercel_id: 'iad1::abc123', level: 'error' }], error: null }));
    mocks.getClient.mockReturnValue({ from: vi.fn(() => query) });

    const rows = await getCorrelatedSupportVercelLogs(['iad1::abc123', 'iad1::abc123', 'bad id']);

    expect(rows).toHaveLength(1);
    expect(query.eq).toHaveBeenCalledWith('project_id', 'project-123');
    expect(query.in).toHaveBeenCalledWith('vercel_id', ['iad1::abc123']);
    expect(query.limit).toHaveBeenCalledWith(100);
  });
});
