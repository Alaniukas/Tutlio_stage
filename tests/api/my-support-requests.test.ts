import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyRequestAuth: vi.fn(),
  getSupportServiceClient: vi.fn(),
}));

vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: mocks.verifyRequestAuth }));
vi.mock('../../api/_lib/supportPersistence.js', () => ({ getSupportServiceClient: mocks.getSupportServiceClient }));

import handler from '../../api/my-support-requests';

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const FOREIGN_OWNER_ID = '22222222-2222-4222-8222-222222222222';
const PUBLIC_COLUMNS = ['id', 'title', 'category', 'status', 'created_at', 'status_updated_at', 'target_date'];

function ticketRow(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: 'Owner feature request',
    category: 'feature',
    status: 'in_progress',
    created_at: '2026-09-29T10:00:00.000Z',
    status_updated_at: '2026-09-30T10:00:00.000Z',
    target_date: '2026-10-02T12:00:00.000Z',
    reporter_user_id: OWNER_ID,
    reporter_role: 'student',
    organization_id: 'shared-organization',
    internal_note: 'PRIVATE-NOTE-SENTINEL',
    coding_agent_prompt: 'PRIVATE-CODING-PROMPT-SENTINEL',
    trello_card_url: 'https://trello.com/c/private-card-sentinel',
    trello_sync_error: 'PRIVATE-TRELLO-ERROR-SENTINEL',
    transcript: [{ role: 'user', content: 'PRIVATE-TRANSCRIPT-SENTINEL' }],
    reporter_email: 'private-reporter@example.test',
    ...extra,
  };
}

// A generic data-aware double makes removing an owner predicate or widening the
// projection expose the foreign/private fixture data to these regression tests.
function serviceClient(rows: Record<string, unknown>[]) {
  const queries: any[] = [];
  const from = vi.fn(() => {
    let columns = '*';
    let orderColumn: string | null = null;
    let ascending = false;
    const filters: Array<[string, unknown]> = [];
    const matching = () => {
      const matches = rows.filter((row) => filters.every(([column, value]) => row[column] === value));
      if (orderColumn) matches.sort((left, right) => String(left[orderColumn!]).localeCompare(String(right[orderColumn!])) * (ascending ? 1 : -1));
      return matches.map((row) => columns === '*' ? { ...row } : Object.fromEntries(columns.split(',').map((column) => [column, row[column]])));
    };
    const query: any = {};
    query.select = vi.fn((value: string) => { columns = value; return query; });
    query.eq = vi.fn((column: string, value: unknown) => { filters.push([column, value]); return query; });
    query.order = vi.fn((column: string, options: { ascending: boolean }) => { orderColumn = column; ascending = options.ascending; return query; });
    query.limit = vi.fn(async (limit: number) => ({ data: matching().slice(0, limit), error: null }));
    query.maybeSingle = vi.fn(async () => ({ data: matching()[0] || null, error: null }));
    queries.push(query);
    return query;
  });
  return { db: { from }, queries };
}

function response() {
  const result = { statusCode: 200, body: null as unknown };
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn((code: number) => {
      result.statusCode = code;
      return res;
    }),
    json: vi.fn((body: unknown) => {
      result.body = body;
      return res;
    }),
  };
  return { result, res };
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/my-support-requests', () => {
  it('returns only the verified reporter’s user-visible fields', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    mocks.verifyRequestAuth.mockResolvedValue({ userId, isInternal: false });
    const rows = [{
      id: '17ee7859-5c8a-4fba-9dbd-9259ccad28f4',
      title: 'Calendar does not load',
      category: 'bug',
      status: 'in_progress',
      created_at: '2026-09-29T10:00:00.000Z',
      status_updated_at: '2026-09-29T11:00:00.000Z',
      target_date: '2026-10-02T12:00:00.000Z',
    }];
    const query: any = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.limit = vi.fn(async () => ({ data: rows, error: null }));
    const db = { from: vi.fn(() => query) };
    mocks.getSupportServiceClient.mockReturnValue(db);
    const { result, res } = response();

    await handler({ method: 'GET', headers: { authorization: 'Bearer valid-token' } } as any, res);

    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({ requests: rows });
    expect(query.select).toHaveBeenCalledWith('id,title,category,status,created_at,status_updated_at,target_date');
    expect(query.eq).toHaveBeenCalledWith('reporter_user_id', userId);
    expect(db.from).toHaveBeenCalledWith('in_app_support_requests');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });

  it('does not allow an internal key or unauthenticated caller to read tickets', async () => {
    const { result, res } = response();
    mocks.verifyRequestAuth.mockResolvedValue({ userId: null, isInternal: true });
    await handler({ method: 'GET', headers: { 'x-internal-key': 'secret' } } as any, res);
    expect(result.statusCode).toBe(401);
    expect(mocks.getSupportServiceClient).not.toHaveBeenCalled();

    mocks.verifyRequestAuth.mockResolvedValue({ userId: OWNER_ID, isInternal: true });
    await handler({ method: 'GET', headers: { 'x-internal-key': 'secret' } } as any, res);
    expect(result.statusCode).toBe(401);
    expect(mocks.getSupportServiceClient).not.toHaveBeenCalled();

    mocks.verifyRequestAuth.mockResolvedValue(null);
    await handler({ method: 'GET', headers: {} } as any, res);
    expect(result.statusCode).toBe(401);
    expect(mocks.getSupportServiceClient).not.toHaveBeenCalled();
  });

  it('loads an older linked ticket only with the same reporter ownership check', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const olderId = '17ee7859-5c8a-4fba-9dbd-9259ccad28f4';
    mocks.verifyRequestAuth.mockResolvedValue({ userId, isInternal: false });
    const older = { id: olderId, title: 'Older request', status: 'in_progress' };
    const recentQuery: any = {};
    recentQuery.select = vi.fn(() => recentQuery);
    recentQuery.eq = vi.fn(() => recentQuery);
    recentQuery.order = vi.fn(() => recentQuery);
    recentQuery.limit = vi.fn(async () => ({ data: [], error: null }));
    const olderQuery: any = {};
    olderQuery.select = vi.fn(() => olderQuery);
    olderQuery.eq = vi.fn(() => olderQuery);
    olderQuery.maybeSingle = vi.fn(async () => ({ data: older, error: null }));
    const from = vi.fn().mockReturnValueOnce(recentQuery).mockReturnValueOnce(olderQuery);
    mocks.getSupportServiceClient.mockReturnValue({ from });
    const { result, res } = response();

    await handler({ method: 'GET', headers: {}, query: { ticket: olderId } } as any, res);

    expect(result.body).toEqual({ requests: [older] });
    expect(olderQuery.select).toHaveBeenCalledWith('id,title,category,status,created_at,status_updated_at,target_date');
    expect(olderQuery.eq).toHaveBeenCalledWith('reporter_user_id', userId);
    expect(olderQuery.eq).toHaveBeenCalledWith('id', olderId);
  });

  it('returns the reporter’s requests across portal contexts without another account’s tickets or private fields', async () => {
    mocks.verifyRequestAuth.mockResolvedValue({ userId: OWNER_ID, isInternal: false });
    const rows = ['tutor', 'student', 'parent', 'company', 'school'].map((portal, index) => ticketRow(
      `10000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
      { title: `Own ${portal} request`, reporter_role: portal === 'company' || portal === 'school' ? 'organization_admin' : portal, environment: { portal } },
    ));
    rows.push(ticketRow('27ee7859-5c8a-4fba-9dbd-9259ccad28f4', { reporter_user_id: FOREIGN_OWNER_ID, title: 'Another reporter in the same organization' }));
    const { db } = serviceClient(rows);
    mocks.getSupportServiceClient.mockReturnValue(db);
    const { result, res } = response();

    await handler({ method: 'GET', headers: {}, query: { portal: 'school', reporter_user_id: FOREIGN_OWNER_ID } } as any, res);

    expect(result.statusCode).toBe(200);
    const returned = (result.body as { requests: Record<string, unknown>[] }).requests;
    expect(returned.map((row) => row.title)).toEqual(rows.slice(0, 5).map((row) => row.title));
    for (const row of returned) expect(Object.keys(row).sort()).toEqual([...PUBLIC_COLUMNS].sort());
    const body = JSON.stringify(result.body);
    expect(body).not.toContain('PRIVATE-');
    expect(body).not.toContain('private-card-sentinel');
    expect(body).not.toContain('private-reporter@example.test');
    expect(body).not.toContain('Another reporter');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });

  it.each([OWNER_ID, FOREIGN_OWNER_ID])('checks ownership before adding a linked ticket outside the newest 100: %s', async (olderOwner) => {
    mocks.verifyRequestAuth.mockResolvedValue({ userId: OWNER_ID, isInternal: false });
    const olderId = '17ee7859-5c8a-4fba-9dbd-9259ccad28f4';
    const recent = Array.from({ length: 100 }, (_, index) => ticketRow(
      `10000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
      { title: `Recent request ${index}` },
    ));
    const older = ticketRow(olderId, { title: 'Older linked request', reporter_user_id: olderOwner, created_at: '2026-01-01T10:00:00.000Z', status: 'resolved' });
    const { db, queries } = serviceClient([...recent, older]);
    mocks.getSupportServiceClient.mockReturnValue(db);
    const { result, res } = response();

    await handler({ method: 'GET', headers: {}, query: { ticket: olderId } } as any, res);

    expect(result.statusCode).toBe(200);
    expect(db.from).toHaveBeenCalledTimes(2);
    expect(queries[1].eq).toHaveBeenCalledWith('reporter_user_id', OWNER_ID);
    expect(queries[1].eq).toHaveBeenCalledWith('id', olderId);
    const returned = (result.body as { requests: Record<string, unknown>[] }).requests;
    expect(returned).toHaveLength(olderOwner === OWNER_ID ? 101 : 100);
    if (olderOwner === OWNER_ID) {
      expect(returned[0].id).toBe(olderId);
      expect(Object.keys(returned[0]).sort()).toEqual([...PUBLIC_COLUMNS].sort());
    } else {
      expect(returned.some((row) => row.id === olderId)).toBe(false);
      expect(JSON.stringify(result.body)).not.toContain('Older linked request');
    }
    expect(JSON.stringify(result.body)).not.toContain('PRIVATE-');
  });

  it.each([
    { ticket: 'SUP-17EE7859' },
    { ticket: 'not-a-ticket' },
    { ticket: ['17ee7859-5c8a-4fba-9dbd-9259ccad28f4'] },
  ])('does not perform an old-ticket lookup for an invalid direct link: $ticket', async ({ ticket }) => {
    mocks.verifyRequestAuth.mockResolvedValue({ userId: OWNER_ID, isInternal: false });
    const { db } = serviceClient([]);
    mocks.getSupportServiceClient.mockReturnValue(db);
    const { result, res } = response();
    await handler({ method: 'GET', headers: {}, query: { ticket } } as any, res);

    expect(result.body).toEqual({ requests: [] });
    expect(db.from).toHaveBeenCalledTimes(1);
  });
});
