import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRO_KLASE_ORG_ID } from '../../src/lib/marketMoney';

const mocks = vi.hoisted(() => ({
  tables: {} as Record<string, any[]>,
  quoteError: false,
  writes: [] as Array<{ table: string; operation: string; payload: any }>,
  fetch: vi.fn(),
  from: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ getOrgOwnerUserId: async () => null }));
import handler from '../../api/bill-extra-lessons';

function builder(table: string) {
  const filters: Array<(row: any) => boolean> = [];
  let operation = 'read';
  let payload: any;
  const get = (row: any, path: string) => path.split('.').reduce((value, key) => value?.[key], row);
  const result = () => {
    if (table === 'pooled_package_quotes' && mocks.quoteError) return { data: null, error: { message: 'lookup failed' } };
    if (operation !== 'read') {
      mocks.writes.push({ table, operation, payload });
      return { data: table === 'lesson_packages' && operation === 'insert' ? { id: 'extras-created' } : null, error: null };
    }
    return { data: (mocks.tables[table] || []).filter(row => filters.every(filter => filter(row))), error: null };
  };
  const chain: any = {
    select: () => chain,
    contains: () => chain,
    limit: () => chain,
    gte: () => chain,
    lt: () => chain,
    eq: (key: string, value: any) => { filters.push(row => get(row, key) === value); return chain; },
    neq: (key: string, value: any) => { filters.push(row => get(row, key) !== value); return chain; },
    is: (key: string, value: any) => { filters.push(row => get(row, key) === value); return chain; },
    in: (key: string, values: any[]) => { filters.push(row => values.includes(get(row, key))); return chain; },
    overlaps: (key: string, values: any[]) => { filters.push(row => get(row, key)?.some((id: string) => values.includes(id))); return chain; },
    insert: (value: any) => { operation = 'insert'; payload = value; return chain; },
    update: (value: any) => { operation = 'update'; payload = value; return chain; },
    delete: () => { operation = 'delete'; return chain; },
    maybeSingle: async () => { const value = result(); return { ...value, data: value.data?.[0] || null }; },
    single: async () => result(),
    then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
  };
  return chain;
}

const lesson = (id: string) => ({ id, tutor_id: 'tutor-1', student_id: 'student-1', subject_id: 'math',
  start_time: '2026-09-16T15:00:00Z', status: 'completed', paid: false, payment_status: 'pending',
  lesson_package_id: null, payment_batch_id: null, is_complimentary: false, price: 31,
  subjects: { name: 'Matematika', is_trial: false, is_group: false } });
const quote = (ids: string[], overrides: Record<string, unknown> = {}) => ({ session_ids: ids,
  lesson_packages: { pool_organization_id: PRO_KLASE_ORG_ID, payment_status: 'pending', ...overrides } });
async function run() {
  const output = { status: 0, body: null as any };
  const res: any = { status: (code: number) => { output.status = code; return res; },
    json: (body: any) => { output.body = body; return res; } };
  await handler({ method: 'GET', headers: {}, query: {} } as any, res);
  return output;
}

describe('extras billing respects the persisted monthly offer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-01T03:00:00Z'));
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role');
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('VERCEL_ENV', '');
    mocks.quoteError = false;
    mocks.writes.length = 0;
    mocks.tables = {
      organizations: [{ id: PRO_KLASE_ORG_ID, entity_type: 'company', features: { extra_lessons_billing: true } }],
      profiles: [{ id: 'tutor-1', organization_id: PRO_KLASE_ORG_ID }],
      sessions: [lesson('sept-16'), lesson('sept-23'), lesson('sept-30')],
      students: [{ id: 'student-1', full_name: 'Student', payer_email: 'parent@example.com', grade: '10' }],
      lesson_packages: [],
      pooled_package_quotes: [quote(['sept-16', 'sept-23', 'sept-30'])],
    };
    mocks.from.mockImplementation(builder);
    mocks.fetch.mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mocks.fetch);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('creates no second package, invoice, session links or email for the three offered September lessons', async () => {
    expect(await run()).toMatchObject({ status: 200, body: { billed: 0, skipped: 1, failures: [] } });
    expect(mocks.writes).toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('bills only a genuine extra lesson alongside the quoted lessons', async () => {
    mocks.tables.sessions.push(lesson('extra-lesson'));
    expect(await run()).toMatchObject({ status: 200, body: { billed: 1, skipped: 0 } });
    expect(mocks.writes.find(write => write.table === 'lesson_packages')).toMatchObject({
      payload: { total_lessons: 1, total_price: 31, completed_lessons: 1, paid: false },
    });
    expect(mocks.writes.find(write => write.table === 'lesson_package_items')?.payload[0]).toMatchObject({
      total_lessons: 1, total_price: 31,
    });
    const email = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(email.data).toMatchObject({ totalLessons: 1, totalPrice: '31.00' });
  });
  it.each([
    { payment_status: 'cancelled' },
    { pool_organization_id: 'another-organization' },
  ])('does not use an unrelated or cancelled offer as coverage: %j', async overrides => {
    mocks.tables.pooled_package_quotes = [quote(['sept-16', 'sept-23', 'sept-30'], overrides)];
    expect(await run()).toMatchObject({ status: 200, body: { billed: 1 } });
    expect(mocks.writes.find(write => write.table === 'lesson_packages')?.payload).toMatchObject({ total_lessons: 3, total_price: 93 });
  });
  it('does not charge or send an email when package coverage cannot be checked', async () => {
    mocks.quoteError = true;
    expect(await run()).toMatchObject({ status: 207, body: { billed: 0, success: false,
      failures: [{ error: 'Failed to check monthly package coverage: lookup failed' }] } });
    expect(mocks.writes).toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
