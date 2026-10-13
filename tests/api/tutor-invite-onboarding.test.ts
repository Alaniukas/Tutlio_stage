// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import registerTutor from '../../api/register-tutor-invite';
import claimInvite from '../../api/claim-tutor-invite';
import setTutorLicense from '../../api/org-set-tutor-license';

const orgId = 'b0a00000-7e57-4000-8000-000000000001';
const tutorId = 'invited-tutor';
type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let events: string[];
let subjectFailure: 'read' | 'insert' | null;

vi.mock('../../api/_lib/orgAdminAccess.js', () => ({
  getOrgAdminAccessByUserId: async (_client: unknown, userId: string) => userId === 'org-admin'
    ? { organizationId: 'b0a00000-7e57-4000-8000-000000000001', role: 'owner', permissions: {} }
    : null,
}));

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// Exercise the real Supabase client against an in-memory PostgREST transport.
// Selects project only requested columns, so missing invite fields cannot pass.
async function databaseFetch(input: string | URL | Request, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const method = init?.method || 'GET';
  const headers = new Headers(init?.headers);
  if (url.pathname === '/auth/v1/admin/users') {
    return jsonResponse({ id: tutorId, email: 'tutor@example.test', user_metadata: { full_name: 'Tutor' } });
  }
  if (url.pathname === '/auth/v1/user') {
    return jsonResponse({
      id: headers.get('Authorization') === 'Bearer admin-token' ? 'org-admin' : tutorId,
      email: 'tutor@example.test', user_metadata: { full_name: 'Tutor' },
    });
  }
  const table = url.pathname.replace('/rest/v1/', '');
  if (!url.pathname.startsWith('/rest/v1/') || !tables[table]) throw new Error(`Unexpected request: ${url}`);
  if (table === 'subjects' && ((method === 'GET' && subjectFailure === 'read')
    || (method === 'POST' && subjectFailure === 'insert'))) {
    return jsonResponse({ code: '42501', message: 'Subject storage unavailable' }, 400);
  }
  const matches = (row: Row) => [...url.searchParams].every(([column, filter]) => {
    if (column === 'select' || column === 'on_conflict') return true;
    if (filter.startsWith('eq.')) return String(row[column]) === filter.slice(3);
    if (filter.startsWith('neq.')) return String(row[column]) !== filter.slice(4);
    throw new Error(`Unexpected filter: ${filter}`);
  });
  if (method === 'GET') {
    const columns = url.searchParams.get('select');
    const rows = tables[table].filter(matches).map(row => columns && columns !== '*'
      ? Object.fromEntries(columns.split(',').map(column => [column, row[column]]))
      : { ...row });
    return jsonResponse(rows);
  }
  const body = JSON.parse(String(init?.body));
  events.push(`${table}:${method}`);
  if (method === 'PATCH') {
    for (const row of tables[table].filter(matches)) Object.assign(row, body);
  } else if (method === 'POST') {
    for (const row of Array.isArray(body) ? body : [body]) {
      const existing = headers.get('Prefer')?.includes('resolution=merge-duplicates')
        ? tables[table].find(existingRow => existingRow.id === row.id) : null;
      if (existing) Object.assign(existing, row);
      else tables[table].push({ ...(table === 'profiles' ? { has_active_license: false } : {}), ...row });
    }
  } else throw new Error(`Unexpected method: ${method}`);
  return new Response(null, { status: 201 });
}

async function register() {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await registerTutor({ method: 'POST', body: {
    email: 'tutor@example.test', password: 'test-password', fullName: 'Tutor', orgToken: 'INVITE12',
  } } as any, response as any);
  return response;
}

async function claim() {
  const response = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await claimInvite({ method: 'POST', headers: { authorization: 'Bearer tutor-token' },
    body: { token: 'INVITE12' } } as any, response as any);
  return response;
}

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key');
  vi.stubGlobal('fetch', vi.fn(databaseFetch));
  vi.spyOn(console, 'error').mockImplementation(() => {});
  events = [];
  subjectFailure = null;
  tables = {
    organizations: [{ id: orgId, preferred_locale: 'lt', tutor_license_count: 27 }],
    profiles: [],
    subjects: [],
    tutor_invites: [{
      id: 'invite-1', token: 'INVITE12', organization_id: orgId, used: false, used_by_profile_id: null,
      invitee_email: 'tutor@example.test', teaching_notes: 'MAT 5-12, FIZ 5-12', company_commission_percent: 16.5,
      subjects_preset: [
        { name: 'Matematika', duration_minutes: 60, price: 0, color: '#00AAAA' },
        { name: 'Fizika', duration_minutes: 45, price: 0, color: '#cc0099' },
      ],
    }],
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('Pro Klasė tutor invitation onboarding', () => {
  it('keeps the note and assigned subjects through registration, login and licence assignment', async () => {
    expect((await register()).status).toHaveBeenCalledWith(200);
    expect(tables.profiles[0]).toMatchObject({ organization_id: orgId, teaching_notes: 'MAT 5-12, FIZ 5-12' });
    expect(tables.subjects).toEqual([
      { tutor_id: tutorId, name: 'Matematika', duration_minutes: 60, price: 0, color: '#00aaaa' },
      { tutor_id: tutorId, name: 'Fizika', duration_minutes: 45, price: 0, color: '#cc0099' },
    ]);
    const assignedSubjects = structuredClone(tables.subjects);
    expect(events.indexOf('subjects:POST')).toBeLessThan(events.indexOf('tutor_invites:PATCH'));
    expect((await claim()).status).toHaveBeenCalledWith(200);

    const response = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    await setTutorLicense({ method: 'POST', headers: { authorization: 'Bearer admin-token' },
      body: { tutorId, hasActiveLicense: true } } as any, response as any);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(tables.profiles[0]).toMatchObject({ has_active_license: true, teaching_notes: 'MAT 5-12, FIZ 5-12' });
    expect(tables.subjects).toEqual(assignedSubjects);
  });

  it('copies both fields when an existing tutor accepts an invitation', async () => {
    tables.profiles.push({ id: tutorId, organization_id: null, preferred_locale: 'lt', teaching_notes: null });
    expect((await claim()).status).toHaveBeenCalledWith(200);
    expect(tables.profiles[0].teaching_notes).toBe('MAT 5-12, FIZ 5-12');
    expect(tables.subjects.map(row => row.name)).toEqual(['Matematika', 'Fizika']);
    expect(events.indexOf('subjects:POST')).toBeLessThan(events.indexOf('tutor_invites:PATCH'));
  });

  it('does not duplicate an existing subject or a repeated preset with a different colour', async () => {
    tables.subjects.push({ tutor_id: tutorId, name: 'MATEMATIKA', duration_minutes: 60, price: '0', color: '#ff8800' });
    (tables.tutor_invites[0].subjects_preset as Row[]).push({ name: ' fizika ', duration_minutes: 45, price: 0, color: '#0000ff' });
    expect((await register()).status).toHaveBeenCalledWith(200);
    expect(tables.subjects).toHaveLength(2);
    expect(tables.subjects[0].color).toBe('#ff8800');
  });

  it.each([
    ['register', 'read'], ['register', 'insert'], ['claim', 'read'], ['claim', 'insert'],
  ] as const)('leaves %s invitations pending on subject %s failure and recovers on login', async (flow, failure) => {
    subjectFailure = failure;
    expect((await (flow === 'register' ? register() : claim())).status).toHaveBeenCalledWith(500);
    expect(tables.tutor_invites[0].used).toBe(false);
    expect(events).not.toContain('tutor_invites:PATCH');
    subjectFailure = null;
    expect((await claim()).status).toHaveBeenCalledWith(200);
    expect(tables.tutor_invites[0]).toMatchObject({ used: true, used_by_profile_id: tutorId });
    expect(tables.profiles[0].teaching_notes).toBe('MAT 5-12, FIZ 5-12');
    expect(tables.subjects).toHaveLength(2);
    expect((await claim()).status).toHaveBeenCalledWith(200);
    expect(tables.subjects).toHaveLength(2);
  });

  it('preserves later note edits and removed subjects when login replays an accepted invitation', async () => {
    expect((await register()).status).toHaveBeenCalledWith(200);
    tables.profiles[0].teaching_notes = 'LT 1-4';
    tables.subjects = [];
    events = [];
    expect((await claim()).status).toHaveBeenCalledWith(200);
    expect(tables.profiles[0].teaching_notes).toBe('LT 1-4');
    expect(tables.subjects).toEqual([]);
    expect(events).toEqual([]);
  });

  it.each([null, []])('accepts invitations with no assigned subjects (%j)', async presets => {
    tables.tutor_invites[0].subjects_preset = presets;
    tables.tutor_invites[0].teaching_notes = null;
    expect((await register()).status).toHaveBeenCalledWith(200);
    expect(tables.profiles[0].teaching_notes).toBeNull();
    expect(tables.subjects).toEqual([]);
  });
});
