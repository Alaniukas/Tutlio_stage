import { createClient } from '@supabase/supabase-js';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

/** Real migration RPCs plus a small local PostgREST transport; no external requests. */
export async function schoolMaterialDigestDatabase(seed: Record<string, Record<string, any>[]>) {
  const pg = new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE organizations(id uuid PRIMARY KEY,name text,entity_type text,features jsonb,preferred_locale text,logo_url text,brand_color text,brand_color_secondary text);
    CREATE TABLE students(id uuid PRIMARY KEY,organization_id uuid,full_name text,email text,linked_user_id uuid,detached_at timestamptz,enrollment_status text);
    CREATE TABLE parent_profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,email_notification_opt_out jsonb,disable_lesson_reminders boolean);
  `);
  const migration = readFileSync('supabase/migrations/20260928190300_school_material_publications_digest.sql', 'utf8');
  await pg.exec(migration.slice(0, migration.indexOf('ALTER TABLE public.school_material_publications ENABLE ROW')));
  for (const name of ['school_claim_material_digest', 'school_reserve_material_digest']) {
    const start = migration.indexOf(`CREATE FUNCTION public.${name}(`);
    const end = migration.indexOf('$$;', start) + 3;
    await pg.exec(migration.slice(start, end));
  }
  const quote = (name: string) => { if (!/^[a-z_]+$/.test(name)) throw new Error('Invalid fixture identifier'); return `"${name}"`; };
  const value = (input: any) => input && typeof input === 'object' ? JSON.stringify(input) : input;
  for (const [table, rows] of Object.entries(seed)) for (const row of rows) {
    const fields = Object.keys(row);
    await pg.query(`INSERT INTO ${quote(table)}(${fields.map(quote).join(',')}) VALUES(${fields.map((_, index) => `$${index + 1}`).join(',')})`, fields.map(field => value(row[field])));
  }
  const calls: Array<{ table: string; method: string; payload?: any; query: URLSearchParams }> = [];
  let fail: { table: string; method: string } | null = null;
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); const table = url.pathname.split('/').at(-1)!;
    const method = init?.method || 'GET'; const headers = new Headers(init?.headers);
    const payload = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ table, method, payload, query: url.searchParams });
    if (fail?.table === table && fail.method === method) {
      fail = null; return new Response(JSON.stringify({ message: 'Injected unavailable response' }), { status: 503 });
    }
    if (url.pathname.includes('/rpc/')) {
      const args = table === 'school_claim_material_digest' ? [payload.p_delivery_id]
        : [payload.p_org, payload.p_email, payload.p_date, JSON.stringify(payload.p_payload), JSON.stringify(payload.p_entries)];
      const result = await pg.query<{ data: any }>(`SELECT ${quote(table)}(${args.map((_, index) => `$${index + 1}`).join(',')}) AS data`, args);
      return new Response(JSON.stringify(result.rows[0].data), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const params: any[] = [];
    const parameter = (input: any) => { params.push(value(input)); return `$${params.length}`; };
    const selected = url.searchParams.get('select') || '';
    let join = ''; let extra = '';
    if (selected.includes('publication:')) { join = ' JOIN school_material_publications publication ON publication.id=t.publication_id'; extra = " || jsonb_build_object('publication',to_jsonb(publication))"; }
    if (selected.includes('delivery:')) { join = ' JOIN school_material_digest_deliveries delivery ON delivery.id=t.delivery_id'; extra = " || jsonb_build_object('delivery',to_jsonb(delivery))"; }
    const column = (field: string) => field.includes('.') ? field.split('.').map(quote).join('.') : `t.${quote(field)}`;
    const parts = (input: string) => {
      let depth = 0; let start = 0; const output: string[] = [];
      for (let index = 0; index < input.length; index++) {
        if (input[index] === '(') depth++; if (input[index] === ')') depth--;
        if (input[index] === ',' && depth === 0) { output.push(input.slice(start, index)); start = index + 1; }
      }
      output.push(input.slice(start)); return output;
    };
    const logic = (expression: string): string => {
      if (expression.startsWith('and(') || expression.startsWith('or(')) {
        const isAnd = expression.startsWith('and('); const content = expression.slice(isAnd ? 4 : 3, -1);
        return `(${parts(content).map(logic).join(isAnd ? ' AND ' : ' OR ')})`;
      }
      const match = expression.match(/^([a-z_]+)\.(eq|is|gt|lt)\.(.*)$/);
      if (!match) throw new Error(`Unexpected fixture logical filter ${expression}`);
      const [, field, operator, input] = match;
      if (operator === 'is' && input === 'null') return `${column(field)} IS NULL`;
      const sqlOperator = { eq: '=', gt: '>', lt: '<' }[operator as 'eq' | 'gt' | 'lt'];
      return `${column(field)}${sqlOperator}${parameter(input)}`;
    };
    const conditions = [...url.searchParams].flatMap(([field, expression]) => {
      if (['select','order','limit','offset','on_conflict','columns'].includes(field)) return [];
      if (field === 'or') return [`(${parts(expression.slice(1,-1)).map(logic).join(' OR ')})`];
      if (expression === 'is.null') return [`${column(field)} IS NULL`];
      if (expression === 'not.is.null') return [`${column(field)} IS NOT NULL`];
      if (expression.startsWith('eq.')) return [`${column(field)}=${parameter(expression.slice(3))}`];
      if (expression.startsWith('lte.')) return [`${column(field)}<=${parameter(expression.slice(4))}`];
      if (expression.startsWith('gt.')) return [`${column(field)}>${parameter(expression.slice(3))}`];
      if (expression.startsWith('in.(')) return [`${column(field)} IN (${expression.slice(4,-1).split(',').map(part => parameter(part.replace(/^"|"$/g, ''))).join(',')})`];
      throw new Error(`Unexpected digest fixture filter: ${field}=${expression}`);
    });
    const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
    let sql = `SELECT to_jsonb(t)${extra} AS row FROM ${quote(table)} t${join}${where}`;
    if (method === 'PATCH') {
      sql = `UPDATE ${quote(table)} t SET ${Object.entries(payload).map(([field, input]) => `${quote(field)}=${parameter(input)}`).join(',')}${where} RETURNING to_jsonb(t) AS row`;
    } else if (method === 'POST') {
      const rows = Array.isArray(payload) ? payload : [payload]; const fields = Object.keys(rows[0]);
      const conflict = url.searchParams.get('on_conflict');
      sql = `INSERT INTO ${quote(table)} AS t(${fields.map(quote).join(',')}) VALUES ${rows.map(row => `(${fields.map(field => parameter(row[field])).join(',')})`).join(',')}`;
      if (conflict) sql += ` ON CONFLICT(${conflict.split(',').map(quote).join(',')}) DO NOTHING`;
      sql += ' RETURNING to_jsonb(t) AS row';
    } else if (method !== 'GET') throw new Error(`Unexpected digest fixture operation ${method}`);
    if (method === 'GET') {
      const orders = (url.searchParams.get('order') || '').split(',').filter(Boolean);
      if (orders.length) sql += ` ORDER BY ${orders.map(order => { const [field, direction, nulls] = order.split('.'); return `${column(field)} ${direction === 'desc' ? 'DESC' : 'ASC'}${nulls === 'nullsfirst' ? ' NULLS FIRST' : ''}`; }).join(',')}`;
      if (url.searchParams.has('limit')) sql += ` LIMIT ${Number(url.searchParams.get('limit'))}`;
      if (url.searchParams.has('offset')) sql += ` OFFSET ${Number(url.searchParams.get('offset'))}`;
    }
    const result = await pg.query<{ row: any }>(sql, params);
    const rows = result.rows.map(row => row.row);
    return new Response(JSON.stringify(headers.get('Accept')?.includes('vnd.pgrst.object') ? rows[0] || null : rows), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const client = createClient('https://digest-test.invalid', 'test-service-key', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: transport } });
  return { client, pg, calls, failOnce: (table: string, method: string) => { fail = { table, method }; } };
}
