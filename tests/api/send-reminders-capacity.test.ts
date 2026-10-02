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
    parentLinks: [] as Array<{ student_id: string; parent_id: string }>,
    parentProfiles: [] as Array<{ id: string; email: string; full_name: string; disable_lesson_reminders: boolean }>,
    emailOptOuts: [] as Array<{ email: string }>,
    lookupErrors: {} as Record<string, { message: string }>,
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
  const filters: Array<(row: any) => boolean> = [];
  const orderColumns: string[] = [];
  let emailLookup = false;
  const builder: any = {
    select: () => builder,
    update(payload: Record<string, unknown>) {
      updatePayload = payload;
      mocks.updateCalls.push(payload);
      return builder;
    },
    in(column: string, values: unknown[]) {
      if (column === 'email') emailLookup = true;
      filters.push(row => values.includes(row[column]));
      return builder;
    },
    is: () => builder,
    eq(column: string, value: unknown) {
      filters.push(row => row[column] === value);
      return builder;
    },
    order(column: string) {
      orderColumns.push(column);
      return builder;
    },
    limit: () => builder,
    gte: () => builder,
    lt: () => builder,
    maybeSingle: async () => ({
      data: table === 'organizations' ? mocks.organization : null,
      error: null,
    }),
    then(resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) {
      const error = mocks.lookupErrors[emailLookup && table === 'parent_profiles' ? 'parent_profiles_email' : table];
      const rows = table === 'parent_students' ? mocks.parentLinks
        : table === 'parent_profiles' ? mocks.parentProfiles
          : table === 'email_reminder_opt_outs' ? mocks.emailOptOuts
            : null;
      const filteredRows = rows?.filter(row => filters.every(filter => filter(row))).sort((left, right) => {
        for (const column of orderColumns) {
          const comparison = String((left as any)[column]).localeCompare(String((right as any)[column]));
          if (comparison) return comparison;
        }
        return 0;
      });
      const result = error ? { data: null, error }
        : table === 'sessions' && !updatePayload ? { data: mocks.sessions, error: null }
          : { data: filteredRows ?? null, error: null };
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

function registeredParentOnlySchoolSession() {
  const session = futureSession();
  Object.assign(session.student, { email: '', organization_id: 'school-1' });
  session.tutor.organization_id = 'school-1';
  session.reminder_tutor_sent = true;
  mocks.organization = { entity_type: 'school', features: { school_compact_notifications: true, flexible_invitations: true } };
  mocks.sessions.push(session);
  mocks.parentLinks.push(
    { student_id: session.student.id, parent_id: 'parent-b' },
    { student_id: session.student.id, parent_id: 'parent-a' },
    { student_id: 'another-student', parent_id: 'parent-0' },
  );
  mocks.parentProfiles.push(
    { id: 'parent-b', email: 'second@example.test', full_name: 'Second Parent', disable_lesson_reminders: false },
    { id: 'parent-a', email: 'first@example.test', full_name: 'First Parent', disable_lesson_reminders: false },
    { id: 'parent-0', email: 'unrelated@example.test', full_name: 'Unrelated Parent', disable_lesson_reminders: false },
  );
  return session;
}

function reminderRequestBodies(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls
    .filter(([url]) => String(url).endsWith('/api/send-email'))
    .map(([, init]) => JSON.parse(String(init?.body || '{}')));
}

describe('session reminder capacity behavior', () => {
  it.each(['configured','payer','in_person','tutor_link','student_link','subject_link','disabled','too_early'])('preserves configured reminders with material digests for %s', async mode => {
    const session = futureSession();
    Object.assign(session.student, { organization_id: 'school-1', payer_email: 'payer@example.test', parent_secondary_email: 'second@example.test' });
    session.tutor.organization_id = 'school-1';
    const start = Date.now() + (mode === 'too_early' ? 180 : 90) * 60_000;
    session.start_time = new Date(start).toISOString();
    session.end_time = new Date(start + 60 * 60_000).toISOString();
    if (mode === 'payer') session.student.email = '';
    if (['in_person','tutor_link','student_link','subject_link'].includes(mode)) session.meeting_link = '';
    if (mode === 'tutor_link') Object.assign(session.tutor, { personal_meeting_link: 'https://meet.google.com/teacher-room' });
    if (mode === 'student_link') Object.assign(session.student, { personal_meeting_link: 'https://meet.google.com/student-room' });
    if (mode === 'subject_link') Object.assign(session, { subjects: { meeting_link: 'https://meet.google.com/subject-room' } });
    if (mode === 'disabled') Object.assign(session.tutor, { reminder_student_hours: 0, reminder_tutor_hours: 0 });
    mocks.organization = { entity_type: 'school', features: { school_join_and_material_notifications: true } };
    mocks.sessions.push(session);
    const fetchMock = vi.fn(async () => emailResponse(true));
    vi.stubGlobal('fetch', fetchMock);
    await handler(mockReq(), mockRes());
    const reminders = reminderRequestBodies(fetchMock);
    const expectedRecipients = mode === 'disabled' || mode === 'too_early' ? []
      : [...(mode === 'payer' ? [] : [session.student.email]), 'payer@example.test', 'second@example.test', session.tutor.email];
    expect(reminders.map(body => body.to)).toEqual(expectedRecipients);
    expect(reminders.every(body => body.data.schoolJoinOnly !== true)).toBe(true);
    const teacherReminder = reminders.find(body => body.data.isTutor === true);
    if (expectedRecipients.length) {
      expect(teacherReminder).toBeDefined();
      const expectedLink = mode === 'tutor_link' ? 'https://meet.google.com/teacher-room'
        : mode === 'student_link' ? 'https://meet.google.com/student-room'
          : mode === 'subject_link' ? 'https://meet.google.com/subject-room'
            : mode === 'in_person' ? null : session.meeting_link;
      expect(reminders.every(body => body.data.meetingLink === expectedLink)).toBe(true);
    }
  });
  it('keeps separate teacher and student reminder timing when material digests are enabled', async () => {
    const session = futureSession();
    Object.assign(session.student, { organization_id: 'school-1' });
    Object.assign(session.tutor, { organization_id: 'school-1', reminder_student_hours: 0.25, reminder_tutor_hours: 2 });
    mocks.organization = { entity_type: 'school', features: { school_join_and_material_notifications: true } };
    mocks.sessions.push(session);
    const fetchMock = vi.fn(async () => emailResponse(true));
    vi.stubGlobal('fetch', fetchMock);
    await handler(mockReq(), mockRes());
    expect(reminderRequestBodies(fetchMock).map(body => body.to)).toEqual([session.tutor.email]);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessions.length = 0;
    mocks.updateCalls.length = 0;
    mocks.parentLinks.length = 0;
    mocks.parentProfiles.length = 0;
    mocks.emailOptOuts.length = 0;
    mocks.lookupErrors = {};
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

  it('routes one compact school join email only to the child, even with flexible parent invitations', async () => {
    const session = futureSession();
    Object.assign(session.student, { organization_id: 'school-1', payer_email: 'payer@example.test', parent_secondary_email: 'second@example.test' });
    session.tutor.organization_id = 'school-1';
    session.reminder_tutor_sent = true;
    mocks.organization = { entity_type: 'school', features: { school_compact_notifications: true, flexible_invitations: true } };
    mocks.sessions.push(session);
    const fetchMock = vi.fn(async () => emailResponse(true));
    vi.stubGlobal('fetch', fetchMock);
    await handler(mockReq(), mockRes());
    const reminders = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body || '{}'))).filter(body => String(body.type || '').startsWith('session_reminder'));
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ to: session.student.email, data: { schoolFlow: true, schoolJoinOnly: true } });
    expect(mocks.updateCalls).toContainEqual({ reminder_payer_sent: true });
  });

  it('uses one parent fallback when a compact-school child has no email', async () => {
    const session = futureSession();
    Object.assign(session.student, { email: '', organization_id: 'school-1', payer_email: 'payer@example.test', parent_secondary_email: 'second@example.test' });
    session.tutor.organization_id = 'school-1';
    session.reminder_tutor_sent = true;
    mocks.organization = { entity_type: 'school', features: { school_compact_notifications: true } };
    mocks.sessions.push(session);
    const fetchMock = vi.fn(async () => emailResponse(true));
    vi.stubGlobal('fetch', fetchMock);
    await handler(mockReq(), mockRes());
    const reminders = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body || '{}'))).filter(body => String(body.type || '').startsWith('session_reminder'));
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toMatchObject({ type: 'session_reminder_payer', to: 'payer@example.test', data: { schoolJoinOnly: true } });
  });

  it('chooses exactly one linked registered parent in stable order when student contacts are empty', async () => {
    registeredParentOnlySchoolSession();
    const fetchMock = vi.fn(async () => emailResponse(true));
    vi.stubGlobal('fetch', fetchMock);

    const response = mockRes();
    await handler(mockReq(), response);

    expect(reminderRequestBodies(fetchMock)).toMatchObject([{
      type: 'session_reminder_payer',
      to: 'first@example.test',
      data: { recipientName: 'First Parent', schoolJoinOnly: true },
    }]);
    expect(reminderRequestBodies(fetchMock)).toHaveLength(1);
    expect(mocks.updateCalls).toContainEqual({ reminder_payer_sent: true });
    expect(response.getResult()).toMatchObject({ statusCode: 200, body: { sent: 1, emailAttempts: 1 } });
  });

  it('skips an opted-out linked parent and selects one enabled parent', async () => {
    registeredParentOnlySchoolSession();
    mocks.parentProfiles.find(parent => parent.id === 'parent-a')!.disable_lesson_reminders = true;
    const fetchMock = vi.fn(async () => emailResponse(true));
    vi.stubGlobal('fetch', fetchMock);

    await handler(mockReq(), mockRes());

    expect(reminderRequestBodies(fetchMock)).toHaveLength(1);
    expect(reminderRequestBodies(fetchMock)[0]).toMatchObject({ to: 'second@example.test' });
    expect(mocks.updateCalls).toContainEqual({ reminder_payer_sent: true });
  });

  it('handles confirmed opt-outs for all linked parents without sending a compact reminder', async () => {
    registeredParentOnlySchoolSession();
    for (const parent of mocks.parentProfiles) parent.disable_lesson_reminders = true;
    const fetchMock = vi.fn(async () => emailResponse(true));
    vi.stubGlobal('fetch', fetchMock);

    await handler(mockReq(), mockRes());

    expect(reminderRequestBodies(fetchMock)).toEqual([]);
    expect(mocks.updateCalls).toContainEqual({ reminder_payer_sent: true });
  });

  it('honors the selected registered parent email opt-out without sending a second copy', async () => {
    registeredParentOnlySchoolSession();
    mocks.emailOptOuts.push({ email: 'first@example.test' });
    const fetchMock = vi.fn(async () => emailResponse(true));
    vi.stubGlobal('fetch', fetchMock);

    await handler(mockReq(), mockRes());

    expect(reminderRequestBodies(fetchMock)).toEqual([]);
    expect(mocks.updateCalls).toContainEqual({ reminder_payer_sent: true });
  });

  it.each(['parent_students', 'parent_profiles', 'parent_profiles_email', 'email_reminder_opt_outs'])(
    'keeps a registered-parent compact reminder pending when %s lookup fails, then retries',
    async (table) => {
      registeredParentOnlySchoolSession();
      mocks.lookupErrors[table] = { message: 'Temporary lookup failure' };
      const fetchMock = vi.fn(async () => emailResponse(true));
      vi.stubGlobal('fetch', fetchMock);

      await handler(mockReq(), mockRes());

      expect(reminderRequestBodies(fetchMock)).toEqual([]);
      expect(mocks.updateCalls).not.toContainEqual({ reminder_payer_sent: true });

      delete mocks.lookupErrors[table];
      await handler(mockReq(), mockRes());

      expect(reminderRequestBodies(fetchMock)).toHaveLength(1);
      expect(reminderRequestBodies(fetchMock)[0]).toMatchObject({ to: 'first@example.test' });
      expect(mocks.updateCalls).toContainEqual({ reminder_payer_sent: true });
    },
  );

  it.each([false, undefined])('preserves all flexible registered-parent recipients with compact flag %s', async (compactFlag) => {
    registeredParentOnlySchoolSession();
    mocks.organization!.features = {
      flexible_invitations: true,
      ...(compactFlag === undefined ? {} : { school_compact_notifications: compactFlag }),
    };
    const fetchMock = vi.fn(async () => emailResponse(true));
    vi.stubGlobal('fetch', fetchMock);

    await handler(mockReq(), mockRes());

    const reminders = reminderRequestBodies(fetchMock);
    expect(reminders.map(body => body.to).sort()).toEqual(['first@example.test', 'second@example.test']);
    expect(reminders.every(body => body.data.schoolJoinOnly === undefined)).toBe(true);
  });

  it('keeps the child join email retryable without falling back to a parent after delivery failure', async () => {
    const session = futureSession();
    Object.assign(session.student, { organization_id: 'school-1', payer_email: 'payer@example.test' });
    session.tutor.organization_id = 'school-1';
    session.reminder_tutor_sent = true;
    mocks.organization = { entity_type: 'school', features: { school_compact_notifications: true } };
    mocks.sessions.push(session);
    const fetchMock = vi.fn(async () => emailResponse(false));
    vi.stubGlobal('fetch', fetchMock);
    await handler(mockReq(), mockRes());
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/send-email'))).toHaveLength(1);
    expect(mocks.updateCalls).not.toContainEqual({ reminder_student_sent: true });
  });

  it('keeps compact-school invitations pending until a join link is available', async () => {
    const session = futureSession();
    Object.assign(session.student, { organization_id: 'school-1', payer_email: 'payer@example.test' });
    session.tutor.organization_id = 'school-1';
    session.meeting_link = '';
    session.reminder_tutor_sent = true;
    mocks.organization = { entity_type: 'school', features: { school_compact_notifications: true } };
    mocks.sessions.push(session);
    const fetchMock = vi.fn(async () => emailResponse(true));
    vi.stubGlobal('fetch', fetchMock);
    await handler(mockReq(), mockRes());
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/send-email'))).toHaveLength(0);
    expect(mocks.updateCalls).toEqual([]);
  });

  it('adds the school homework and recordings links to the student reminder', async () => {
    const session = futureSession();
    session.student.organization_id = 'school-1';
    session.tutor.organization_id = 'school-1';
    session.reminder_tutor_sent = true;
    mocks.organization = {
      entity_type: 'school',
      features: { school_lesson_recordings: true },
    };
    mocks.sessions.push(session);
    const fetchMock = vi.fn(async () => emailResponse(true));
    vi.stubGlobal('fetch', fetchMock);

    const response = mockRes();
    await handler(mockReq(), response);

    const studentReminder = fetchMock.mock.calls
      .map(([, init]) => JSON.parse(String(init?.body || '{}')))
      .find((body) => body.type === 'session_reminder' && body.data?.isTutor === false);
    expect(studentReminder?.data).toMatchObject({
      organizationId: 'school-1',
      schoolFlow: true,
    });
    expect(studentReminder?.data?.homeworkUrl).toMatch(
      /^https:\/\/tutlio\.lt\/school-homework\?student=student-1&t=[a-f0-9]{40}$/,
    );
    expect(studentReminder?.data?.recordingsUrl).toBe(`${studentReminder.data.homeworkUrl}#recordings`);
    expect(response.getResult()).toMatchObject({ statusCode: 200, body: { sent: 1 } });
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
    for (let index = 1; index <= SESSION_REMINDER_EMAIL_ATTEMPT_LIMIT + 1; index += 1) {
      mocks.sessions.push(futureSession(index));
    }
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

  it('marks every school parent reminder in the same class-group slot', async () => {
    const start = futureSession(1).start_time;
    const end = futureSession(1).end_time;
    const tutor = futureSession(1).tutor;
    for (let index = 1; index <= 4; index += 1) {
      mocks.sessions.push({
        ...futureSession(index),
        start_time: start,
        end_time: end,
        tutor,
        tutor_id: tutor.id,
        class_group_id: 'group-math',
        class_group: { name: 'Matematika 7 klasė' },
        reminder_tutor_sent: true,
        student: {
          id: `student-${index}`,
          full_name: `Student ${index}`,
          email: '',
          payment_payer: 'self',
          payer_email: `parent-${index}@example.test`,
          payer_name: `Parent ${index}`,
          parent_secondary_email: null,
          parent_secondary_name: null,
          organization_id: 'school-1',
        },
      });
    }
    mocks.organization = { entity_type: 'school', features: {} };
    vi.stubGlobal('fetch', vi.fn(async () => emailResponse(true)));

    const response = mockRes();
    await handler(mockReq(), response);

    expect(mocks.updateCalls.filter((call) => call.reminder_payer_sent === true)).toHaveLength(4);
    expect(response.getResult()).toMatchObject({ statusCode: 200, body: { sent: 4, emailAttempts: 4 } });
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
