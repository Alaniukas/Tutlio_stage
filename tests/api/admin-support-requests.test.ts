import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAdminSecret: vi.fn(),
  getClient: vi.fn(),
  sendCompletionEmail: vi.fn(),
  updates: [] as Record<string, unknown>[],
}));

vi.mock('../../api/_lib/adminSecret.js', () => ({ getPlatformAdminSecret: mocks.getAdminSecret }));
vi.mock('../../api/_lib/supportPersistence.js', () => ({
  getSupportServiceClient: mocks.getClient,
  SUPPORT_ATTACHMENT_BUCKET: 'support-attachments',
}));
vi.mock('../../api/_lib/inAppSupportCompletionEmail.js', () => ({
  sendInAppSupportCompletionEmail: mocks.sendCompletionEmail,
}));

import handler from '../../api/admin-support-requests';

const resolvedRequest = {
  id: '17ee7859-5c8a-4fba-9dbd-9259ccad28f4',
  reporter_name: 'Marta',
  reporter_email: 'marta@example.com',
  category: 'bug',
  title: 'Support popup loses the draft',
  locale: 'nl',
  status: 'resolved',
  completion_notified_at: null,
  completion_notification_email_id: null,
};

function database(row: typeof resolvedRequest) {
  return {
    from: vi.fn(() => {
      let update: Record<string, unknown> | null = null;
      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: vi.fn(async () => ({ data: row, error: null })),
        update: vi.fn((value: Record<string, unknown>) => {
          update = value;
          mocks.updates.push(value);
          return query;
        }),
        single: vi.fn(async () => ({ data: { ...row, ...update }, error: null })),
      };
      return query;
    }),
  };
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updates.length = 0;
  mocks.getAdminSecret.mockReturnValue('admin-secret');
  mocks.sendCompletionEmail.mockResolvedValue('resend-completion-1');
});

describe('/api/admin-support-requests completion notifications', () => {
  it('emails the stored reporter and records the provider delivery ID', async () => {
    mocks.getClient.mockReturnValue(database(resolvedRequest));
    const { result, res } = response();

    await handler({
      method: 'POST',
      headers: { 'x-admin-secret': 'admin-secret' },
      body: { id: resolvedRequest.id, action: 'notify_completion' },
    } as any, res);

    expect(result.statusCode).toBe(200);
    expect(mocks.sendCompletionEmail).toHaveBeenCalledWith({
      id: resolvedRequest.id,
      reference: 'SUP-17EE7859',
      reporterName: 'Marta',
      reporterEmail: 'marta@example.com',
      category: 'bug',
      title: resolvedRequest.title,
      locale: 'nl',
    });
    expect(mocks.updates[0]).toMatchObject({
      completion_notification_email_id: 'resend-completion-1',
      completion_notified_at: expect.any(String),
    });
  });

  it('refuses to email before the resolved status is saved', async () => {
    mocks.getClient.mockReturnValue(database({ ...resolvedRequest, status: 'planned' }));
    const { result, res } = response();

    await handler({
      method: 'POST',
      headers: { 'x-admin-secret': 'admin-secret' },
      body: { id: resolvedRequest.id, action: 'notify_completion' },
    } as any, res);

    expect(result.statusCode).toBe(409);
    expect(mocks.sendCompletionEmail).not.toHaveBeenCalled();
  });

  it('prevents duplicate completion notifications', async () => {
    mocks.getClient.mockReturnValue(database({
      ...resolvedRequest,
      completion_notified_at: '2026-09-18T12:00:00.000Z',
    }));
    const { result, res } = response();

    await handler({
      method: 'POST',
      headers: { 'x-admin-secret': 'admin-secret' },
      body: { id: resolvedRequest.id, action: 'notify_completion' },
    } as any, res);

    expect(result.statusCode).toBe(409);
    expect(mocks.sendCompletionEmail).not.toHaveBeenCalled();
  });
});
