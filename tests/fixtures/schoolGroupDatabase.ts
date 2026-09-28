import { createClient } from '@supabase/supabase-js';

export type SchoolTestRow = Record<string, any>;

/** Real PostgREST requests with local tables, including live embedded rosters. */
export function schoolGroupDatabase(seed: Record<string, SchoolTestRow[]>) {
  const tables = structuredClone(seed);
  const requests: Array<{ table: string; method: string; payload?: any; headers: Headers }> = [];
  let failure: { table: string; method: string } | null = null;
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split('/').at(-1)!;
    const method = init?.method || 'GET';
    const headers = new Headers(init?.headers);
    const payload = init?.body ? JSON.parse(String(init.body)) : undefined;
    requests.push({ table, method, payload, headers });
    if (failure?.table === table && failure.method === method) {
      failure = null;
      return new Response(JSON.stringify({ message: 'Injected interrupted write' }), { status: 500 });
    }
    if (!tables[table]) throw new Error(`Unexpected table ${table}`);
    const matches = (row: SchoolTestRow) => [...url.searchParams].every(([field, expression]) => {
      if (['select', 'columns', 'on_conflict', 'order', 'offset', 'limit'].includes(field)) return true;
      if (expression.startsWith('eq.')) return String(row[field]) === expression.slice(3);
      if (expression.startsWith('neq.')) return String(row[field]) !== expression.slice(4);
      if (expression === 'is.null') return row[field] == null;
      if (expression === 'not.is.null') return row[field] != null;
      if (expression.startsWith('in.(')) return expression.slice(4, -1).split(',').map(v => v.replace(/^"|"$/g, '')).includes(String(row[field]));
      if (expression.startsWith('gt.')) return String(row[field]) > expression.slice(3);
      if (expression.startsWith('gte.')) return String(row[field]) >= expression.slice(4);
      if (expression.startsWith('lte.')) return String(row[field]) <= expression.slice(4);
      if (expression.startsWith('cs.')) return Object.entries(JSON.parse(expression.slice(3))).every(([key, value]) => row[field]?.[key] === value);
      throw new Error(`Unexpected filter ${field}=${expression}`);
    });
    const selected = tables[table].filter(matches);
    if (method === 'GET') {
      const fields = url.searchParams.get('select') || '';
      const rows = selected.map(row => {
        const result = { ...row };
        if (table === 'school_class_groups' && fields.includes('members:')) {
          result.members = tables.school_class_group_members.filter(member => member.group_id === row.id);
        }
        if (table === 'school_class_groups' && fields.includes('slots:')) result.slots = tables.school_class_group_slots.filter(slot => slot.group_id === row.id);
        if (table === 'school_contracts' && fields.includes('student:')) {
          result.student = tables.students.find(student => student.id === row.student_id) || null;
        }
        return result;
      });
      return new Response(JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (method === 'PATCH') selected.forEach(row => Object.assign(row, payload));
    else if (method === 'DELETE') tables[table] = tables[table].filter(row => !matches(row));
    else if (method === 'POST') {
      for (const row of Array.isArray(payload) ? payload : [payload]) {
        const existing = table === 'school_class_group_members' && tables[table].find(member => member.group_id === row.group_id && member.student_id === row.student_id);
        if (existing) Object.assign(existing, row);
        else tables[table].push({ ...(table === 'sessions' ? { id: `session-${tables[table].length}` } : {}), ...row });
      }
    } else throw new Error(`Unexpected method ${method}`);
    return headers.get('Prefer')?.includes('return=representation')
      ? new Response(JSON.stringify(selected), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response(null, { status: 204 });
  };
  const client = createClient('https://school-test.invalid', 'test-service-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch },
  });
  return { client, tables, requests, failNext: (table: string, method: string) => { failure = { table, method }; } };
}

export function groupSeed(minimum = 3): Record<string, SchoolTestRow[]> {
  return {
    school_class_groups: [{ id: 'group', organization_id: 'school', name: 'STEAM', minimum_active_students: minimum }],
    school_class_group_members: ['s1', 's2', 's3'].map((student_id, index) => ({
      group_id: 'group', student_id, enrolled_at: `2026-09-0${index + 1}T08:00:00.000Z`,
      schedule_slots: [{ weekday: 1, start_time: '18:00' }],
    })),
    school_class_group_slots: [],
    school_contracts: ['s1', 's2', 's3'].map((student_id, index) => ({
      id: `c${index + 1}`, organization_id: 'school', student_id, kind: 'extra_lessons', class_group_id: 'group',
      signing_status: 'signed', accepted_at: '2026-08-01T08:00:00.000Z', suspended_group_membership: null,
    })),
    students: ['s1', 's2', 's3'].map(id => ({ id, organization_id: 'school', full_name: id, detached_at: null, enrollment_status: 'active' })),
    organizations: [{ id: 'school', name: 'Demo', email: 'demo@school.invalid' }],
    sessions: [{ id: 'history', student_id: 's1', status: 'completed' }],
    session_recurrence_exclusions: [],
    parent_profiles: [], parent_students: [],
  };
}
