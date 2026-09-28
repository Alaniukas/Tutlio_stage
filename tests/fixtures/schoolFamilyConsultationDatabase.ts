import { createClient } from '@supabase/supabase-js';

export function schoolFamilyConsultationDatabase(seed: Record<string, any[]>) {
  const tables = structuredClone(seed);
  const calls: Array<{ table: string; method: string; payload?: any; select: string }> = [];
  let failure: string | null = null;
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const table = url.pathname.split('/').at(-1)!;
    const method = init?.method || 'GET';
    const payload = init?.body ? JSON.parse(String(init.body)) : undefined;
    const select = url.searchParams.get('select') || '';
    calls.push({ table, method, payload, select });
    if (failure === table) { failure = null; return new Response(JSON.stringify({ message: 'Temporary access failure' }), { status: 500 }); }
    if (!tables[table]) throw new Error(`Unexpected table ${table}`);
    const matches = (row: any) => [...url.searchParams].every(([field, expression]) => {
      if (['select', 'columns', 'on_conflict', 'order', 'offset', 'limit'].includes(field)) return true;
      if (field === 'or') {
        const ids = expression.match(/student_id\.in\.\(([^)]+)\)/)?.[1].split(',') || [];
        return ids.includes(row.student_id) || (row.family_student_ids || []).some((id: string) => ids.includes(id));
      }
      if (expression.startsWith('eq.')) return String(row[field]) === expression.slice(3);
      if (expression === 'is.null') return row[field] == null;
      if (expression === 'not.is.null') return row[field] != null;
      if (expression.startsWith('in.(')) return expression.slice(4, -1).split(',').includes(String(row[field]));
      throw new Error(`Unexpected filter ${field}=${expression}`);
    });
    let selected = tables[table].filter(matches);
    if (method === 'POST') {
      selected = [];
      for (const entry of Array.isArray(payload) ? payload : [payload]) {
        const keys = url.searchParams.get('on_conflict')?.split(',') || [];
        const existing = keys.length ? tables[table].find(row => keys.every(key => row[key] === entry[key])) : null;
        if (existing) { Object.assign(existing, entry); selected.push(existing); }
        else {
          const created = { id: `00000000-0000-4000-8000-${String(900 + tables[table].length).padStart(12, '0')}`, created_at: new Date().toISOString(), ...entry };
          tables[table].push(created); selected.push(created);
        }
      }
    } else if (method === 'PATCH') selected.forEach(row => Object.assign(row, payload));
    else if (method !== 'GET') throw new Error(`Unexpected method ${method}`);
    const order = url.searchParams.get('order')?.split(',') || [];
    selected = [...selected].sort((a, b) => {
      for (const column of order) {
        const [key, direction] = column.split('.');
        const compare = String(a[key]).localeCompare(String(b[key]));
        if (compare) return direction === 'desc' ? -compare : compare;
      }
      return 0;
    });
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || selected.length);
    selected = selected.slice(offset, offset + limit).map(row => {
      if (table !== 'school_consultations') return row;
      return {
        ...row,
        ...(select.includes('student:') ? { student: tables.students.find(student => student.id === row.student_id) } : {}),
        ...(select.includes('tutor:') ? { tutor: tables.profiles.find(profile => profile.id === row.tutor_id) } : {}),
      };
    });
    const headers = new Headers(init?.headers);
    if (method === 'GET' || headers.get('Prefer')?.includes('return=representation')) {
      const data = headers.get('Accept')?.includes('application/vnd.pgrst.object') ? selected[0] : selected;
      return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(null, { status: 204 });
  };
  const client = createClient('https://family-consultation-test.invalid', 'test-service-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch },
  });
  return { client, tables, calls, failNext: (table: string) => { failure = table; } };
}
