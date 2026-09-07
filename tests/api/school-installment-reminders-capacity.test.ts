import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  const from = vi.fn();
  const client = { rpc, from };
  return {
    rpc,
    from,
    client,
    createClient: vi.fn(() => client),
    installments: [] as any[],
    countRows: [] as Array<{ contract_id: string }>,
    updateCalls: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('../../api/_lib/reminderOptOut.js', () => ({
  loadReminderOptOuts: vi.fn(async () => new Set<string>()),
  normalizeReminderEmail: (email: string | null | undefined) =>
    String(email || '').trim().toLowerCase(),
}));

import handler, { SCHOOL_REMINDER_BATCH_SIZE } from '../../api/school-installment-reminders';

function mockReq() {
  return { method: 'GET', headers: {}, body: {}, query: {} } as any;
}

function mockRes() {
  const output: { statusCode: number; body: any } = { statusCode: 0, body: null };
  const response: any = {
    status(code: number) {
      output.statusCode = code;
      return response;
    },
    json(body: any) {
      output.body = body;
      return response;
    },
    getResult: () => output,
  };
  return response;
}

function ymdInVilnius(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function dueIn(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return ymdInVilnius(date);
}

function installment() {
  return {
    id: 'installment-1',
    contract_id: 'contract-1',
    installment_number: 1,
    amount: 100,
    due_date: dueIn(3),
    payment_status: 'pending',
    reminder_3d_sent_at: null,
    reminder_1d_sent_at: null,
    contract: {
      id: 'contract-1',
      student_id: 'student-1',
      organization_id: 'organization-1',
      signing_status: 'signed',
      archived_at: null,
      annual_fee: 100,
      additional_fee_amount: 0,
      additional_fee_purpose: null,
      student: {
        full_name: 'Student One',
        email: 'student@example.test',
        payer_email: 'payer@example.test',
        payer_name: 'Parent One',
      },
      org: {
        name: 'Test School',
        email: 'school@example.test',
        features: {},
        stripe_account_id: 'acct_test',
        stripe_onboarding_complete: true,
      },
    },
  };
}

function tableBuilder(table: string) {
  let selected = '';
  let updatePayload: Record<string, unknown> | null = null;
  const builder: any = {
    select(columns: string) {
      selected = columns;
      return builder;
    },
    update(payload: Record<string, unknown>) {
      updatePayload = payload;
      mocks.updateCalls.push({ table, payload });
      return builder;
    },
    in: () => builder,
    order: () => builder,
    eq: () => builder,
    then(resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) {
      let result: any = { data: [], error: null };
      if (table === 'school_payment_installments') {
        if (updatePayload) result = { error: null };
        else if (selected === 'contract_id') result = { data: mocks.countRows, error: null };
        else result = { data: mocks.installments, error: null };
      }
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

describe('school installment reminder capacity behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.installments.length = 0;
    mocks.countRows.length = 0;
    mocks.updateCalls.length = 0;
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test');
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('VERCEL_ENV', '');
    mocks.from.mockImplementation((table: string) => tableBuilder(table));
    mocks.rpc.mockImplementation(async (_name: string, args: { p_bucket: string }) => ({
      data: args.p_bucket === 'due_3d' ? [{ id: 'installment-1' }] : [],
      error: null,
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses bounded queues and marks a reminder only after email delivery succeeds', async () => {
    mocks.installments.push(installment());
    mocks.countRows.push({ contract_id: 'contract-1' });
    const fetchMock = vi.fn(async () => new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = mockRes();
    await handler(mockReq(), response);

    expect(response.getResult()).toMatchObject({
      statusCode: 200,
      body: { sent: 1, candidates: 1, batchSizePerBucket: SCHOOL_REMINDER_BATCH_SIZE },
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
    for (const [, args] of mocks.rpc.mock.calls) {
      expect(args.p_limit).toBe(SCHOOL_REMINDER_BATCH_SIZE);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.updateCalls).toHaveLength(1);
    expect(mocks.updateCalls[0]?.payload).toHaveProperty('reminder_3d_sent_at');
  });

  it('leaves the reminder pending when the email endpoint fails', async () => {
    mocks.installments.push(installment());
    mocks.countRows.push({ contract_id: 'contract-1' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('failed', { status: 503 })));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = mockRes();
    await handler(mockReq(), response);

    expect(response.getResult()).toMatchObject({ statusCode: 200, body: { sent: 0 } });
    expect(mocks.updateCalls).toHaveLength(0);
  });
});
