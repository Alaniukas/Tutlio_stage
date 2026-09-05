// The two school emails that replace the parent portal for families without an
// account: the post-acceptance invitation and the month-end invoice.
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

vi.mock('../../api/_lib/sendPush', () => ({
  sendPushForEmail: pushMock,
}));

function mockRes() {
  const out: { statusCode: number; body: any } = { statusCode: 0, body: null };
  return {
    status(code: number) { out.statusCode = code; return this; },
    json(body: any) { out.body = body; return this; },
    setHeader() { return this; },
    getResult: () => out,
  };
}

async function sendEmail(type: string, data: Record<string, unknown>) {
  const { default: handler } = await import('../../api/send-email');
  const res = mockRes();
  await handler({
    method: 'POST',
    body: { type, to: 'parent@example.com', data, locale: 'lt' },
    headers: { 'content-type': 'application/json', 'x-internal-key': 'service-key-test' },
    query: {},
  } as any, res as any);
  expect(res.getResult().statusCode).toBe(200);
  expect(sendMock).toHaveBeenCalledTimes(1);
  return sendMock.mock.calls[0][0] as { subject: string; html: string };
}

// send-email imports thirteen locale dictionaries; under full-suite load the first
// import in a worker can exceed the 5 s default without anything being wrong.
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-resend-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';
  sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
});

describe('school_extra_first_lesson_invite', () => {
  it('shows the nearest lesson with a tracked join link and the homework page, without account talk', async () => {
    const { subject, html } = await sendEmail('school_extra_first_lesson_invite', {
      schoolName: 'Demo Mokykla',
      studentName: 'Austėja Mockutė',
      parentName: 'Tėvas',
      contractNumber: 'PP-1',
      sessionId: '11111111-1111-4111-8111-111111111111',
      date: '2026-09-08',
      time: '16:00',
      duration: 45,
      tutorName: 'Demo Mokytoja Ana',
      groupName: 'QA Legal Matematika',
      meetingLink: 'https://meet.google.com/abc',
      homeworkUrl: 'https://tutlio.lt/school-homework?student=s1&t=abc',
      waitsFor14Days: false,
    });
    expect(subject).toBe('Kvietimas į pirmą pamoką — Austėja Mockutė, 2026-09-08 16:00');
    expect(html).toContain('Prisijungti prie pamokos');
    expect(html).toContain('/api/join-session?');
    expect(html).toContain('school-homework?student=s1');
    expect(html).toContain('Demo Mokytoja Ana');
    expect(html).toContain('QA Legal Matematika');
    expect(html).not.toContain('/parent/');
    expect(html).not.toMatch(/registr/i);
    expect(html).toContain('paskyros kurti nereikia');
  });

  it('falls back to the planned schedule when no lesson row exists yet and explains the 14-day wait', async () => {
    const { subject, html } = await sendEmail('school_extra_first_lesson_invite', {
      schoolName: 'Demo Mokykla',
      studentName: 'Austėja Mockutė',
      contractNumber: 'PP-1',
      serviceStartDate: '2026-09-19',
      scheduleLabel: 'antradienis 16:00–16:45',
      waitsFor14Days: true,
      homeworkUrl: 'https://tutlio.lt/school-homework?student=s1&t=abc',
    });
    expect(subject).toBe('Kvietimas į pirmą pamoką — Austėja Mockutė');
    expect(html).toContain('antradienis 16:00–16:45');
    expect(html).toContain('2026-09-19');
    expect(html).toContain('14 dienų');
    expect(html).not.toContain('/api/join-session?');
  });
});

describe('school_monthly_invoice', () => {
  it('lists the breakdown and a pay button that needs no account', async () => {
    const { subject, html } = await sendEmail('school_monthly_invoice', {
      schoolName: 'Demo Mokykla',
      contactEmail: 'info@demo.lt',
      studentName: 'Austėja Mockutė',
      parentName: 'Tėvas',
      contractNumber: 'PP-1',
      periodLabel: '2026 m. rugsėjis',
      unitPrice: '18.00',
      baseLessons: 8,
      baseAmount: '144.00',
      extraLessons: 1,
      extraAmount: '18.00',
      totalAmount: '162.00',
      dueDate: '2026-10-07',
      payUrl: 'https://tutlio.lt/api/pay-school-monthly-invoice?invoice=inv-1&t=abc',
    });
    expect(subject).toBe('Sąskaita už 2026 m. rugsėjis — Austėja Mockutė');
    expect(html).toContain('pay-school-monthly-invoice?invoice=inv-1');
    expect(html).toContain('Apmokėti');
    expect(html).toContain('162,00');
    expect(html).toContain('8 ×');
    expect(html).toContain('1 ×');
    expect(html).toContain('2026-10-07');
    expect(html).toContain('prisijungti nereikia');
    expect(html).not.toContain('/parent/');
  });

  it('points to the school when card payments are not set up', async () => {
    const { html } = await sendEmail('school_monthly_invoice', {
      schoolName: 'Demo Mokykla',
      contactEmail: 'info@demo.lt',
      studentName: 'A',
      periodLabel: '2026 m. rugsėjis',
      unitPrice: '18.00',
      baseLessons: 8,
      baseAmount: '144.00',
      extraLessons: 0,
      extraAmount: '0.00',
      totalAmount: '144.00',
      dueDate: '2026-10-07',
    });
    expect(html).not.toContain('pay-school-monthly-invoice');
    expect(html).toContain('Apmokėjimo būdą nurodys mokykla');
    expect(html).toContain('info@demo.lt');
  });
});
