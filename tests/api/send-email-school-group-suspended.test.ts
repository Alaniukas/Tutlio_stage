import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock, pushMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  pushMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
    constructor(_key: string) {}
  },
}));
vi.mock('../../api/_lib/sendPush', () => ({ sendPushForEmail: pushMock }));

function mockRes() {
  const result: { statusCode: number; body: any } = { statusCode: 0, body: null };
  return {
    status(code: number) { result.statusCode = code; return this; },
    json(body: any) { result.body = body; return this; },
    setHeader() { return this; },
    getResult: () => result,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-resend-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';
  sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
});

describe('school_group_suspended email', () => {
  it('explains the three-student rule and tells the family to contact the school', async () => {
    const { default: handler } = await import('../../api/send-email');
    const res = mockRes();
    await handler({
      method: 'POST',
      body: {
        type: 'school_group_suspended',
        to: 'parent@example.com',
        locale: 'lt',
        data: {
          schoolName: 'VšĮ Laisvi vaikai',
          organizationId: 'org-1',
          parentName: 'Irminta',
          studentName: 'Emilija',
          groupName: 'Lietuvių kalba 7 klasė',
          activeStudentCount: 2,
          minimumStudentCount: 3,
          contactEmail: 'mokykla@example.com',
        },
      },
      headers: { 'content-type': 'application/json', 'x-internal-key': 'service-key-test' },
      query: {},
    } as any, res as any);

    expect(res.getResult().statusCode).toBe(200);
    const sent = sendMock.mock.calls[0][0] as { subject: string; html: string };
    expect(sent.subject).toContain('Grupės užsiėmimai laikinai sustabdyti');
    expect(sent.html).toContain('Lietuvių kalba 7 klasė');
    expect(sent.html).toContain('Minimalus skaičius');
    expect(sent.html).toContain('mokykla@example.com');
  }, 30_000);
});
