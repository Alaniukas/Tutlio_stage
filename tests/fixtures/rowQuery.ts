// In-memory Supabase query adapter for synthetic tests; no network or secrets.
export type RowQueryLog = { table: string; filters: Array<[string, string, unknown]>; operation: string };
export function rowQuery(table: string, rowsForTable: (table: string) => any[], logs: RowQueryLog[] = [], writes: any[] = []) {
  const log = { table, filters: [] as RowQueryLog['filters'], operation: 'select' };
  logs.push(log);
  let singleton = false, offset = 0, maximum = Infinity, inserted: any, updated: any, head = false;
  const orders: Array<{ key: string; ascending: boolean }> = [];
  const get = (row: any, key: string) => key.split(/\.|->>/).reduce((value, segment) => value?.[segment], row);
  const matches = (row: any, [op, key, value]: RowQueryLog['filters'][number]): boolean => {
    const actual = get(row, key);
    if (op === 'eq') return actual === value;
    if (op === 'neq') return actual !== value;
    if (op === 'in') return (value as any[]).includes(actual);
    if (op === 'is') return value === null ? actual == null : actual === value;
    if (op === 'not') { const [kind, expected] = value as any[]; return !matches(row, [kind, key, expected]); }
    if (actual == null) return false;
    const dateColumn = /(?:_time|_at)$/.test(key);
    const a = dateColumn ? Date.parse(actual) : actual;
    const b = dateColumn ? Date.parse(String(value)) : value as any;
    if (op === 'gte') return a >= b;
    if (op === 'lte') return a <= b;
    if (op === 'gt') return a > b;
    if (op === 'lt') return a < b;
    if (op === 'overlaps') return actual.some((item: any) => (value as any[]).includes(item));
    throw new Error(`Unsupported QA query ${op}`);
  };
  const result = () => {
    let rows = rowsForTable(table).filter(row => log.filters.every(filter => matches(row, filter)));
    const count = rows.length;
    for (const { key, ascending } of [...orders].reverse()) rows = [...rows].sort((a, b) => {
      const x = get(a, key), y = get(b, key);
      return (x === y ? 0 : x < y ? -1 : 1) * (ascending ? 1 : -1);
    });
    rows = rows.slice(offset, maximum);
    if (inserted !== undefined) rows = (Array.isArray(inserted) ? inserted : [inserted]).map((row, index) => ({ id: `qa-created-${index}`, ...row }));
    if (updated !== undefined) rows = rows.map(row => ({ ...row, ...updated }));
    return { data: head ? null : singleton ? rows[0] || null : rows, count, error: null };
  };
  const q: any = {
    select: (_columns?: string, options?: { head?: boolean }) => { head = options?.head === true; return q; },
    order: (key: string, options?: { ascending?: boolean }) => { orders.push({ key, ascending: options?.ascending !== false }); return q; },
    limit: (value: number) => { maximum = value; return q; },
    range: (from: number, to: number) => { offset = from; maximum = to + 1; return q; },
    abortSignal: () => q,
    single: () => { singleton = true; return q; },
    maybeSingle: () => { singleton = true; return q; },
    insert: (value: any) => { log.operation = 'insert'; inserted = value; writes.push({ table, value }); return q; },
    update: (value: any) => { log.operation = 'update'; updated = value; writes.push({ table, value }); return q; },
    delete: () => { log.operation = 'delete'; writes.push({ table, value: null }); return q; },
    not: (key: string, op: string, value: unknown) => { log.filters.push(['not', key, [op, value]]); return q; },
    then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
  };
  for (const op of ['eq', 'neq', 'in', 'is', 'gte', 'lte', 'gt', 'lt', 'overlaps']) q[op] = (key: string, value: unknown) => {
    log.filters.push([op, key, value]); return q;
  };
  return q;
}
