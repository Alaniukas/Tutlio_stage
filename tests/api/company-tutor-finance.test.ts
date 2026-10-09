import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '../../api/types';
import { rowQuery, type RowQueryLog } from '../fixtures/rowQuery';
import { PRO_KLASE_QA_ORG_ID } from '../../src/lib/marketMoney';

const state = vi.hoisted(() => ({ access: vi.fn(), tables: {} as Record<string, any[]>,
  logs: [] as RowQueryLog[], writes: [] as any[], failingTable: '' }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ requireOrgAdminAccess: state.access }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (table: string) => {
  const query = rowQuery(table, table => state.tables[table] || [], state.logs, state.writes);
  if (table === state.failingTable) query.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: null, error: { message: 'Finance source unavailable' } }).then(resolve, reject);
  return query;
} }) }));

import handler from '../../api/company-tutor-finance';
const tutorId = 'b0a00000-7e57-4000-8000-000000000003';
const otherTutorId = 'b0a00000-7e57-4000-8000-000000000004';
const query = { start: '2026-10-01T00:00:00.000Z', end: '2026-10-31T23:59:59.999Z' };
const request = (params: Record<string, unknown> = {}, method = 'GET') =>
  ({ method, headers: {}, query: { ...query, ...params } }) as VercelRequest;
function response() {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
  state.access.mockReset().mockResolvedValue({ ok: true, access: { organizationId: PRO_KLASE_QA_ORG_ID } });
  state.logs.length = 0;
  state.writes.length = 0;
  state.failingTable = '';
  const profile = { id: tutorId, organization_id: PRO_KLASE_QA_ORG_ID, full_name: 'Jonas', email: 'qa@example.test',
    company_commission_percent: 14, has_active_license: true };
  const session = { id: 'regular', tutor_id: tutorId, students: { organization_id: PRO_KLASE_QA_ORG_ID },
    status: 'completed', status_confirmed_at: '2026-10-03T12:00:00Z', start_time: '2026-10-03T10:00:00Z',
    end_time: '2026-10-03T11:00:00Z', subjects: { is_trial: false } };
  state.tables = {
    profiles: [profile, { ...profile, id: otherTutorId, full_name: 'Be licencijos', has_active_license: false },
      { ...profile, id: 'admin', full_name: 'Administratorius' }, { ...profile, id: 'student', full_name: 'Mokinys' },
      { ...profile, id: 'foreign', full_name: 'Private name', organization_id: 'another-org' }],
    organization_admins: [{ id: 'seat', user_id: 'admin', organization_id: PRO_KLASE_QA_ORG_ID }],
    students: [{ id: 's1', organization_id: PRO_KLASE_QA_ORG_ID, tutor_id: tutorId },
      { id: 's2', organization_id: PRO_KLASE_QA_ORG_ID, tutor_id: otherTutorId }],
    tutor_invites: [],
    sessions: [session, { ...session, id: 'trial', subjects: { is_trial: true }, is_complimentary: true },
      { ...session, id: 'missed', status: 'no_show' }, { ...session, id: 'unconfirmed', status_confirmed_at: null },
      { ...session, id: 'future', start_time: '2026-10-30T10:00:00Z', end_time: '2026-10-30T11:00:00Z' },
      { ...session, id: 'other-org', students: { organization_id: 'another-org' } }],
    tutor_adjustments: [{ id: 'fine', organization_id: PRO_KLASE_QA_ORG_ID, tutor_id: tutorId, session_id: 'missed',
      type: 'penalty_missing_report', amount_eur: -10, reason: 'Ankstesnė bauda', created_at: '2026-10-04T12:00:00Z' },
      { id: 'correction', organization_id: PRO_KLASE_QA_ORG_ID, tutor_id: tutorId, session_id: null,
        type: 'penalty_manual', amount_eur: 10, reason: 'Domo korekcija', created_at: '2026-10-05T12:00:00Z' },
      { id: 'foreign-fine', organization_id: 'another-org', tutor_id: tutorId, amount_eur: -999,
        reason: 'Private adjustment', created_at: '2026-10-05T12:00:00Z' }],
    invoices: [],
  };
});
afterEach(() => vi.useRealTimers());

describe('Pro Klasė administrator tutor finances', () => {
  it.each([401, 403])('requires finance.view before reading financial data (%s)', async status => {
    state.access.mockResolvedValue({ ok: false, status, error: 'Denied' });
    const res = response();
    await handler(request(), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(state.access.mock.calls[0][2]).toBe('finance.view');
    expect(state.logs).toEqual([]);
  });
  it('uses the authenticated organization and includes only licensed, confirmed tutors', async () => {
    const res = response();
    await handler(request({ organizationId: 'another-org' }), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(200);
    const result = res.json.mock.calls[0][0];
    expect(result.tutors).toHaveLength(1);
    expect(result.tutors[0]).toMatchObject({ id: tutorId, completedCount: 2,
      breakdown: { individualLessons: 1, individualEur: 14, trialLessons: 1, trialEur: 10,
        noShowLessons: 1, noShowEur: 6, adjustmentsEur: 0, totalEur: 30 } });
    expect(result.tutors[0].adjustments.map((row: any) => row.id)).toEqual(['correction', 'fine']);
    expect(JSON.stringify(result)).not.toContain('Private');
    expect(state.writes).toEqual([]);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
  });
  it('recognizes accepted tutor invites and the existing null-license default', async () => {
    state.tables.profiles[1].has_active_license = null;
    state.tables.students = [];
    state.tables.tutor_invites = [{ id: 'invite', used: true, used_by_profile_id: otherTutorId,
      organization_id: PRO_KLASE_QA_ORG_ID }];
    const res = response();
    await handler(request(), res as unknown as VercelResponse);
    expect(res.json.mock.calls[0][0].tutors.map((tutor: any) => tutor.id)).toEqual([otherTutorId]);
  });
  it('does not substitute zero for an unknown pay rate', async () => {
    state.tables.profiles[0].company_commission_percent = null;
    const res = response();
    await handler(request(), res as unknown as VercelResponse);
    expect(res.json.mock.calls[0][0].tutors[0]).toMatchObject({ payRateEur: null, breakdown: null });
  });
  it('shows only the selected tutor’s remuneration invoices, even if the tutor issued customer invoices', async () => {
    const invoice = { id: 'own', organization_id: PRO_KLASE_QA_ORG_ID, invoice_number: 'SF-1', total_amount: 30,
      status: 'issued', issue_date: '2026-10-05', created_at: '2026-10-05T12:00:00Z',
      pdf_meta: { invoiceKind: 'tutor_pay', tutorId } };
    state.tables.invoices = [invoice,
      { ...invoice, id: 'client', pdf_meta: null, issued_by_user_id: tutorId, total_amount: 777 },
      { ...invoice, id: 'other-tutor', pdf_meta: { invoiceKind: 'tutor_pay', tutorId: otherTutorId } },
      { ...invoice, id: 'foreign', organization_id: 'another-org' }, { ...invoice, id: 'cancelled', status: 'cancelled' }];
    const res = response();
    await handler(request({ tutorId }), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].invoices.map((row: any) => row.id)).toEqual(['own']);
    expect(state.writes).toEqual([]);
  });
  it('loads every page rather than understating pay above the Supabase response limit', async () => {
    state.tables.sessions = Array.from({ length: 1201 }, (_, index) => ({ ...state.tables.sessions[0], id: `session-${index}` }));
    const res = response();
    await handler(request(), res as unknown as VercelResponse);
    expect(res.json.mock.calls[0][0].tutors[0]).toMatchObject({ completedCount: 1201,
      breakdown: { individualLessons: 1201, totalEur: 16814 } });
  });
  it.each(['tutor_adjustments', 'sessions', 'profiles', 'tutor_invites'])('fails closed when %s cannot be loaded', async table => {
    state.failingTable = table;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = response();
    await handler(request(), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Tutor finance unavailable' });
    log.mockRestore();
  });
  it.each([{ tutorId: otherTutorId }, { tutorId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' }])('rejects inaccessible or unlicensed tutors (%j)', async params => {
    const res = response();
    await handler(request(params), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(state.logs.some(log => log.table === 'invoices')).toBe(false);
  });
  it.each([{ start: 'invalid' }, { end: '2026-01-01T00:00:00.000Z' },
    { end: '2027-01-01T00:00:00.000Z' }, { tutorId: 'invalid' }])('rejects invalid filters (%j)', async params => {
    const res = response();
    await handler(request(params), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(state.logs).toEqual([]);
  });
  it('does not offer Pro Klasė pay rules to other organizations', async () => {
    state.access.mockResolvedValue({ ok: true, access: { organizationId: 'another-org' } });
    const res = response();
    await handler(request(), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(state.logs).toEqual([]);
  });
  it('rejects write requests', async () => {
    const res = response();
    await handler(request({}, 'POST'), res as unknown as VercelResponse);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(state.access).not.toHaveBeenCalled();
  });
});
