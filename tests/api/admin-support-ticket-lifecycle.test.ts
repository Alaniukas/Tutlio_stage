import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  notifyStatus: vi.fn(),
  syncTrello: vi.fn(),
}));

vi.mock('../../api/_lib/adminSecret.js', () => ({ getPlatformAdminSecret: () => 'admin-secret' }));
vi.mock('../../api/_lib/supportPersistence.js', () => ({
  getSupportServiceClient: mocks.getClient,
  SUPPORT_ATTACHMENT_BUCKET: 'support-attachments',
}));
vi.mock('../../api/_lib/inAppSupportStatusEmail.js', () => ({ notifyInAppSupportStatus: mocks.notifyStatus }));
vi.mock('../../api/_lib/inAppSupportTicketSync.js', () => ({ syncInAppSupportTicket: mocks.syncTrello }));

import handler from '../../api/admin-support-requests';

const id = '17ee7859-5c8a-4fba-9dbd-9259ccad28f4';

function database(initial: Record<string, unknown> = {}) {
  let row = {
    id,
    status: 'registered',
    priority: 'medium',
    target_date: null as string | null,
    trello_card_id: 'trello-card',
    status_notified_signature: 'registered-email-sent',
    status_updated_at: '2026-09-29T10:00:00Z',
    ...initial,
  };
  const update = vi.fn((changes: Record<string, unknown>) => {
    row = { ...row, ...changes } as typeof row;
    return query;
  });
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    update,
    maybeSingle: vi.fn(async () => ({ data: { ...row }, error: null })),
    single: vi.fn(async () => ({ data: { ...row }, error: null })),
  };
  return { from: vi.fn(() => query), update };
}

function response() {
  const result = { statusCode: 200, body: null as any };
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn((code: number) => { result.statusCode = code; return res; }),
    json: vi.fn((body: unknown) => { result.body = body; return res; }),
  };
  return { result, res };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getClient.mockReturnValue(database());
  mocks.notifyStatus.mockResolvedValue(true);
  mocks.syncTrello.mockResolvedValue(true);
});

describe('admin support ticket lifecycle', () => {
  it('requires a deadline before marking a ticket in progress', async () => {
    const { result, res } = response();
    await handler({ method: 'PATCH', headers: { 'x-admin-secret': 'admin-secret' }, body: {
      id, status: 'in_progress', priority: 'high', targetDate: null,
    } } as any, res);
    expect(result.statusCode).toBe(400);
    expect(mocks.notifyStatus).not.toHaveBeenCalled();
  });

  it('saves the deadline, informs the reporter, and moves the Trello card', async () => {
    const { result, res } = response();
    await handler({ method: 'PATCH', headers: { 'x-admin-secret': 'admin-secret' }, body: {
      id, status: 'in_progress', priority: 'high', targetDate: '2026-10-05T12:00:00Z', internalNote: 'Working on it',
    } } as any, res);
    expect(result.statusCode).toBe(200);
    expect(result.body.request).toMatchObject({ status: 'in_progress', target_date: '2026-10-05T12:00:00.000Z' });
    expect(mocks.notifyStatus).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'in_progress' }));
    expect(mocks.syncTrello).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'in_progress', priority: 'high' }));
  });

  it('does not email the reporter for an internal priority-only change', async () => {
    const { result, res } = response();
    await handler({ method: 'PATCH', headers: { 'x-admin-secret': 'admin-secret' }, body: {
      id, status: 'registered', priority: 'urgent', targetDate: null,
    } } as any, res);
    expect(result.statusCode).toBe(200);
    expect(mocks.notifyStatus).not.toHaveBeenCalled();
    expect(mocks.syncTrello).toHaveBeenCalledTimes(1);
  });

  it('returns a retryable response when an explicit Trello retry remains pending', async () => {
    const db = database();
    mocks.getClient.mockReturnValue(db);
    mocks.syncTrello.mockResolvedValue(false);
    const { result, res } = response();

    await handler({ method: 'POST', headers: { 'x-admin-secret': 'admin-secret' }, body: {
      id, action: 'sync_trello',
    } } as any, res);

    expect(result.statusCode).toBe(503);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '30');
    expect(result.body.error).toMatch(/Trello/i);
    expect(result.body.error).toMatch(/retry|pending/i);
    expect(result.body).not.toHaveProperty('request');
    expect(db.update).not.toHaveBeenCalled();
    expect(mocks.syncTrello).toHaveBeenCalledTimes(1);
    expect(mocks.notifyStatus).not.toHaveBeenCalled();
  });

  it('preserves a saved status and warns when Trello synchronization remains pending', async () => {
    mocks.syncTrello.mockResolvedValue(false);
    const { result, res } = response();

    await handler({ method: 'PATCH', headers: { 'x-admin-secret': 'admin-secret' }, body: {
      id, status: 'in_progress', priority: 'high', targetDate: '2026-10-05T12:00:00Z',
    } } as any, res);

    expect(result.statusCode).toBe(200);
    expect(result.body.request).toMatchObject({
      status: 'in_progress', priority: 'high', target_date: '2026-10-05T12:00:00.000Z',
    });
    expect(result.body.warnings).toHaveLength(1);
    expect(result.body.warnings[0]).toMatch(/Trello/i);
    expect(result.body.warnings[0]).toMatch(/retry|pending|could not/i);
    expect(mocks.notifyStatus).toHaveBeenCalledTimes(1);
    expect(mocks.syncTrello).toHaveBeenCalledTimes(1);
  });

  it.each([null, '2026-10-05T12:00:00Z'])('clears the implementation deadline when resolving despite submitted targetDate %s', async (targetDate) => {
    const db = database({ status: 'in_progress', target_date: '2026-10-05T12:00:00.000Z' });
    mocks.getClient.mockReturnValue(db);
    const { result, res } = response();
    await handler({ method: 'PATCH', headers: { 'x-admin-secret': 'admin-secret' }, body: {
      id, status: 'resolved', priority: 'medium', targetDate,
    } } as any, res);

    expect(result.statusCode).toBe(200);
    expect(result.body.request).toMatchObject({ status: 'resolved', target_date: null });
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'resolved', target_date: null }));
    expect(mocks.notifyStatus).toHaveBeenCalledWith(db, expect.objectContaining({ status: 'resolved', target_date: null }));
    expect(mocks.syncTrello).toHaveBeenCalledWith(db, expect.objectContaining({ status: 'resolved', target_date: null }));
  });

  it('rejects a stale admin edit after Trello changed the priority', async () => {
    const { result, res } = response();
    await handler({ method: 'PATCH', headers: { 'x-admin-secret': 'admin-secret' }, body: {
      id, status: 'registered', priority: 'high', targetDate: null,
      expectedStatusUpdatedAt: '2026-09-29T10:00:00Z', expectedPriority: 'low',
    } } as any, res);
    expect(result.statusCode).toBe(409);
    expect(mocks.notifyStatus).not.toHaveBeenCalled();
    expect(mocks.syncTrello).not.toHaveBeenCalled();
  });
});
