// Minimal in-memory Supabase stand-in for integration-style tests that need a
// stateful store shared across several real helpers (reserve -> pay -> release).
//
// It supports only the query shapes the exercised code paths use:
//   .select() .insert() .update() .delete()
//   .eq() .lt() .gt() .in() .not(col,'is',null) .order() .limit()
//   .maybeSingle() .single()
// Awaiting any builder resolves to `{ data, error }`. It is intentionally NOT a
// general Supabase mock — for handler-contract tests prefer a canned per-call
// stub instead.

export type Row = Record<string, any>;

class FakeQuery {
  private filters: Array<(r: Row) => boolean> = [];
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: any = null;
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;
  private singleMode: 'maybe' | 'one' | null = null;

  constructor(private store: Record<string, Row[]>, private table: string) {}

  private rows(): Row[] {
    if (!this.store[this.table]) this.store[this.table] = [];
    return this.store[this.table];
  }

  select(_cols?: string): this {
    return this; // returning-rows hint; never overrides insert/update/delete
  }
  insert(rows: Row | Row[]): this {
    this.op = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row): this {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  delete(): this {
    this.op = 'delete';
    return this;
  }
  eq(col: string, val: any): this { this.filters.push((r) => r[col] === val); return this; }
  neq(col: string, val: any): this { this.filters.push((r) => r[col] !== val); return this; }
  lt(col: string, val: any): this { this.filters.push((r) => r[col] != null && r[col] < val); return this; }
  gt(col: string, val: any): this { this.filters.push((r) => r[col] != null && r[col] > val); return this; }
  in(col: string, vals: any[]): this { const s = new Set(vals); this.filters.push((r) => s.has(r[col])); return this; }
  not(col: string, _op: string, _val: any): this {
    this.filters.push((r) => r[col] !== null && r[col] !== undefined); // only used as not(col,'is',null)
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number): this { this.limitN = n; return this; }
  maybeSingle(): this { this.singleMode = 'maybe'; return this; }
  single(): this { this.singleMode = 'one'; return this; }

  private match(): Row[] {
    let out = this.rows().filter((r) => this.filters.every((f) => f(r)));
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out = [...out].sort((a, b) => (a[col] === b[col] ? 0 : a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1));
    }
    if (this.limitN != null) out = out.slice(0, this.limitN);
    return out;
  }

  private run(): { data: any; error: null } {
    if (this.op === 'insert') {
      const inserted = (this.payload as Row[]).map((r) => ({ ...r }));
      for (const r of inserted) this.rows().push(r);
      return { data: this.singleMode ? inserted[0] ?? null : inserted.map((r) => ({ ...r })), error: null };
    }
    if (this.op === 'update') {
      const matched = this.match();
      for (const r of matched) Object.assign(r, this.payload);
      const data = matched.map((r) => ({ ...r }));
      return { data: this.singleMode ? data[0] ?? null : data, error: null };
    }
    if (this.op === 'delete') {
      const matched = new Set(this.match());
      this.store[this.table] = this.rows().filter((r) => !matched.has(r));
      return { data: null, error: null };
    }
    const rows = this.match().map((r) => ({ ...r }));
    return { data: this.singleMode ? rows[0] ?? null : rows, error: null };
  }

  then(onFulfilled: (v: { data: any; error: null }) => any, onRejected?: (e: any) => any) {
    return new Promise((resolve) => resolve(this.run())).then(onFulfilled, onRejected);
  }
}

export class FakeSupabase {
  db: Record<string, Row[]> = {};
  from(table: string) {
    return new FakeQuery(this.db, table);
  }
}
