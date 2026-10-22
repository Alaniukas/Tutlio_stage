import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const from = vi.fn();
  const rpc = vi.fn();
  const client = { from, rpc };
  return {
    from,
    rpc,
    client,
    createClient: vi.fn(() => client),
    orderCalls: [] as Array<{ column: string; options: unknown }>,
    limits: [] as number[],
    updates: [] as Array<{ table: string; payload: Record<string, unknown> }>,
    templateEndTime: '10:00',
    templateStartDate: '2026-09-16',
    templateSubjectId: null as string | null,
    pooledPackages: [] as Array<Record<string, any>>,
    legacyPackages: [] as Array<Record<string, any>>,
    existingRows: [] as Array<{ start_time: string; original_start_time: string | null }>,
    sessionReadError: null as null | { message: string },
    inserted: [] as Array<Record<string, any>>,
    occurrenceFilters: [] as string[],
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));

import handler, { MATERIALIZER_BATCH_SIZE } from '../../api/materialize-recurring-sessions';

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

function tableBuilder(table: string) {
  let updatePayload: Record<string, unknown> | null = null;
  let selection = '';
  const builder: any = {
    select: (columns: string) => { selection = columns; return builder; },
    update(payload: Record<string, unknown>) {
      updatePayload = payload;
      mocks.updates.push({ table, payload });
      return builder;
    },
    eq: () => builder,
    is: () => builder,
    lte: () => builder,
    in: () => builder,
    contains: () => builder,
    not: () => builder,
    gte: () => builder,
    lt: () => builder,
    gt: () => builder,
    range: () => builder,
    or(value: string) { mocks.occurrenceFilters.push(value); return builder; },
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    insert: (rows: Array<Record<string, any>>) => {
      if (table === 'sessions') mocks.inserted.push(...rows);
      return Promise.resolve({ error: null });
    },
    order(column: string, options: unknown) {
      mocks.orderCalls.push({ column, options });
      return builder;
    },
    limit(value: number) {
      mocks.limits.push(value);
      return builder;
    },
    then(resolve: (value: any) => unknown, reject: (reason: unknown) => unknown) {
      let result: any = { data: [], error: null };
      if (table === 'recurring_individual_sessions' && !updatePayload) {
        result = {
          data: [{
            id: 'template-1',
            tutor_id: 'tutor-1',
            student_id: 'student-1',
            subject_id: mocks.templateSubjectId,
            start_date: mocks.templateStartDate,
            end_date: null,
            start_time: mocks.templateEndTime === '10:00' ? '10:00' : '18:00',
            end_time: mocks.templateEndTime,
            frequency: 'weekly',
            meeting_link: null,
            topic: null,
            price: 20,
            last_materialized_at: null,
          }],
          error: null,
        };
      } else if (table === 'students') {
        result = {
          data: [{ id: 'student-1', payment_model: 'per_lesson', detached_at: null }],
          error: null,
        };
      } else if (table === 'sessions' && selection === 'start_time, original_start_time') {
        result = { data: mocks.existingRows, error: mocks.sessionReadError };
      } else if (table === 'lesson_packages' && !updatePayload) {
        result = { data: mocks.legacyPackages, error: null };
      } else if (updatePayload) {
        result = { error: null };
      }
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return builder;
}

describe('recurring materializer capacity behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.orderCalls.length = 0;
    mocks.limits.length = 0;
    mocks.updates.length = 0;
    mocks.templateEndTime = '10:00';
    mocks.templateStartDate = '2026-09-16';
    mocks.templateSubjectId = null;
    mocks.pooledPackages = [];
    mocks.legacyPackages = [];
    mocks.rpc.mockImplementation(async () => ({ data: mocks.pooledPackages, error: null }));
    mocks.existingRows = [];
    mocks.sessionReadError = null;
    mocks.inserted.length = 0;
    mocks.occurrenceFilters.length = 0;
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test');
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('VERCEL_ENV', '');
    mocks.from.mockImplementation((table: string) => tableBuilder(table));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('uses the fair bounded cursor and advances past an invalid template', async () => {
    const response = mockRes();
    await handler(mockReq(), response);

    expect(mocks.orderCalls).toEqual([
      { column: 'last_materialized_at', options: { ascending: true, nullsFirst: true } },
      { column: 'id', options: { ascending: true } },
    ]);
    expect(mocks.limits).toContain(MATERIALIZER_BATCH_SIZE);
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]?.payload.last_materialized_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(response.getResult()).toMatchObject({
      statusCode: 200,
      body: {
        success: true,
        created: 0,
        skipped: 1,
        templates: 1,
        batchSize: MATERIALIZER_BATCH_SIZE,
        cursorUpdated: true,
      },
    });
  });

  it.each(['2026-10-09T11:00:00Z', '2026-12-10T11:00:00Z'])(
    'does not recreate the original occurrence when its lesson was moved to %s', async movedStart => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-06T10:00:00Z'));
      mocks.templateEndTime = '19:00';
      mocks.existingRows = [{ start_time: movedStart, original_start_time: '2026-10-07T15:00:00+00:00' }];
      const response = mockRes();
      await handler(mockReq(), response);
      expect(response.getResult().statusCode).toBe(200);
      expect(mocks.inserted.length).toBeGreaterThan(0);
      expect(mocks.inserted.map(row => row.start_time)).not.toContain('2026-10-07T15:00:00.000Z');
      expect(mocks.inserted.map(row => row.start_time)).toContain('2026-10-14T15:00:00.000Z');
      expect(mocks.occurrenceFilters[0]).toContain('original_start_time.gte.2026-10-07T15:00:00.000Z');
    },
  );

  it('stops instead of creating lessons when the occurrence lookup fails', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T10:00:00Z'));
    mocks.templateEndTime = '19:00';
    mocks.sessionReadError = { message: 'database unavailable' };
    const response = mockRes();
    await handler(mockReq(), response);
    expect(response.getResult().statusCode).toBe(500);
    expect(mocks.inserted).toEqual([]);
  });

  const octoberPool = {
    id: 'october-pool', tutor_id: 'other-tutor', student_id: 'sibling-row',
    pool_organization_id: 'org', total_lessons: 9, available_lessons: 1,
    reserved_lessons: 3, completed_lessons: 5,
    expires_at: '2026-11-01T00:00:00Z',
    billing_period_start: '2026-10-01', billing_period_end: '2026-10-31',
  };

  function withSubject(startDate = '2026-10-23') {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T10:00:00Z'));
    mocks.templateEndTime = '19:00';
    mocks.templateStartDate = startDate;
    mocks.templateSubjectId = 'subject-1';
  }

  it('does not attach an unused October credit when only a December occurrence is missing', async () => {
    withSubject('2026-10-13');
    mocks.pooledPackages = [octoberPool];
    mocks.existingRows = ['2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24', '2026-12-01', '2026-12-08']
      .map(date => ({ start_time: `${date}T16:00:00Z`, original_start_time: null }));
    const response = mockRes();
    await handler(mockReq(), response);
    expect(response.getResult().body.created).toBe(1);
    expect(mocks.inserted).toEqual([expect.objectContaining({
      start_time: '2026-12-15T16:00:00.000Z', paid: false, lesson_package_id: null,
    })]);
    expect(mocks.updates.filter(x => ['lesson_packages', 'lesson_package_items'].includes(x.table))).toEqual([]);
  });

  it('uses each month\'s paid balance once and leaves later lessons unpaid after credits run out', async () => {
    withSubject();
    mocks.pooledPackages = [octoberPool, {
      ...octoberPool, id: 'november-pool', total_lessons: 2, available_lessons: 2,
      reserved_lessons: 0, completed_lessons: 0,
      billing_period_start: '2026-11-01', billing_period_end: '2026-11-30',
      expires_at: '2026-12-01T00:00:00Z',
    }];
    const response = mockRes();
    await handler(mockReq(), response);
    expect(response.getResult().statusCode).toBe(200);
    expect(mocks.inserted.filter(row => row.lesson_package_id === 'october-pool').map(row => row.start_time))
      .toEqual(['2026-10-23T15:00:00.000Z']);
    expect(mocks.inserted.filter(row => row.lesson_package_id === 'november-pool').map(row => row.start_time))
      .toEqual(['2026-11-06T16:00:00.000Z', '2026-11-13T16:00:00.000Z']);
    expect(mocks.inserted.filter(row => !row.lesson_package_id).every(row => row.paid === false)).toBe(true);
    expect(mocks.inserted.find(row => row.start_time === '2026-10-30T16:00:00.000Z')?.paid).toBe(false);
    // SQL owns pooled counters; the synthetic compatibility item is never written.
    expect(mocks.updates.filter(x => ['lesson_packages', 'lesson_package_items'].includes(x.table))).toEqual([]);
    expect(mocks.rpc).toHaveBeenCalledTimes(3); // One lookup per month with missing lessons.
  });

  it('reserves legacy item and parent counters exactly once across the rolling window', async () => {
    withSubject();
    mocks.legacyPackages = [{
      id: 'legacy', tutor_id: 'tutor-1', student_id: 'student-1', subject_id: 'subject-1',
      total_lessons: 5, available_lessons: 3, reserved_lessons: 2, completed_lessons: 0,
      expires_at: null, lesson_package_items: [{
        id: 'legacy-item', subject_id: 'subject-1', total_lessons: 3,
        available_lessons: 2, reserved_lessons: 1, completed_lessons: 0,
      }],
    }];
    const response = mockRes();
    await handler(mockReq(), response);
    expect(mocks.inserted.filter(row => row.lesson_package_id === 'legacy')).toHaveLength(2);
    expect(mocks.updates.filter(x => x.table === 'lesson_package_items')).toEqual([
      { table: 'lesson_package_items', payload: { available_lessons: 0, reserved_lessons: 3 } },
    ]);
    expect(mocks.updates.filter(x => x.table === 'lesson_packages')).toEqual([
      { table: 'lesson_packages', payload: { available_lessons: 1, reserved_lessons: 4 } },
    ]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
