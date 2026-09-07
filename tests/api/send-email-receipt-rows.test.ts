// Receipt moneyRows rendering: breakdown rows (teaching service + platform fee + total)
// appear when fee data is present and fall back gracefully when it is missing.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const eur = (n: number) =>
  new Intl.NumberFormat('lt-LT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

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
    status(code: number) {
      out.statusCode = code;
      return this;
    },
    json(body: any) {
      out.body = body;
      return this;
    },
    setHeader() {
      return this;
    },
    getResult: () => out,
  };
}

function mockReq(body: unknown) {
  return {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'x-internal-key': 'service-key-test' },
    query: {},
  };
}

async function sendEmail(type: string, data: Record<string, unknown>) {
  const { default: handler } = await import('../../api/send-email');
  const res = mockRes();
  await handler(mockReq({ type, to: 'parent@example.com', data, locale: 'lt' }) as any, res as any);
  expect(res.getResult().statusCode).toBe(200);
  expect(sendMock).toHaveBeenCalledTimes(1);
  return sendMock.mock.calls[0][0] as { subject: string; html: string };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-resend-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';
  sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
});

describe('payment_success receipt rows', () => {
  it('renders the 3-row breakdown when the charged total exceeds the lesson price', async () => {
    const { html } = await sendEmail('payment_success', {
      tutorName: 'Jonas Jonaitis',
      providerName: 'UAB Mokslo centras',
      date: '2026-05-10',
      time: '15:00',
      lessonPriceEur: '20.00',
      totalChargedEur: '20.96',
    });
    expect(html).toContain('Mokymo paslaugos');
    expect(html).toContain('UAB Mokslo centras');
    expect(html).toContain('Platformos administravimo mokestis');
    expect(html).toContain(eur(20));
    expect(html).toContain(eur(0.96)); // fee = charged − lesson
    expect(html).toContain(eur(20.96));
  });

  it('falls back to the tutor name when no provider organization is set', async () => {
    const { html } = await sendEmail('payment_success', {
      tutorName: 'Jonas Jonaitis',
      date: '2026-05-10',
      time: '15:00',
      lessonPriceEur: '15.00',
      totalChargedEur: '15.74',
    });
    expect(html).toContain('Mokymo paslaugos');
    expect(html).toContain('Jonas Jonaitis');
    expect(html).toContain(eur(0.74));
  });

  it('shows no breakdown when amounts match (fees absorbed, e.g. school org)', async () => {
    const { html } = await sendEmail('payment_success', {
      tutorName: 'Jonas Jonaitis',
      date: '2026-05-10',
      time: '15:00',
      lessonPriceEur: '20.00',
      totalChargedEur: '20.00',
    });
    expect(html).not.toContain('Platformos administravimo mokestis');
    expect(html).toContain(eur(20));
  });

  it('shows no breakdown when fee data is missing', async () => {
    const { html } = await sendEmail('payment_success', {
      tutorName: 'Jonas Jonaitis',
      date: '2026-05-10',
      time: '15:00',
      lessonPriceEur: '20.00',
    });
    expect(html).not.toContain('Platformos administravimo mokestis');
    expect(html).toContain(eur(20));
  });
});

describe('monthly_invoice_paid receipt rows', () => {
  it('renders the breakdown when the batch charge exceeds the lessons total', async () => {
    const { html } = await sendEmail('monthly_invoice_paid', {
      recipientName: 'Ona Onaitė',
      tutorName: 'Jonas Jonaitis',
      providerName: 'UAB Mokslo centras',
      periodText: '2026-05-01 – 2026-05-31',
      totalAmount: '100.00',
      baseTotalEur: '100.00',
      totalChargedEur: '102.55',
    });
    expect(html).toContain('Mokymo paslaugos');
    expect(html).toContain('Platformos administravimo mokestis');
    expect(html).toContain(eur(2.55));
    expect(html).toContain(eur(102.55));
  });

  it('keeps the single sum row when no fee data is present', async () => {
    const { html } = await sendEmail('monthly_invoice_paid', {
      recipientName: 'Ona Onaitė',
      tutorName: 'Jonas Jonaitis',
      periodText: '2026-05-01 – 2026-05-31',
      totalAmount: '100.00',
    });
    expect(html).not.toContain('Platformos administravimo mokestis');
    expect(html).toContain(eur(100));
  });
});

describe('prepaid_package_success receipt rows', () => {
  it('renders the breakdown when the package charge exceeds the package price', async () => {
    const { html } = await sendEmail('prepaid_package_success', {
      parentName: 'Ona Onaitė',
      tutorName: 'Jonas Jonaitis',
      providerName: 'UAB Mokslo centras',
      totalLessons: 8,
      availableLessons: 8,
      totalPrice: '160.00',
      baseTotalEur: '160.00',
      totalChargedEur: '166.04',
    });
    expect(html).toContain('Mokymo paslaugos');
    expect(html).toContain('Platformos administravimo mokestis');
    expect(html).toContain(eur(6.04));
    expect(html).toContain(eur(166.04));
  });
});

describe('platform_invoice (B2B) email', () => {
  it('renders invoice number, deducted row and amount due', async () => {
    const { subject, html } = await sendEmail('platform_invoice', {
      organizationName: 'UAB Agentūra',
      invoiceNumber: 'TUT-00001',
      periodLabel: '2026 m. gegužė',
      totalAmount: '53.50',
      deductedAmount: '4.50',
      amountDue: '49.00',
    });
    expect(subject).toContain('TUT-00001');
    expect(html).toContain('UAB Agentūra');
    expect(html).toContain(`-${eur(4.5)}`);
    expect(html).toContain(eur(49));
    expect(html).toContain('Mokėtina suma');
  });

  it('omits the deducted row when nothing was deducted', async () => {
    const { html } = await sendEmail('platform_invoice', {
      organizationName: 'UAB Agentūra',
      invoiceNumber: 'TUT-00002',
      periodLabel: '2026 m. birželis',
      totalAmount: '49.00',
      amountDue: '49.00',
    });
    expect(html).not.toContain('išskaityta iš jūsų lėšų');
    expect(html).toContain(eur(49));
  });
});
