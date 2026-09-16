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
    sessions: [] as any[],
    updateCalls: [] as Array<Record<string, unknown>>,
    organization: null as { entity_type: string; features: Record<string, unknown> } | null,
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import handler, {
  SESSION_REMINDER_BATCH_SIZE,
  SESSION_REMINDER_EMAIL_ATTEMPT_LIMIT,
} from '../../api/send-reminders';

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

function futureSession(index = 1) {
  const start = new Date(Date.now() + 30 * 60_000);
  return {
    id: `session-${index}`,
    tutor_id: `tutor-${index}`,
    class_group_id: null,
    start_time: start.toISOString(),
    end_time: new Date(start.getTime() + 60 * 60_000).toISOString(),
    topic: 'Capacity test',
    price: 20,
    meeting_link: 'https://example.test/lesson',
    reminder_student_sent: false,
    reminder_tutor_sent: false,
    reminder_payer_sent: false,
    student: {
      id: `student-${index}`,
      full_name: `Student ${index}`,
      email: `student-${index}@example.test`,
      payment_payer: 'student',
      payer_email: null,
      payer_name: null,
      parent_secondary_email: null,
      parent_secondary_name: null,
    },
    tutor: {
      id: `tutor-${index}`,
      full_name: `Tutor ${index}`,
      email: `tutor-${index}@example.test`,
      phone: null,
      reminder_student_hours: 2,
      reminder_tutor_hours: 2,
      organization_id: null,
    },
  };
}

function tableBuilder(table: string) {
  let updatePayload: Record<string, unknown> | null = null;
  const builder: any = {
    select: () => builder,
    update(payload: Record<string, unknown>) {
      updatePayload = payload;
      mocks.updateCalls.push(payload);
      return builder;
    },
    in: () => builder,
    is: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    gte: () => builder,
    lt: () => builder,
    maybeSingle: async () => ({
      data: table === 'organizations' ? mocks.organization : null,
      error: null,
    }),
    then(resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) {
      const result = table === 'sessions' && !updatePayload
        ? { data: mocks.sessions, error: null }
        : { data: null, error: null };
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

function emailResponse(ok: boolean, body?: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body ?? (ok
    ? { success: true, id: 'email-1' }
    : { error: 'failed' })), {
    status: ok ? 200 : 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('session reminder capacity behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessions.length = 0;
    mocks.updateCalls.length = 0;
    mocks.organization = null;
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test');
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('VERCEL_ENV', '');
    mocks.from.mockImplementation((table: string) => tableBuilder(table));
    mocks.rpc.mockImplementation(async () => ({
      data: mocks.sessions.map((session) => ({ id: session.id })),
      error: null,
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('loads only the due queue and marks student and tutor after successful delivery', async () => {
    mocks.sessions.push(futureSession());
    const fetchMock = vi.fn(async () => emailResponse(true));
    vi.stubGlobal('fetch', fetchMock);

    const response = mockRes();
    await handler(mockReq(), response);

    expect(mocks.rpc).toHaveBeenCalledWith('get_due_session_reminder_ids', {
      p_limit: SESSION_REMINDER_BATCH_SIZE,
    });
    expect(response.getResult()).toMatchObject({
      statusCode: 200,
      body: { sent: 2, emailAttempts: 2, sessionBatchSize: SESSION_REMINDER_BATCH_SIZE },
    });
    expect(mocks.updateCalls).toContainEqual({ reminder_student_sent: true });
    expect(mocks.updateCalls).toContainEqual({ reminder_tutor_sent: true });
  });

  it('does not mark a recipient whose email request fails', async () => {
    mocks.sessions.push(futureSession());
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      if (body?.type === 'session_reminder' && body?.data?.isTutor === false) {
        return emailResponse(false);
      }
      return emailResponse(true);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = mockRes();
    await handler(mockReq(), response);

    expect(response.getResult()).toMatchObject({ statusCode: 200, body: { sent: 1, emailAttempts: 2 } });
    expect(mocks.updateCalls).not.toContainEqual({ reminder_student_sent: true });
    expect(mocks.updateCalls).toContainEqual({ reminder_tutor_sent: true });
  });

  it('keeps a school parent reminder pending when contract access skips the email', async () => {
    const session = futureSession();
    Object.assign(session.student as any, {
      email: '',
      payment_payer: 'self',
      payer_email: 'parent@example.test',
      parent_secondary_email: 'other-parent@example.test',
      organization_id: 'school-1',
    });
    (session.tutor as any).organization_id = 'school-1';
    session.reminder_tutor_sent = true;
    mocks.organization = { entity_type: 'school', features: {} };
    mocks.sessions.push(session);

    const fetchMock = vi.fn(async () => emailResponse(true, {
      success: true,
      skipped: true,
      reason: 'school_contract_not_active',
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = mockRes();
    await handler(mockReq(), response);

    const reminderCalls = fetchMock.mock.calls.filter(([, init]) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      return body?.type === 'session_reminder_payer';
    });
    expect(reminderCalls).toHaveLength(2);
    expect(mocks.updateCalls).not.toContainEqual({ reminder_payer_sent: true });
    expect(response.getResult()).toMatchObject({ statusCode: 200, body: { sent: 0, emailAttempts: 2 } });
  });

  it('marks the parent reminder only after every intended recipient is confirmed', async () => {
    const session = futureSession();
    Object.assign(session.student as any, {
      email: '',
      payment_payer: 'self',
      payer_email: 'parent@example.test',
      parent_secondary_email: 'other-parent@example.test',
      organization_id: 'school-1',
    });
    (session.tutor as any).organization_id = 'school-1';
    session.reminder_tutor_sent = true;
    mocks.organization = { entity_type: 'school', features: {} };
    mocks.sessions.push(session);

    let parentAttempt = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      parentAttempt += 1;
      return parentAttempt === 1 ? emailResponse(true) : emailResponse(false);
    }));

    const response = mockRes();
    await handler(mockReq(), response);

    expect(mocks.updateCalls).not.toContainEqual({ reminder_payer_sent: true });
    expect(response.getResult()).toMatchObject({ statusCode: 200, body: { sent: 1, emailAttempts: 2 } });
  });

  it('never exceeds the outbound email attempt limit in one invocation', async () => {
    for (let index = 1; index <= 101; index += 1) mocks.sessions.push(futureSession(index));
    vi.stubGlobal('fetch', vi.fn(async () => emailResponse(true)));

    const response = mockRes();
    await handler(mockReq(), response);

    expect(response.getResult()).toMatchObject({
      statusCode: 200,
      body: {
        emailAttempts: SESSION_REMINDER_EMAIL_ATTEMPT_LIMIT,
        emailAttemptLimit: SESSION_REMINDER_EMAIL_ATTEMPT_LIMIT,
      },
    });
  });

  it('falls back to a direct session scan when the due-queue RPC is missing', async () => {
    mocks.rpc.mockImplementation(async () => ({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.get_due_session_reminder_ids(p_limit) in the schema cache',
      },
    }));
    mocks.sessions.push(futureSession());
    vi.stubGlobal('fetch', vi.fn(async () => emailResponse(true)));

    const response = mockRes();
    await handler(mockReq(), response);

    expect(response.getResult()).toMatchObject({
      statusCode: 200,
      body: { sent: 2, emailAttempts: 2 },
    });
  });

  it('sends one tutor reminder for all student rows in the same tutor time slot', async () => {
    const first = futureSession(1);
    first.reminder_student_sent = true;
    first.reminder_payer_sent = true;
    first.class_group_id = 'group-1';
    first.class_group = { name: 'Matematika 3 klasė' };

    const second = {
      ...futureSession(2),
      start_time: first.start_time,
      end_time: first.end_time,
      tutor_id: first.tutor_id,
      tutor: first.tutor,
      reminder_student_sent: true,
      reminder_payer_sent: true,
      class_group_id: 'group-1',
      class_group: { name: 'Matematika 3 klasė' },
    };
    mocks.sessions.push(first, second);
    const fetchMock = vi.fn(async () => emailResponse(true));
    vi.stubGlobal('fetch', fetchMock);

    const response = mockRes();
    await handler(mockReq(), response);

    const reminderBodies = fetchMock.mock.calls
      .map(([, init]) => JSON.parse(String(init?.body || '{}')))
      .filter((body) => body.type === 'session_reminder');
    expect(reminderBodies).toHaveLength(1);
    expect(reminderBodies[0]).toMatchObject({
      to: 'tutor-1@example.test',
      data: {
        isTutor: true,
        otherName: 'Matematika 3 klasė',
      },
    });
    expect(reminderBodies[0].idempotencyKey).toMatch(/^session-reminder\/[a-f0-9]{64}$/);
    expect(response.getResult()).toMatchObject({ statusCode: 200, body: { sent: 1, emailAttempts: 1 } });
    expect(mocks.updateCalls.filter((call) => call.reminder_tutor_sent === true)).toHaveLength(1);
  });
});
