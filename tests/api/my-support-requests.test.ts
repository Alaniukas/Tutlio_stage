import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyRequestAuth: vi.fn(),
  getSupportServiceClient: vi.fn(),
}));

vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: mocks.verifyRequestAuth }));
vi.mock('../../api/_lib/supportPersistence.js', () => ({ getSupportServiceClient: mocks.getSupportServiceClient }));

import handler from '../../api/my-support-requests';

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
});
