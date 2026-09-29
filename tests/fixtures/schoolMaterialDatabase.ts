import { createClient } from '@supabase/supabase-js';

type Row = Record<string, any>;
/** Actual Supabase/PostgREST/Storage clients, with all requests confined to local transport. */
export function schoolMaterialDatabase(seed: Record<string, Row[]> = {}) {
  const start = new Date(Date.now() + 86_400_000).toISOString();
  const end = new Date(Date.now() + 86_400_000 + 45 * 60_000).toISOString();
  const tables: Record<string, Row[]> = {
    organizations: [{ id: 'school', entity_type: 'school', name: 'Test School', features: { school_family_portal: true } },
      { id: 'other-school', entity_type: 'school', features: { school_family_portal: true } }],
    students: [{ id: 'child', full_name: 'Test Child', organization_id: 'school', linked_user_id: 'student-user', detached_at: null },
      { id: 'peer', full_name: 'Test Peer', organization_id: 'school', linked_user_id: 'peer-user', detached_at: null },
      { id: 'foreign', full_name: 'Foreign Child', organization_id: 'other-school', linked_user_id: 'foreign-user', detached_at: null }],
    sessions: ['child', 'peer', 'foreign'].map((student_id) => ({ id: `${student_id}-session`, student_id,
      tutor_id: 'teacher', subject_id: 'subject', class_group_id: 'group', start_time: start, end_time: end,
      status: 'active', meeting_link: null, topic: '', tutor_comment: `${student_id} private note`,
      show_comment_to_parent: true, show_comment_to_student: false, subjects: { is_group: true } })),
    school_class_groups: [{ id: 'group', organization_id: 'school', name: 'Test Group', tutor_id: 'teacher-user' }],
    school_class_group_members: [{ group_id: 'group', student_id: 'child' }, { group_id: 'group', student_id: 'peer' }],
    school_group_material_files: [],
    school_contracts: [{ id: 'annual', organization_id: 'school', student_id: 'child', kind: 'annual',
      signing_status: 'signed', archived_at: null, terminated_at: null }],
    school_family_guardians: [{ organization_id: 'school', student_id: 'child', guardian_user_id: 'parent-user',
      annual_contract_id: 'annual', guardian_email: 'parent@example.test', guardian_name: 'Test Parent', evidence_source: 'admin_verified' }],
    school_contract_signatures: [], school_material_publications: [], profiles: [], subjects: [], parent_profiles: [], parent_students: [],
    ...structuredClone(seed),
  };
  const files: Record<string, { body: string; type: string }> = {
    'child-session/teacher.pdf': { body: 'Own teacher material', type: 'application/pdf' },
    'child-session/nd-test-child-answer.pdf': { body: 'Own answer', type: 'application/pdf' },
    'peer-session/teacher.pdf': { body: 'Peer teacher material', type: 'application/pdf' },
    'peer-session/nd-test-peer-answer.pdf': { body: 'Peer private answer', type: 'application/pdf' },
    'foreign-session/secret.pdf': { body: 'Foreign school material', type: 'application/pdf' },
  };
  const groupFiles: Record<string, { body: string; type: string }> = {};
  const requests: Array<{ path: string; method: string; table?: string; payload?: Row }> = [];
  const hooks = { download: undefined as (() => void | Promise<void>) | undefined,
    list: undefined as (() => void | Promise<void>) | undefined,
    afterGroupRead: undefined as (() => void | Promise<void>) | undefined, failedTable: '' };
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); const method = init?.method || 'GET';
    const payload = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init?.headers);
    requests.push({ path: url.pathname, method, payload });
    if (url.pathname.startsWith('/storage/v1/')) {
      if (url.pathname.includes('/school-group-materials')) {
        if (url.pathname.startsWith('/storage/v1/object/upload/sign/school-group-materials/')) {
          return json({ url: `/object/upload/sign/school-group-materials/${url.pathname.split('/school-group-materials/')[1]}?token=group-upload-token` });
        }
        const path = decodeURIComponent(url.pathname.split('/school-group-materials/')[1] || '');
        if (url.pathname.includes('/object/info/')) return json(groupFiles[path] ? { name: path } : null, groupFiles[path] ? 200 : 404);
        if (method === 'DELETE') {
          for (const object of payload?.prefixes || []) delete groupFiles[object];
          return json([]);
        }
        await hooks.download?.();
        const file = groupFiles[path];
        return file ? new Response(file.body, { headers: { 'Content-Type': file.type } }) : json({ error: 'Not found' }, 404);
      }
      if (url.pathname === '/storage/v1/object/list/session-files') {
        await hooks.list?.();
        return json(Object.entries(files).filter(([path]) => path.startsWith(`${payload.prefix}/`))
          .map(([path, value]) => ({ name: path.slice(payload.prefix.length + 1), metadata: { size: value.body.length } })));
      }
      if (url.pathname === '/storage/v1/object/sign/session-files') {
        return json(payload.paths.map((path: string) => ({ path, signedURL: `/object/sign/session-files/${path}?token=reusable` })));
      }
      if (url.pathname.startsWith('/storage/v1/object/upload/sign/session-files/')) {
        return json({ url: `/object/upload/sign/session-files/${url.pathname.split('/session-files/')[1]}?token=upload` });
      }
      if (method === 'DELETE') return json([]);
      const path = decodeURIComponent(url.pathname.split('/object/session-files/')[1] || '');
      const file = files[path];
      await hooks.download?.();
      return file ? new Response(file.body, { headers: { 'Content-Type': file.type } }) : json({ error: 'Not found' }, 404);
    }
    const table = url.pathname.split('/').at(-1)!;
    requests.at(-1)!.table = table;
    if (hooks.failedTable === table) return json({ message: 'Unavailable', code: '42P01' }, 500);
    if (!tables[table]) throw new Error(`Unexpected local table ${table}`);
    let rows = tables[table].filter((row) => [...url.searchParams].every(([field, expression]) => {
      if (['select', 'order', 'limit', 'offset'].includes(field)) return true;
      const value = field.split('.').reduce((part, key) => part?.[key], row);
      if (expression.startsWith('eq.')) return String(value) === expression.slice(3);
      if (expression.startsWith('neq.')) return String(value) !== expression.slice(4);
      if (expression === 'is.null') return value == null;
      if (expression === 'not.is.null') return value != null;
      if (expression.startsWith('in.(')) return expression.slice(4, -1).split(',').map((part) => part.replace(/^"|"$/g, '')).includes(String(value));
      if (expression.startsWith('gte.')) return String(value) >= expression.slice(4);
      if (expression.startsWith('lte.')) return String(value) <= expression.slice(4);
      throw new Error(`Unexpected local filter ${field}=${expression}`);
    }));
    if (method === 'POST') {
      const created = { id: crypto.randomUUID(), ...payload };
      tables[table].push(created);
      return json(headers.get('Prefer')?.includes('return=representation') ? [created] : null, 201);
    }
    if (method === 'PATCH') {
      rows.forEach((row) => Object.assign(row, payload));
      return json(headers.get('Prefer')?.includes('return=representation') ? rows : null);
    }
    if (method === 'DELETE') {
      const removed = new Set(rows);
      tables[table] = tables[table].filter((row) => !removed.has(row));
      return json(headers.get('Prefer')?.includes('return=representation') ? rows : null);
    }
    const order = (url.searchParams.get('order') || '').split(',').filter(Boolean);
    rows.sort((left, right) => {
      for (const part of order) { const [field, direction] = part.split('.'); const result = String(left[field]).localeCompare(String(right[field])); if (result) return direction === 'desc' ? -result : result; }
      return 0;
    });
    const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || rows.length);
    rows = rows.slice(offset, offset + limit);
    const response = json(headers.get('Accept')?.includes('vnd.pgrst.object') ? rows[0] || null : rows);
    if (table === 'school_class_groups') await hooks.afterGroupRead?.();
    return response;
  };
  const client = createClient('https://school-material-test.invalid', 'test-service-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: transport },
  });
  return { client, transport, tables, files, groupFiles, requests, hooks };
}
