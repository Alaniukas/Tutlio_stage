import { beforeEach, expect, it, vi } from 'vitest';
import { schoolFamilyConsultationDatabase } from '../fixtures/schoolFamilyConsultationDatabase';
import { consultationSchoolYear } from '../../src/lib/schoolConsultationYear';

const state = vi.hoisted(() => ({ userId: '', db: null as any }));
vi.mock('../../api/_lib/auth', () => ({ verifyRequestAuth: async () => ({ userId: state.userId }) }));
vi.mock('../../api/_lib/schoolConsultationsAccess', async importOriginal => {
  const actual = await importOriginal<typeof import('../../api/_lib/schoolConsultationsAccess')>();
  return { ...actual, serviceSupabase: () => state.db.client, userConsultationSupabase: () => state.db.client };
});
import handler from '../../api/school-consultations';
import notesHandler from '../../api/school-consultation-notes';
import { maybeHandleFamilyConsultations } from '../../api/_lib/schoolFamilyConsultations';

const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const org = id(1), parent = id(10), childUser = id(11), specialist = id(12), admin = id(13), otherParent = id(14);
const childA = id(20), childB = id(21), childC = id(22);
const childBooking = id(30), familyBooking = id(31), unrelatedBooking = id(32);
function response() {
  const result: { status: number; body?: any; headers: Record<string, string> } = { status: 0, headers: {} };
  const res: any = {
    setHeader(name: string, value: string) { result.headers[name.toLowerCase()] = value; return res; },
    status(value: number) { result.status = value; return res; },
    json(value: unknown) { result.body = value; return res; },
  };
  return { res, result };
}
async function request(target: typeof handler, method: string, input: Record<string, unknown>) {
  const output = response();
  await target({ method, headers: {}, query: method === 'GET' ? input : {}, body: method === 'POST' ? input : {} } as any, output.res);
  return output.result;
}
beforeEach(() => {
  state.userId = parent;
  const start = new Date(Date.now() + 86_400_000).toISOString();
  const common = { organization_id: org, kind: 'help_team', tutor_id: specialist, help_team_category: 'psychologist', school_year: consultationSchoolYear(), status: 'confirmed', start_time: start, mode: 'individual', is_paid: false };
  state.db = schoolFamilyConsultationDatabase({
    organizations: [{ id: org, entity_type: 'school', features: { school_family_portal: true } }],
    organization_admins: [{ id: id(15), user_id: admin, organization_id: org, status: 'active', role: 'owner', permissions: {} }],
    profiles: [{ id: specialist, organization_id: org, full_name: 'Specialist', help_team_category: 'psychologist' }],
    students: [
      { id: childA, organization_id: org, full_name: 'A', grade: '1', linked_user_id: childUser },
      { id: childB, organization_id: org, full_name: 'B', grade: '2', linked_user_id: id(50) },
      { id: childC, organization_id: org, full_name: 'C', grade: '3', linked_user_id: id(51) },
    ],
    school_family_guardians: [childA, childB, childC].map((student_id, index) => ({ organization_id: org, student_id, annual_contract_id: id(60 + index), guardian_user_id: index === 2 ? otherParent : parent, evidence_source: 'admin_verified' })),
    school_contracts: [childA, childB, childC].map((student_id, index) => ({ id: id(60 + index), organization_id: org, student_id, kind: 'annual', signing_status: 'signed', archived_at: null, terminated_at: null })),
    school_contract_signatures: [], parent_profiles: [], parent_students: [],
    school_consultation_requests: [],
    school_consultations: [
      { ...common, id: childBooking, student_id: childA, target_kind: 'child', family_student_ids: [] },
      { ...common, id: familyBooking, student_id: childA, target_kind: 'family', family_student_ids: [childA, childB, childC] },
      { ...common, id: unrelatedBooking, student_id: childC, target_kind: 'child', family_student_ids: [] },
    ],
    school_consultation_notes: [{ id: id(70), consultation_id: childBooking, organization_id: org, author_user_id: specialist, body: 'Private note', created_at: start }],
  });
});

it('shows child and family reservations in the overview, and only child reservations in its selected view', async () => {
  const overview = await request(handler, 'GET', { scope: 'portal', organization_id: org });
  expect(overview.status).toBe(200);
  expect(overview.body.consultations.map((row: any) => row.id).sort()).toEqual([childBooking, familyBooking]);
  expect(JSON.stringify(overview.body)).not.toContain('Private note');
  expect(state.db.calls.some((call: any) => call.table === 'school_consultation_notes')).toBe(false);
  const selected = await request(handler, 'GET', { scope: 'portal', organization_id: org, student_id: childA });
  expect(selected.body.consultations.map((row: any) => row.id)).toEqual([childBooking]);
  expect((await request(handler, 'GET', { scope: 'portal', organization_id: org, student_id: childC })).status).toBe(403);
});

it('discovers verified parents without legacy parent_students links', async () => {
  const overview = await request(handler, 'GET', { scope: 'portal' });
  expect(overview.status).toBe(200);
  expect(overview.body.familyPortal).toBe(true);
  expect(overview.body.eligibleStudentIds.sort()).toEqual([childA, childB]);
});

it('allows a verified parent to read, while denying parent writes and unrelated child notes', async () => {
  const read = await request(notesHandler, 'GET', { consultation_id: childBooking });
  expect(read.status).toBe(200);
  expect(read.headers['cache-control']).toBe('private, no-store');
  expect(read.body.notes[0].body).toBe('Private note');
  expect(read.body.canWrite).toBe(false);
  const deniedWrite = await request(notesHandler, 'POST', { consultation_id: childBooking, body: 'Overwrite' });
  expect(deniedWrite.status).toBe(403);
  expect(deniedWrite.headers['cache-control']).toBe('private, no-store');
  expect((await request(notesHandler, 'GET', { consultation_id: unrelatedBooking })).status).toBe(403);
  state.db.tables.school_contracts[0].terminated_at = new Date().toISOString();
  expect((await request(notesHandler, 'GET', { consultation_id: childBooking })).status).toBe(403);
});

it('denies notes to children, shared identities, and admins while admins can see reservation metadata', async () => {
  state.userId = childUser;
  expect((await request(notesHandler, 'GET', { consultation_id: childBooking })).status).toBe(403);
  const childPortal = await request(handler, 'GET', { scope: 'portal', organization_id: org });
  expect(childPortal.body.consultations).toEqual([]);
  state.userId = admin;
  expect((await request(handler, 'GET', { scope: 'admin', organization_id: org })).body.consultations).toHaveLength(3);
  expect((await request(notesHandler, 'GET', { consultation_id: childBooking })).status).toBe(403);
  state.userId = parent;
  state.db.tables.students[1].linked_user_id = parent;
  expect((await request(notesHandler, 'GET', { consultation_id: childBooking })).status).toBe(403);
});

it('lets only the assigned specialist write their own note and ignores forged author and organization fields', async () => {
  state.userId = specialist;
  const edit = await request(notesHandler, 'POST', { consultation_id: childBooking, body: ' Updated note ', author_user_id: parent, organization_id: id(999) });
  expect(edit.status).toBe(200);
  expect(state.db.tables.school_consultation_notes).toHaveLength(1);
  expect(state.db.tables.school_consultation_notes[0]).toMatchObject({ author_user_id: specialist, organization_id: org, body: 'Updated note' });
  state.db.tables.profiles[0].help_team_category = 'speech';
  expect((await request(notesHandler, 'GET', { consultation_id: childBooking })).status).toBe(403);
});

it('shares family reservations with another current guardian through the family child snapshot', async () => {
  state.userId = otherParent;
  const portal = await request(handler, 'GET', { scope: 'portal', organization_id: org });
  expect(portal.body.consultations.map((row: any) => row.id).sort()).toEqual([familyBooking, unrelatedBooking]);
  expect((await request(notesHandler, 'GET', { consultation_id: familyBooking })).status).toBe(200);
});

it('stores a server-derived family target and rejects forged child, specialist, category and times', async () => {
  // Free quota starts empty for this reservation.
  state.db.tables.school_consultations = [];
  const input = { action: 'book_help', organization_id: org, student_id: childA, tutor_id: specialist, help_team_category: 'psychologist', target_kind: 'family', family_student_ids: [childC], start_time: new Date(Date.now() + 86_400_000).toISOString(), end_time: new Date(Date.now() + 86_400_000 + 45 * 60_000).toISOString() };
  const created = await request(handler, 'POST', input);
  expect(created.status).toBe(200);
  expect(state.db.tables.school_consultations[0]).toMatchObject({ target_kind: 'family', student_id: childA, family_student_ids: [childA, childB] });
  expect((await request(handler, 'POST', { ...input, student_id: childC })).status).toBe(403);
  expect((await request(handler, 'POST', { ...input, tutor_id: id(999) })).status).toBe(403);
  expect((await request(handler, 'POST', { ...input, help_team_category: 'unknown' })).status).toBe(400);
  expect((await request(handler, 'POST', { ...input, end_time: 'invalid' })).status).toBe(400);
});

it('fails closed on guardian lookup errors and malformed note IDs', async () => {
  state.db.failNext('school_family_guardians');
  expect((await request(notesHandler, 'GET', { consultation_id: childBooking })).status).toBe(503);
  expect((await request(notesHandler, 'GET', { consultation_id: `${childBooking},${familyBooking}` })).status).toBe(400);
  expect(state.db.calls.some((call: any) => call.table === 'school_consultation_notes')).toBe(false);
});

it.each([false, undefined])('keeps the legacy handler available when family flag is %s', async feature => {
  state.db.tables.organizations[0].features = feature === undefined ? {} : { school_family_portal: feature };
  expect(await maybeHandleFamilyConsultations(state.db.client, parent, { method: 'GET', query: { scope: 'portal', organization_id: org }, body: {} } as any)).toBeNull();
  expect((await request(notesHandler, 'GET', { consultation_id: childBooking })).status).toBe(403);
});
