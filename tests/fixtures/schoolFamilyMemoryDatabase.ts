import { vi } from 'vitest';

/** Stateful Supabase fake for complete workflow tests; PostgreSQL authorization is tested separately. */
export function schoolFamilyMemoryDatabase(initial: Record<string, Array<Record<string, any>>>, initialUsers: Array<Record<string, any>> = []) {
  const tables = Object.fromEntries(Object.entries(initial).map(([name, rows]) => [name, structuredClone(rows)]));
  const users = new Map(initialUsers.map((user) => [user.id, structuredClone(user)]));
  let sequence = 0;
  const createUser = vi.fn(async (input: any) => {
    if ([...users.values()].some((user) => user.email.toLowerCase() === input.email.toLowerCase())) return { data: { user: null }, error: { code: 'email_exists', message: 'User already registered' } };
    const user = { ...input, id: `new-user-${++sequence}`, created_at: new Date().toISOString(), email_confirmed_at: new Date().toISOString(), last_sign_in_at: null };
    users.set(user.id, user); return { data: { user }, error: null };
  });
  const updateUserById = vi.fn(async (id: string, input: any) => {
    const user = users.get(id); if (!user) return { data: { user: null }, error: { message: 'missing' } };
    Object.assign(user, input); return { data: { user }, error: null };
  });
  const getUserById = vi.fn(async (id: string) => ({ data: { user: users.get(id) || null }, error: users.has(id) ? null : { message: 'missing' } }));
  const deleteUser = vi.fn(async (id: string) => { users.delete(id); return { error: null }; });
  const listUsers = vi.fn(async ({ page = 1 }: any) => ({ data: { users: page === 1 ? [...users.values()] : [] }, error: null }));
  const db: any = {
    auth: { admin: { createUser, getUserById, updateUserById, deleteUser, listUsers } },
    rpc: vi.fn(async (name: string, args: any) => {
      if (name === 'get_auth_user_id_by_email') return { data: [...users.values()].find((user) => user.email.toLowerCase() === args.p_email)?.id || null, error: null };
      if (name === 'school_family_claim_workflow') {
        const rows = tables.school_family_workflow_locks ||= [];
        if (rows.some((row) => row.organization_id === args.p_organization_id && row.student_id === args.p_student_id)) return { data: false, error: null };
        rows.push({ organization_id: args.p_organization_id, student_id: args.p_student_id, owner_id: args.p_owner_id });
        return { data: true, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    }),
    from: vi.fn((name: string) => {
      const rows = tables[name] ||= [];
      const filters: Array<(row: any) => boolean> = [];
      const orders: Array<{ field: string; ascending: boolean }> = [];
      let operation = 'read'; let input: any; let options: any; let maximum: number | null = null; let range: [number, number] | null = null;
      let output: any = null;
      const execute = (single = false) => {
        if (!output) {
          let matched = rows.filter((row) => filters.every((filter) => filter(row)));
          for (const order of [...orders].reverse()) matched.sort((a, b) => String(a[order.field]).localeCompare(String(b[order.field])) * (order.ascending ? 1 : -1));
          if (operation === 'read') {
            if (maximum !== null) matched = matched.slice(0, maximum);
            if (range) matched = matched.slice(range[0], range[1] + 1);
          } else if (operation === 'update') matched.forEach((row) => Object.assign(row, structuredClone(input)));
          else if (operation === 'delete') matched.forEach((row) => rows.splice(rows.indexOf(row), 1));
          else {
            matched = [];
            for (const value of Array.isArray(input) ? input : [input]) {
              const conflictFields = options?.onConflict?.split(',') || ['id'];
              let row = operation === 'upsert' ? rows.find((row) => conflictFields.every((field: string) => row[field] === value[field])) : undefined;
              if (row && !options?.ignoreDuplicates) Object.assign(row, structuredClone(value));
              if (!row) { row = { id: `row-${++sequence}`, ...structuredClone(value) }; rows.push(row); }
              matched.push(row);
            }
          }
          output = { data: structuredClone(matched), error: null };
        }
        return Promise.resolve(single ? { ...output, data: output.data[0] || null } : output);
      };
      const query: any = {
        select: vi.fn(() => query),
        eq: vi.fn((field: string, value: any) => { filters.push((row) => row[field] === value); return query; }),
        neq: vi.fn((field: string, value: any) => { filters.push((row) => row[field] !== value); return query; }),
        is: vi.fn((field: string, value: any) => { filters.push((row) => value === null ? row[field] == null : row[field] === value); return query; }),
        in: vi.fn((field: string, values: any[]) => { filters.push((row) => values.includes(row[field])); return query; }),
        or: vi.fn((value: string) => {
          const alternatives = value.split(',').map((expression) => {
            const [field, operator, ...parts] = expression.split('.');
            const match = parts.join('.');
            if (operator === 'is' && match === 'null') return (row: any) => row[field] == null;
            if (operator === 'eq') return (row: any) => String(row[field]) === match;
            throw new Error(`Unsupported fixture OR ${expression}`);
          });
          filters.push((row) => alternatives.some((test) => test(row))); return query;
        }),
        gt: vi.fn((field: string, value: any) => { filters.push((row) => row[field] > value); return query; }),
        order: vi.fn((field: string, value?: any) => { orders.push({ field, ascending: value?.ascending !== false }); return query; }),
        limit: vi.fn((value: number) => { maximum = value; return query; }),
        range: vi.fn((start: number, end: number) => { range = [start, end]; return query; }),
        update: vi.fn((value: any) => { operation = 'update'; input = value; return query; }),
        upsert: vi.fn((value: any, config: any) => { operation = 'upsert'; input = value; options = config; return query; }),
        insert: vi.fn((value: any) => { operation = 'insert'; input = value; return query; }),
        delete: vi.fn(() => { operation = 'delete'; return query; }),
        maybeSingle: vi.fn(() => execute(true)), single: vi.fn(() => execute(true)),
        then: (resolve: any, reject: any) => execute().then(resolve, reject),
      };
      return query;
    }),
  };
  return { db, tables, users, createUser, updateUserById, getUserById, deleteUser };
}
