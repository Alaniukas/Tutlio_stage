import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, writes: [] as any[], canEdit: true, authenticated: true }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1), otherOrg = id(2), child = id(3), tutorRow = id(4), sibling = id(5), foreign = id(6), chargeId = id(7), templateId = id(8);

function query(table: string) {
  const filters: Array<(row: any) => boolean> = [];
  let patch: any, inserting = false;
  let window: [number, number] | null = null;
  const resolve = () => {
    const all = (state.tables[table] ||= []);
    let rows = all.filter(row => filters.every(filter => filter(row)));
    if (patch) {
      if (inserting) {
        if (all.some(row => row.id === patch.id)) return { data: null, error: { code: '23505' } };
        rows = [{ version: 1, is_active: true, invoice_id: null, cancelled_at: null, ...patch }]; all.push(...rows);
      } else rows.forEach(row => Object.assign(row, patch, { version: row.version + 1 }));
      state.writes.push({ table, patch: structuredClone(patch), ids: rows.map(row => row.id) });
    }
    if (window) rows = rows.slice(window[0], window[1] + 1);
    return { data: structuredClone(rows), error: null };
  };
  const builder: any = {
    select: () => builder,
    eq: (key: string, value: any) => { filters.push(row => row[key] === value); return builder; },
    is: (key: string, value: any) => { filters.push(row => (row[key] ?? null) === value); return builder; },
    in: (key: string, values: string[]) => { filters.push(row => values.includes(row[key])); return builder; },
    ilike: (key: string, value: string) => { filters.push(row => String(row[key]).toLowerCase() === value.toLowerCase()); return builder; },
    order: () => builder,
    range: (from: number, to: number) => { window = [from, to]; return builder; },
    insert: (data: any) => { patch = data; inserting = true; return builder; },
    update: (data: any) => { patch = data; return builder; },
    maybeSingle: async () => { const value = resolve(); return { ...value, data: value.data?.[0] || null }; },
    single: async () => { const value = resolve(); return { ...value, data: value.data?.[0] || null }; },
    then: (done: any) => done(resolve()),
  };
  return builder;
}
vi.mock('../../api/_lib/schoolConsultationsAccess.js', () => ({ serviceSupabase: () => ({ from: query }) }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ requireOrgAdminAccess: async () => state.authenticated ? ({ ok: true,
  access: { userId: 'admin', organizationId: '00000000-0000-4000-8000-000000000001', role: 'custom', permissions: { 'finance.view': true, 'finance.edit': state.canEdit } } })
  : ({ ok: false, status: 401, error: 'Unauthorized' }) }));
import handler from '../../api/school-service-charges';

async function request(method = 'GET', body: Record<string, unknown> = {}, queryParams: Record<string, string> = { studentId: child }) {
  const result = { status: 0, body: null as any };
  const res: any = { setHeader: vi.fn(), status(code: number) { result.status = code; return this; }, json(value: any) { result.body = value; return this; } };
  await handler({ method, body: { studentId: child, ...body }, query: queryParams, headers: {} } as any, res);
  return result;
}
const save = () => ({ action: 'save-charge', id: chargeId, description: 'Olimpiada', unitPriceEur: 8, quantity: 1, serviceDate: '2026-10-21', invoiceMonth: '2026-10', internalNote: 'Private' });
beforeEach(() => {
  state.writes = []; state.canEdit = true; state.authenticated = true;
  const anchor = { id: child, organization_id: org, full_name: 'Child One', payer_email: 'parent@example.com' };
  state.tables = {
    organizations: [{ id: org, entity_type: 'school', features: { school_service_charges: true } }],
    students: [anchor, { ...anchor, id: tutorRow }, { ...anchor, id: sibling, full_name: 'Child Two' }, { ...anchor, id: foreign, organization_id: otherOrg }],
    school_service_templates: [{ id: templateId, organization_id: org, name: 'Licencija', unit_price_eur: 12, is_active: true, version: 1 }],
    school_student_service_charges: [],
  };
});
describe('one-off service API isolation and administration', () => {
  it('uses live admin access and finance permissions for reads and mutations', async () => {
    state.authenticated = false;
    expect((await request()).status).toBe(401);
    state.authenticated = true; state.canEdit = false;
    expect((await request('POST', save())).status).toBe(403);
    expect((await request()).body.canEdit).toBe(false);
    expect(state.writes).toEqual([]);
  });
  it('ignores a supplied organization and rejects foreign students and disabled features', async () => {
    expect((await request('POST', { ...save(), organizationId: otherOrg, studentId: foreign })).status).toBe(404);
    expect((await request('POST', { ...save(), organizationId: otherOrg })).status).toBe(200);
    expect(state.tables.school_student_service_charges[0].organization_id).toBe(org);
    state.tables.organizations[0].features = {};
    expect((await request()).status).toBe(404);
  });
  it('shares a child’s service history across tutor rows without leaking siblings or other organizations', async () => {
    state.tables.school_student_service_charges = [
      { id: 'mine', organization_id: org, student_id: tutorRow, internal_note: 'Mine' },
      { id: 'sibling', organization_id: org, student_id: sibling, internal_note: 'Sibling private' },
      { id: 'foreign', organization_id: otherOrg, student_id: foreign, internal_note: 'Foreign private' },
    ];
    expect((await request()).body.charges.map((row: any) => row.id)).toEqual(['mine']);
  });
  it('saves an ad hoc charge without contracts, deduplicates retries, and checks edit versions', async () => {
    expect((await request('POST', save())).status).toBe(200);
    expect((await request('POST', save())).status).toBe(200);
    expect(state.tables.school_student_service_charges).toHaveLength(1);
    expect(state.tables.school_student_service_charges[0]).toMatchObject({ organization_id: org, student_id: child, invoice_month: '2026-10-01' });
    expect((await request('POST', { ...save(), version: 99 })).status).toBe(409);
    expect((await request('POST', { ...save(), version: 1, unitPriceEur: 9 })).status).toBe(200);
    expect(state.tables.school_student_service_charges[0]).toMatchObject({ version: 2, unit_price_eur: 9 });
    expect(state.writes.every(row => row.table === 'school_student_service_charges')).toBe(true);
  });
  it('prevents edits, cancellations and restores of invoiced charges', async () => {
    await request('POST', save());
    state.tables.school_student_service_charges[0].invoice_id = 'issued';
    const count = state.writes.length;
    for (const action of ['save-charge', 'cancel-charge', 'restore-charge']) {
      expect((await request('POST', { ...save(), action, version: 1 })).status).toBe(409);
    }
    expect(state.writes).toHaveLength(count);
  });
  it('validates dates, precision, prices, templates and quantities before writing', async () => {
    for (const patch of [{ serviceDate: '2026-02-30' }, { unitPriceEur: 1.001 }, { quantity: -1 }, { invoiceMonth: '2026-13' }, { description: ' ' }, { templateId: foreign }]) {
      expect((await request('POST', { ...save(), ...patch })).status).toBeGreaterThanOrEqual(400);
    }
    expect(state.writes).toEqual([]);
  });
  it('updates catalog prices without altering assigned services and archives templates', async () => {
    await request('POST', { ...save(), templateId });
    expect((await request('POST', { action: 'save-template', id: templateId, version: 1, name: 'Licencija', unitPriceEur: 15 })).status).toBe(200);
    expect(state.tables.school_student_service_charges[0].unit_price_eur).toBe(8);
    expect((await request('POST', { action: 'archive-template', id: templateId, version: 2 })).status).toBe(200);
    expect(state.tables.school_service_templates[0].is_active).toBe(false);
  });
});
