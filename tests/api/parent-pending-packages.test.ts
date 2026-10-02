import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PARENT_USER = '10000000-0000-4000-8000-000000000001';
const PARENT_PROFILE = '20000000-0000-4000-8000-000000000001';
const CHILD = '30000000-0000-4000-8000-000000000001';
const SIBLING = '30000000-0000-4000-8000-000000000002';
const OTHER_CHILD = '30000000-0000-4000-8000-000000000003';
const ORGANIZATION = '40000000-0000-4000-8000-000000000001';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  createClient: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  tables: {} as Record<string, any[]>,
  errors: {} as Record<string, { message: string }>,
  liveIds: [] as string[],
  liveIdResults: [] as string[][],
  rpcError: null as { message: string } | null,
  calls: [] as Array<{ table: string; method: string; args: any[] }>,
  onPackagesRead: null as (() => void) | null,
}));

vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: mocks.auth }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
import handler from '../../api/parent-pending-packages';

function packageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'package-1', student_id: CHILD, total_lessons: '8', total_price: '240.00',
    payment_method: 'stripe', pool_organization_id: ORGANIZATION, active: true,
    expires_at: '2099-10-01T00:00:00.000Z', created_at: '2026-09-30T10:00:00.000Z',
    payment_status: 'pending', paid: false,
    lesson_package_items: [{ subjects: { name: 'Matematika' } }, { subjects: [{ name: 'Anglų kalba' }] }],
    ...overrides,
  };
}

function request(query: Record<string, unknown> = {}, method = 'GET') {
  return { method, query, headers: { authorization: 'Bearer verified-parent-token' } } as any;
}

function response() {
  const result = { statusCode: 0, body: null as any };
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn((statusCode: number) => { result.statusCode = statusCode; return res; }),
    json: vi.fn((body: unknown) => { result.body = body; return res; }),
  };
  return { res, result };
}

async function run(query: Record<string, unknown> = {}, method = 'GET') {
  const output = response();
  await handler(request(query, method), output.res);
  return output;
}

describe('GET /api/parent-pending-packages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://test.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
    vi.stubEnv('SUPABASE_ANON_KEY', 'test-public-key');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-vite-public-key');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.auth.mockResolvedValue({ userId: PARENT_USER, isInternal: false });
    mocks.errors = {};
    mocks.rpcError = null;
    mocks.liveIds = [CHILD, SIBLING];
    mocks.liveIdResults = [];
    mocks.calls = [];
    mocks.onPackagesRead = null;
    mocks.tables = {
      parent_profiles: [{ id: PARENT_PROFILE, user_id: PARENT_USER }],
      parent_students: [{ parent_id: PARENT_PROFILE, student_id: CHILD }, { parent_id: PARENT_PROFILE, student_id: SIBLING }],
      students: [
        { id: CHILD, full_name: 'Pirmas vaikas', organization_id: ORGANIZATION, email: 'shared@example.com' },
        { id: SIBLING, full_name: 'Antras vaikas', organization_id: ORGANIZATION },
        { id: OTHER_CHILD, full_name: 'Pirmas vaikas', organization_id: ORGANIZATION, email: 'shared@example.com', payer_email: 'parent@example.com' },
      ],
      lesson_packages: [packageRow()],
    };
    mocks.from.mockImplementation((table: string) => {
      const filters: Array<(row: any) => boolean> = [];
      let single = false;
      let maxRows: number | null = null;
      const orders: Array<[string, boolean]> = [];
      let range: [number, number] | null = null;
      const chain: any = new Proxy({}, {
        get: (_target, method: string) => {
          if (method === 'then') return (resolve: (value: unknown) => void) => {
            let rows = (mocks.tables[table] || []).filter((row) => filters.every((filter) => filter(row)));
            if (orders.length) {
              rows = [...rows].sort((a, b) => {
                for (const [column, ascending] of orders) {
                  const comparison = String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1);
                  if (comparison) return comparison;
                }
                return 0;
              });
            }
            if (range) rows = rows.slice(range[0], range[1] + 1);
            if (maxRows !== null) rows = rows.slice(0, maxRows);
            if (table === 'lesson_packages') mocks.onPackagesRead?.();
            return resolve({ data: mocks.errors[table] ? null : single ? rows[0] || null : rows, error: mocks.errors[table] || null });
          };
          return (...args: any[]) => {
            mocks.calls.push({ table, method, args });
            if (method === 'eq') filters.push((row) => row[args[0]] === args[1]);
            if (method === 'in') filters.push((row) => args[1].includes(row[args[0]]));
            if (method === 'maybeSingle') single = true;
            if (method === 'limit') maxRows = args[0];
            if (method === 'order') orders.push([args[0], args[1]?.ascending !== false]);
            if (method === 'range') range = [args[0], args[1]];
            return chain;
          };
        },
      });
      return chain;
    });
    mocks.rpc.mockImplementation(() => {
      const ids = mocks.liveIdResults.length ? mocks.liveIdResults.shift()! : mocks.liveIds;
      return {
        range: (start: number, end: number) => Promise.resolve({
          data: mocks.rpcError ? null : ids.slice(start, end + 1).map((student_id) => ({ student_id })),
          error: mocks.rpcError,
        }),
      };
    });
    mocks.createClient.mockImplementation((_url: string, key: string) => key === 'test-service-key'
      ? { from: mocks.from }
      : { rpc: mocks.rpc });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns pooled and ordinary unpaid offers for exactly the linked children', async () => {
    mocks.tables.lesson_packages.push(packageRow({ id: 'ordinary', student_id: SIBLING, pool_organization_id: null, active: false }));
    const { result, res } = await run();
    expect(result).toEqual({ statusCode: 200, body: { packages: [
      { id: 'package-1', totalLessons: 8, totalPrice: 240, paymentMethod: 'stripe', studentName: 'Pirmas vaikas', subjects: 'Matematika, Anglų kalba' },
      { id: 'ordinary', totalLessons: 8, totalPrice: 240, paymentMethod: 'stripe', studentName: 'Antras vaikas', subjects: 'Matematika, Anglų kalba' },
    ] } });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(mocks.createClient).toHaveBeenCalledWith('https://test.supabase.co', 'test-public-key', expect.objectContaining({
      global: { headers: { Authorization: 'Bearer verified-parent-token' } },
    }));
    expect(mocks.rpc).toHaveBeenCalledWith('get_parent_child_ids', { p_user_id: PARENT_USER });
  });

  it.each(['student', 'parent'])('returns the linked child package when the designated payer is %s', async (payer) => {
    mocks.tables.students[0].payment_payer = payer;
    mocks.tables.students[0].payer_email = 'someone-else@example.com';
    const { result } = await run();
    expect(result.statusCode).toBe(200);
    expect(result.body.packages.map((pkg: any) => pkg.id)).toEqual(['package-1']);
  });

  it.each([null, { userId: null, isInternal: true }, { userId: PARENT_USER, isInternal: true }])(
    'rejects unauthenticated and internal callers (%j)', async (auth) => {
      mocks.auth.mockResolvedValue(auth);
      const { result } = await run();
      expect(result.statusCode).toBe(401);
      expect(mocks.from).not.toHaveBeenCalled();
    },
  );

  it('requires a parent profile tied to the verified user', async () => {
    mocks.tables.parent_profiles[0].user_id = 'another-user';
    const { result } = await run();
    expect(result.statusCode).toBe(403);
    expect(mocks.from).not.toHaveBeenCalledWith('lesson_packages');
  });

  it.each(['not-a-uuid', '', [CHILD, SIBLING]])('rejects malformed or repeated studentId (%j)', async (studentId) => {
    const { result } = await run({ studentId });
    expect(result.statusCode).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects an unlinked requested student even if the live RPC includes it', async () => {
    mocks.liveIds.push(OTHER_CHILD);
    const { result } = await run({ studentId: OTHER_CHILD });
    expect(result.statusCode).toBe(403);
    expect(mocks.from).not.toHaveBeenCalledWith('lesson_packages');
  });

  it('limits an allowed student filter to that child', async () => {
    mocks.tables.lesson_packages.push(packageRow({ id: 'sibling-package', student_id: SIBLING }));
    const { result } = await run({ studentId: ` ${CHILD.toUpperCase()} ` });
    expect(result.body.packages.map((row: any) => row.id)).toEqual(['package-1']);
  });

  it('does not expand family access by child name, email, payer address or direct parent_user_id', async () => {
    mocks.tables.students[2].parent_user_id = PARENT_USER;
    mocks.liveIds.push(OTHER_CHILD);
    mocks.tables.parent_students.push({ parent_id: 'another-parent', student_id: OTHER_CHILD });
    mocks.tables.lesson_packages.push(packageRow({ id: 'foreign-package', student_id: OTHER_CHILD }));
    const { result } = await run();
    expect(result.body.packages.map((row: any) => row.id)).toEqual(['package-1']);
  });

  it('intersects canonical child links with live school guardian authorization', async () => {
    mocks.liveIds = [SIBLING];
    const { result } = await run();
    expect(result).toEqual({ statusCode: 200, body: { packages: [] } });
    const scopedQuery = mocks.calls.find((call) => call.table === 'lesson_packages' && call.method === 'in');
    expect(scopedQuery?.args).toEqual(['student_id', [SIBLING]]);
    const filtered = await run({ studentId: CHILD });
    expect(filtered.result.statusCode).toBe(403);
  });

  it('returns an empty list without querying packages when there are no linked children', async () => {
    mocks.tables.parent_students = [];
    const { result } = await run();
    expect(result).toEqual({ statusCode: 200, body: { packages: [] } });
    expect(mocks.from).not.toHaveBeenCalledWith('lesson_packages');
  });

  it('excludes a pool whose organization does not match its linked child', async () => {
    mocks.tables.lesson_packages.push(packageRow({ id: 'wrong-org', pool_organization_id: 'other-organization' }));
    const { result } = await run();
    expect(result.body.packages.map((row: any) => row.id)).toEqual(['package-1']);
  });

  it('excludes paid and cancelled offers and inactive or expired pools', async () => {
    mocks.tables.lesson_packages.push(
      packageRow({ id: 'paid', paid: true }),
      packageRow({ id: 'cancelled', payment_status: 'cancelled' }),
      packageRow({ id: 'inactive-pool', active: false }),
      packageRow({ id: 'expired-pool', expires_at: '2000-01-01T00:00:00.000Z' }),
    );
    const { result } = await run();
    expect(result.body.packages.map((row: any) => row.id)).toEqual(['package-1']);
  });

  it('hides detached pooled anchors while preserving ordinary linked-child debt', async () => {
    mocks.tables.students[0].detached_at = '2026-09-30T00:00:00.000Z';
    mocks.tables.lesson_packages.push(packageRow({ id: 'ordinary-debt', pool_organization_id: null, active: false }));
    const { result } = await run();
    expect(result.body.packages.map((row: any) => row.id)).toEqual(['ordinary-debt']);
  });

  it('returns only the six safe display fields and never selects checkout or pool secrets', async () => {
    Object.assign(mocks.tables.lesson_packages[0], {
      stripe_checkout_session_id: 'private-checkout', pool_identity_key: 'private-identity',
      pool_preview_token: 'private-token', pool_session_ids: ['private-session'],
      pooled_package_quotes: [{ preview_token: 'private-token', session_ids: ['private-session'] }],
    });
    const { result } = await run();
    expect(Object.keys(result.body.packages[0]).sort()).toEqual([
      'id', 'paymentMethod', 'studentName', 'subjects', 'totalLessons', 'totalPrice',
    ]);
    expect(JSON.stringify(result.body)).not.toContain('private-');
    const columns = mocks.calls.find((call) => call.table === 'lesson_packages' && call.method === 'select')?.args[0];
    expect(columns).not.toMatch(/\*|stripe_checkout|pool_identity|preview_token|session_ids|pooled_package_quotes/);
  });

  it('keeps null price, payment method, student name and missing subjects safe', async () => {
    mocks.tables.students[0].full_name = null;
    mocks.tables.lesson_packages[0] = packageRow({ total_price: null, payment_method: null,
      lesson_package_items: [{ subjects: null }, { subjects: { name: null } }, { subjects: [] }] });
    const { result } = await run();
    expect(result.body.packages[0]).toMatchObject({ totalPrice: null, paymentMethod: null, studentName: '', subjects: '' });
  });

  it('returns the 20 newest offers', async () => {
    mocks.tables.lesson_packages = Array.from({ length: 25 }, (_, index) => packageRow({
      id: `package-${index + 1}`, created_at: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    }));
    const { result } = await run();
    expect(result.body.packages).toHaveLength(20);
    expect(result.body.packages[0].id).toBe('package-25');
    expect(result.body.packages[19].id).toBe('package-6');
  });

  it('pages past newer ineligible pools to return an older valid unpaid offer', async () => {
    mocks.tables.lesson_packages = [
      packageRow({ id: 'older-valid-offer', created_at: '2026-08-01T00:00:00.000Z', pool_organization_id: null, active: false }),
      ...Array.from({ length: 120 }, (_, index) => packageRow({
        id: `ineligible-${index}`,
        created_at: new Date(Date.parse('2026-09-01T00:00:00Z') + index * 60_000).toISOString(),
        ...(index % 3 === 0 ? { active: false }
          : index % 3 === 1 ? { expires_at: '2000-01-01T00:00:00.000Z' }
            : { pool_organization_id: 'other-organization' }),
      })),
    ];
    const { result } = await run();
    expect(result.statusCode).toBe(200);
    expect(result.body.packages.map((row: any) => row.id)).toEqual(['older-valid-offer']);
    expect(mocks.calls.filter(call => call.table === 'lesson_packages' && call.method === 'range')
      .map(call => call.args)).toEqual([[0, 99], [100, 199]]);
  });

  it('uses package IDs as a stable tie-breaker and stops once 20 eligible offers are found', async () => {
    mocks.tables.lesson_packages = Array.from({ length: 125 }, (_, index) => packageRow({
      id: `package-${String(index).padStart(3, '0')}`,
    }));
    const { result } = await run();
    expect(result.body.packages.map((row: any) => row.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `package-${124 - index}`),
    );
    expect(mocks.calls.filter(call => call.table === 'lesson_packages' && call.method === 'range')
      .map(call => call.args)).toEqual([[0, 99]]);
  });

  it('rechecks canonical links before returning a revoked child', async () => {
    mocks.onPackagesRead = () => { mocks.tables.parent_students = []; };
    const { result } = await run();
    expect(result).toEqual({ statusCode: 200, body: { packages: [] } });
  });

  it('rechecks live guardian authorization before returning a revoked child', async () => {
    mocks.liveIdResults = [[CHILD], []];
    const { result } = await run();
    expect(result).toEqual({ statusCode: 200, body: { packages: [] } });
  });

  it('pages the live scope rather than truncating a large family result', async () => {
    mocks.liveIds = [...Array.from({ length: 200 }, (_, index) => `unlinked-${index}`), CHILD];
    const { result } = await run();
    expect(result.body.packages.map((row: any) => row.id)).toEqual(['package-1']);
    expect(mocks.rpc).toHaveBeenCalledTimes(4);
  });

  it.each(['parent_profiles', 'parent_students', 'students', 'lesson_packages'])('fails closed on a %s query error', async (table) => {
    mocks.errors[table] = { message: 'private database detail' };
    const { result } = await run();
    expect(result).toEqual({ statusCode: 500, body: { error: 'Could not load pending packages.' } });
  });

  it('fails closed when the live parent scope is unavailable', async () => {
    mocks.rpcError = { message: 'private guardian detail' };
    const { result } = await run();
    expect(result).toEqual({ statusCode: 500, body: { error: 'Could not load pending packages.' } });
    expect(mocks.from).not.toHaveBeenCalledWith('lesson_packages');
  });

  it('requires the public key rather than calling the live scope with the service role', async () => {
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const { result } = await run();
    expect(result.statusCode).toBe(500);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('uses the documented Vite public key fallback', async () => {
    vi.stubEnv('SUPABASE_ANON_KEY', '');
    const { result } = await run();
    expect(result.statusCode).toBe(200);
    expect(mocks.createClient).toHaveBeenCalledWith(expect.anything(), 'test-vite-public-key', expect.anything());
  });

  it('ignores the obsolete local API URL', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://xklzjhfztjxltrdkplog.supabase.co');
    const { result } = await run();
    expect(result.statusCode).toBe(200);
    expect(mocks.createClient).toHaveBeenCalledWith('https://test.supabase.co', 'test-service-key', expect.anything());
  });

  it('rejects methods other than GET', async () => {
    const { result, res } = await run({}, 'POST');
    expect(result.statusCode).toBe(405);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET');
    expect(mocks.auth).not.toHaveBeenCalled();
  });
});
