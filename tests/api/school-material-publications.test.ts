// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ list: vi.fn(), guardians: vi.fn(), metadata: vi.fn() }));
vi.mock('../../api/_lib/googleDriveRecordings.js', () => ({ listDriveRecordings: state.list, getDriveFileMetadata: state.metadata, isRecordingWithinRetention: (created: string | null) => Boolean(created) }));
vi.mock('../../api/_lib/schoolFamilyGuardianAccess.js', async (original) => ({
  ...await original<typeof import('../../api/_lib/schoolFamilyGuardianAccess')>(), loadSchoolFamilyGuardianAccess: state.guardians,
}));
import { legacySessionMaterialPaths, prepareSchoolMaterialBaseline, registerDrivePublications, schoolMaterialRecipient, schoolRecordingPublicationAllowsLegacyAccess, schoolStudentMayViewPublication } from '../../api/_lib/schoolMaterialPublications';

it('uses one existing payer for a quiet-school child with an Auth alias while private portals still require verified guardians', async () => {
  const db = database();
  const child = { id: 'child', organization_id: 'school', email: 'alias@account.invalid', full_name: 'QA child',
    payer_email: 'First@school.test', payer_name: 'First parent', parent_secondary_email: 'second@school.test' };
  expect(await schoolMaterialRecipient(db.client, child, { school_join_and_material_notifications: true }))
    .toMatchObject({ email: 'first@school.test', kind: 'payer', name: 'First parent' });
  expect(await schoolMaterialRecipient(db.client, child, { school_join_and_material_notifications: true, school_family_portal: true })).toBeNull();
});

type Row = Record<string, any>;
function database(seed: Record<string, Row[]> = {}) {
  const tables = structuredClone({ school_material_publications: [], organizations: [], school_material_baselines: [], school_recording_drive_folders: [], school_family_guardians: [], students: [], sessions: [], school_class_group_members: [], school_recording_file_slots: [], school_contracts: [], recurring_individual_sessions: [], ...seed });
  const requests: Array<{ table: string; method: string; payload: Row | Row[] | undefined }> = [];
  let errorTable = '';
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); const table = url.pathname.split('/').at(-1)!;
    const method = init?.method || 'GET'; const headers = new Headers(init?.headers);
    const payload = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ table, method, payload });
    if (table === errorTable) return new Response(JSON.stringify({ message: 'Unavailable', code: '42P01' }), { status: 500 });
    if (table === 'school_baseline_session_materials') return new Response('0', { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (!tables[table]) throw new Error(`Unexpected table ${table}`);
    let rows = tables[table].filter((row) => [...url.searchParams].every(([field, expression]) => {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(field)) return true;
      if (expression.startsWith('eq.')) return String(field.split('.').reduce((value, key) => value?.[key], row)) === expression.slice(3);
      if (expression.startsWith('in.(')) return expression.slice(4, -1).split(',').map((value) => value.replace(/^"|"$/g, '')).includes(String(row[field]));
      throw new Error(`Unexpected filter ${field}=${expression}`);
    }));
    const order = (url.searchParams.get('order') || '').split(',').filter(Boolean);
    rows.sort((a, b) => {
      for (const criterion of order) { const [field, direction] = criterion.split('.'); const diff = String(a[field]).localeCompare(String(b[field])); if (diff) return direction === 'desc' ? -diff : diff; }
      return 0;
    });
    const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || rows.length);
    rows = rows.slice(offset, offset + limit);
    if (method === 'PATCH') { rows.forEach((row) => Object.assign(row, payload)); return new Response(null, { status: 204 }); }
    if (method === 'POST') {
      for (const row of Array.isArray(payload) ? payload : [payload]) {
        const existing = tables[table].find((candidate) => ['organization_id', 'source', 'target_id', 'file_id', 'source_version'].every((field) => candidate[field] === row[field]));
        if (!existing) tables[table].push({ first_published_at: new Date(Date.now() + tables[table].length).toISOString(), ...row });
        else if (!headers.get('Prefer')?.includes('ignore-duplicates')) Object.assign(existing, row);
      }
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify(headers.get('Accept')?.includes('vnd.pgrst.object') ? rows[0] || null : rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const client = createClient('https://material-test.invalid', 'test-service-key', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: transport } });
  return { client, tables, requests, fail: (table: string) => { errorTable = table; } };
}
const oldTime = '2026-09-01T12:00:00Z', newTime = '2026-09-28T12:00:00Z';
const recording = (id: string, modifiedTime = oldTime): any => ({ id, name: `${id}.mp4`, createdTime: oldTime, modifiedTime });
const input = { organizationId: 'school', targetId: 'group', fileId: 'file', createdTime: oldTime, modifiedTime: oldTime, features: { school_family_portal: true } };
beforeEach(() => {
  state.list.mockReset().mockImplementation(async (folder) => [recording(folder)]);
  state.guardians.mockReset().mockResolvedValue({ studentIds: ['child'], distinctParent: true });
  state.metadata.mockReset().mockResolvedValue({ id: 'file', createdTime: oldTime, modifiedTime: oldTime, canDownload: true, mimeType: 'video/mp4', parents: ['folder'] });
});

describe('material publication access and preparation', () => {
  it('preserves an old allowed version, rejects unpublished or overwritten versions, and never reclassifies old grants', async () => {
    const db = database();
    await registerDrivePublications(db.client, { organizationId: 'school', targetId: 'group', files: [recording('file')], features: {} });
    expect(await schoolRecordingPublicationAllowsLegacyAccess(db.client, input)).toBe(true);
    expect(await schoolRecordingPublicationAllowsLegacyAccess(db.client, { ...input, fileId: 'unknown' })).toBe(false);
    expect(await schoolRecordingPublicationAllowsLegacyAccess(db.client, { ...input, targetId: 'another-group' })).toBe(false);
    expect(await schoolRecordingPublicationAllowsLegacyAccess(db.client, { ...input, organizationId: 'another-school' })).toBe(false);
    expect(await schoolRecordingPublicationAllowsLegacyAccess(db.client, { ...input, modifiedTime: newTime })).toBe(false);
    expect(await schoolRecordingPublicationAllowsLegacyAccess(db.client, { ...input, modifiedTime: null, createdTime: null })).toBe(false);
    expect(await schoolRecordingPublicationAllowsLegacyAccess(db.client, { ...input, modifiedTime: null, createdTime: newTime })).toBe(false);
    expect(await schoolRecordingPublicationAllowsLegacyAccess(db.client, { ...input, modifiedTime: null })).toBe(true);
    await registerDrivePublications(db.client, { organizationId: 'school', targetId: 'group', files: [recording('file')], features: input.features });
    expect(db.tables.school_material_publications[0].legacy_access).toBe(true);
    await registerDrivePublications(db.client, { organizationId: 'school', targetId: 'group', files: [recording('file', newTime)], features: input.features });
    expect(await schoolRecordingPublicationAllowsLegacyAccess(db.client, { ...input, modifiedTime: newTime })).toBe(false);
    expect(db.tables.school_material_publications).toHaveLength(2);
  });

  it('retains unrelated schools without querying new tables and fails closed on private-publication query errors', async () => {
    const db = database(); db.fail('school_material_publications');
    expect(await schoolRecordingPublicationAllowsLegacyAccess(db.client, { ...input, features: {} })).toBe(true);
    expect(db.requests).toEqual([]);
    await expect(schoolRecordingPublicationAllowsLegacyAccess(db.client, input)).rejects.toThrow('school_material_access_unavailable');
  });

  it('selects the latest session-file version within the correct school', async () => {
    const db = database({ school_material_publications: [
      { organization_id: 'school', source: 'session_file', file_id: 'teacher.pdf', source_version: oldTime, first_published_at: oldTime, legacy_access: true },
      { organization_id: 'school', source: 'session_file', file_id: 'teacher.pdf', source_version: newTime, first_published_at: newTime, legacy_access: false },
      { organization_id: 'school', source: 'session_file', file_id: 'old.pdf', source_version: oldTime, first_published_at: oldTime, legacy_access: true },
      { organization_id: 'other', source: 'session_file', file_id: 'secret.pdf', source_version: oldTime, first_published_at: oldTime, legacy_access: true },
    ] });
    expect([...await legacySessionMaterialPaths(db.client, 'school', ['teacher.pdf', 'old.pdf', 'secret.pdf', 'unknown.pdf'])]).toEqual(['old.pdf']);
  });

  it('rejects baseline preparation after opt-in before touching catalogue or Drive', async () => {
    const db = database({ organizations: [{ id: 'school', entity_type: 'school', features: input.features }] });
    await expect(prepareSchoolMaterialBaseline(db.client, 'school')).rejects.toThrow('school_material_baseline_requires_disabled_portal');
    expect(db.requests.map((request) => request.table)).toEqual(['organizations']); expect(state.list).not.toHaveBeenCalled();
  });

  it('resumes only the target school folder page and freezes classification to the baseline cutoff', async () => {
    const db = database({ organizations: [{ id: 'school', entity_type: 'school', features: {} }],
      school_material_baselines: [{ organization_id: 'school', cutoff_at: '2026-09-10T12:00:00Z', drive_offset: 0 }],
      school_recording_drive_folders: [...Array.from({ length: 6 }, (_, index) => ({ id: `mapping-${index}`, organization_id: 'school', group_id: `group-${index}`, drive_folder_id: `folder-${index}` })), { id: 'other', organization_id: 'other', group_id: 'private', drive_folder_id: 'other-school' }],
    });
    expect(await prepareSchoolMaterialBaseline(db.client, 'school')).toEqual({ complete: false, folders: 5 });
    expect(await prepareSchoolMaterialBaseline(db.client, 'school')).toEqual({ complete: true, folders: 6 });
    expect(state.list.mock.calls.map(([folder]) => folder)).toEqual(Array.from({ length: 6 }, (_, index) => `folder-${index}`));
    expect(db.tables.school_material_publications).toHaveLength(6);
    expect(db.tables.school_material_publications.every((row) => row.organization_id === 'school' && row.legacy_access)).toBe(true);
    await registerDrivePublications(db.client, { organizationId: 'school', targetId: 'group', files: [recording('late', newTime)], features: {}, baselineCutoff: '2026-09-10T12:00:00Z' });
    expect(db.tables.school_material_publications.at(-1)?.legacy_access).toBe(false);
  });

  it('uses only the real child inbox or a currently verified distinct guardian', async () => {
    const db = database({ school_family_guardians: [{ organization_id: 'school', student_id: 'child', guardian_user_id: 'parent', guardian_email: 'guardian@school.test', guardian_name: 'Tėvas' }] });
    expect(await schoolMaterialRecipient(db.client, { id: 'child', organization_id: 'school', email: 'REAL@School.Test', full_name: 'Vaikas' })).toEqual({ email: 'real@school.test', kind: 'student', name: 'Vaikas' });
    expect(state.guardians).not.toHaveBeenCalled();
    expect(await schoolMaterialRecipient(db.client, { id: 'child', organization_id: 'school', email: 'st-child@account.invalid' })).toEqual({ email: 'guardian@school.test', kind: 'payer', name: 'Tėvas', userId: 'parent' });
    state.guardians.mockResolvedValue({ studentIds: ['child'], distinctParent: false });
    expect(await schoolMaterialRecipient(db.client, { id: 'child', organization_id: 'school' })).toBeNull();
    state.guardians.mockResolvedValue({ studentIds: [], distinctParent: true });
    expect(await schoolMaterialRecipient(db.client, { id: 'child', organization_id: 'school' })).toBeNull();
  });

  it('revalidates file audiences after a child leaves a group and keeps another child notes private', async () => {
    const db = database({ organizations: [{ id: 'school', entity_type: 'school', features: input.features }],
      students: [{ id: 'child', organization_id: 'school', enrollment_status: 'active' }, { id: 'peer', organization_id: 'school', enrollment_status: 'active' }],
      sessions: [{ id: 'lesson', student_id: 'child', class_group_id: 'group', start_time: oldTime, tutor_comment: 'Private', show_comment_to_student: true, show_comment_to_parent: false },
        { id: 'peer-lesson', student_id: 'peer', class_group_id: 'group', start_time: oldTime }],
      school_class_group_members: [{ group_id: 'group', student_id: 'child' }, { group_id: 'group', student_id: 'peer' }],
    });
    const file: any = { id: 'publication', organization_id: 'school', source: 'session_file', target_id: 'lesson', file_id: 'lesson/teacher.pdf' };
    expect(await schoolStudentMayViewPublication(db.client, file, 'peer')).toBe(true);
    expect(await schoolStudentMayViewPublication(db.client, { ...file, file_id: 'lesson/nd-private-answer.pdf' }, 'peer')).toBe(false);
    expect(await schoolStudentMayViewPublication(db.client, { ...file, file_id: 'lesson/nd-private-answer.pdf' }, 'child')).toBe(false);
    db.tables.school_class_group_members = db.tables.school_class_group_members.filter((member) => member.student_id !== 'peer');
    expect(await schoolStudentMayViewPublication(db.client, file, 'peer')).toBe(false);
    const note = { ...file, source: 'session_note' };
    expect(await schoolStudentMayViewPublication(db.client, note, 'child', { recipientKind: 'student' })).toBe(true);
    expect(await schoolStudentMayViewPublication(db.client, note, 'child', { recipientKind: 'payer' })).toBe(false);
    expect(await schoolStudentMayViewPublication(db.client, note, 'peer', { recipientKind: 'student' })).toBe(false);
    db.tables.organizations[0].features = {};
    expect(await schoolStudentMayViewPublication(db.client, file, 'child')).toBe(false);
  });

  it('revalidates live individual enrollment, assigned Drive folder and exact file version before delivery', async () => {
    const db = database({ organizations: [{ id: 'school', entity_type: 'school', features: { ...input.features, school_lesson_recordings: true } }],
      students: [{ id: 'child', organization_id: 'school', enrollment_status: 'active' }],
      recurring_individual_sessions: [{ id: 'series', subject_id: 'subject', student_id: 'child', active: true, tutor: { organization_id: 'school' } }],
      school_recording_drive_folders: [{ organization_id: 'school', subject_id: 'subject', drive_folder_id: 'folder' }],
    });
    const publication: any = { id: 'pub', organization_id: 'school', source: 'drive', target_id: 'subject:subject', file_id: 'file', source_version: oldTime, source_created_at: oldTime };
    expect(await schoolStudentMayViewPublication(db.client, publication, 'child', { verifyDrive: true })).toBe(true);
    state.metadata.mockResolvedValue({ createdTime: oldTime, modifiedTime: newTime, parents: ['folder'], canDownload: true });
    expect(await schoolStudentMayViewPublication(db.client, publication, 'child', { verifyDrive: true })).toBe(false);
    state.metadata.mockResolvedValue({ createdTime: oldTime, modifiedTime: oldTime, parents: ['unrelated-folder'], canDownload: true });
    expect(await schoolStudentMayViewPublication(db.client, publication, 'child', { verifyDrive: true })).toBe(false);
    db.tables.recurring_individual_sessions[0].active = false;
    expect(await schoolStudentMayViewPublication(db.client, publication, 'child')).toBe(false);
    db.tables.recurring_individual_sessions[0].active = true;
    db.tables.organizations[0].features.school_lesson_recordings = false;
    expect(await schoolStudentMayViewPublication(db.client, publication, 'child')).toBe(false);
  });
});
