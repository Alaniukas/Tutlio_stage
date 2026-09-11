import { vi } from 'vitest';
import type { SchoolContractFlowDb } from './schoolContractFlowDb';

type Filters = Record<string, unknown>;

function match(row: Record<string, unknown>, filters: Filters): boolean {
  return Object.entries(filters).every(([k, v]) => row[k] === v);
}

function contractRow(db: SchoolContractFlowDb, extra: Record<string, unknown> = {}) {
  return {
    ...db.contract,
    template: { pdf_url: db.template.pdf_url },
    organizations: { name: db.org.name, email: db.org.email, entity_type: db.org.entity_type },
    org: { ...db.org },
    student: {
      id: db.student.id,
      full_name: db.student.full_name,
      email: db.student.email,
      invite_code: db.student.invite_code,
      payer_email: db.student.payer_email,
      payer_name: db.student.payer_name,
      parent_secondary_email: db.student.parent_secondary_email,
      parent_secondary_name: db.student.parent_secondary_name,
    },
    ...extra,
  };
}

function resolveMany(db: SchoolContractFlowDb, table: string, filters: Filters) {
  if (table === 'school_payment_installments') {
    let rows = [...db.installments];
    if (filters.contract_id) rows = rows.filter((r) => r.contract_id === filters.contract_id);
    return rows.map((row) => ({
      ...row,
      contract: {
        ...db.contract,
        student: { ...db.student },
        org: { ...db.org },
      },
    }));
  }
  return [];
}

async function resolveSingle(db: SchoolContractFlowDb, table: string, filters: Filters) {
  if (table === 'organization_admins') {
    const ok =
      filters.user_id === db.adminUserId &&
      (filters.organization_id === undefined || filters.organization_id === db.org.id);
    return {
      data: ok ? {
        id: 'oa-1',
        organization_id: db.org.id,
        user_id: db.adminUserId,
        role: 'owner',
        status: 'active',
        permissions: {},
        accepted_at: '2026-01-01T00:00:00.000Z',
      } : null,
      error: null,
    };
  }
  if (table === 'organizations') {
    if (filters.id === db.org.id) return { data: { ...db.org }, error: null };
    return { data: null, error: null };
  }
  if (table === 'students') {
    if (filters.id === db.student.id || match(db.student as any, filters)) {
      return { data: { ...db.student }, error: null };
    }
    return { data: null, error: null };
  }
  if (table === 'school_contracts') {
    if (filters.id === db.contract.id || match(db.contract as any, filters)) {
      return { data: contractRow(db), error: null };
    }
    return { data: null, error: null };
  }
  if (table === 'school_contract_templates') {
    if (filters.id === db.template.id) return { data: { ...db.template }, error: null };
    return { data: null, error: null };
  }
  if (table === 'school_contract_completion_tokens') {
    const t = db.tokens.find((row) => match(row as Record<string, unknown>, filters));
    return { data: t ? { ...t } : null, error: null };
  }
  if (table === 'school_payment_installments') {
    let rows = [...db.installments];
    if (filters.id) rows = rows.filter((r) => r.id === filters.id);
    if (filters.contract_id) rows = rows.filter((r) => r.contract_id === filters.contract_id);
    if (filters.payment_status) rows = rows.filter((r) => r.payment_status === filters.payment_status);
    const row = rows[0];
    if (!row) return { data: null, error: null };
    return {
      data: {
        ...row,
        contract: contractRow(db, {
          student: { ...db.student },
          org: { ...db.org },
        }),
      },
      error: null,
    };
  }
  return { data: null, error: null };
}

function applyUpdate(db: SchoolContractFlowDb, table: string, filters: Filters, payload: Record<string, unknown>) {
  if (table === 'school_contracts') {
    if (filters.id === db.contract.id || match(db.contract as any, filters)) Object.assign(db.contract, payload);
    return;
  }
  if (table === 'students') {
    if (filters.id === db.student.id || match(db.student as any, filters)) Object.assign(db.student, payload);
    return;
  }
  if (table === 'school_contract_completion_tokens') {
    const t = db.tokens.find((x) => match(x as any, filters) || x.token === filters.token);
    if (t) Object.assign(t, payload);
    return;
  }
  if (table === 'school_payment_installments') {
    const inst = db.installments.find((x) => match(x as any, filters) || x.id === filters.id);
    if (inst) Object.assign(inst, payload);
  }
}

function resolveInsert(db: SchoolContractFlowDb, table: string, row: Record<string, unknown>) {
  if (table === 'school_contract_completion_tokens') {
    const inserted = db.insertToken(String(row.contract_id), String(row.token), String(row.expires_at));
    return { data: inserted, error: null };
  }
  return { data: row, error: null };
}

function buildChain(db: SchoolContractFlowDb, table: string) {
  const filters: Filters = {};
  const excluded: Filters = {};
  const included: Record<string, unknown[]> = {};
  let updatePayload: Record<string, unknown> = {};

  const queryRows = () => resolveMany(db, table, filters).filter((row) => (
    Object.entries(excluded).every(([column, value]) => row[column] !== value)
    && Object.entries(included).every(([column, values]) => values.includes(row[column]))
  ));

  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return chain;
    }),
    neq: vi.fn((col: string, val: unknown) => {
      excluded[col] = val;
      return chain;
    }),
    in: vi.fn((col: string, values: unknown[]) => {
      included[col] = values;
      return chain;
    }),
    limit: vi.fn(() => chain),
    is: vi.fn(() => chain),
    order: vi.fn(async () => ({ data: queryRows(), error: null })),
    maybeSingle: vi.fn(async () => resolveSingle(db, table, filters)),
    single: vi.fn(async () => {
      const r = await resolveSingle(db, table, filters);
      if (!r.data) return { data: null, error: { message: 'not found' } };
      return r;
    }),
    insert: vi.fn(async (payload: Record<string, unknown> | Record<string, unknown>[]) => {
      const row = Array.isArray(payload) ? payload[0] : payload;
      return resolveInsert(db, table, row);
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      updatePayload = payload;
      const commitUpdate = async () => {
        const installmentBefore =
          table === 'school_payment_installments'
            ? db.installments.find((x) => match(x as Record<string, unknown>, filters))
            : null;
        applyUpdate(db, table, filters, updatePayload);
        if (installmentBefore) {
          const updated = db.installments.find((x) => x.id === installmentBefore.id);
          return { data: updated ? { ...updated } : null, error: null };
        }
        return resolveSingle(db, table, filters);
      };
      const updateChain: any = {
        eq: vi.fn((col: string, val: unknown) => {
          filters[col] = val;
          return updateChain;
        }),
        select: vi.fn(() => ({
          maybeSingle: vi.fn(async () => {
            const r = await commitUpdate();
            return { data: r.data, error: null };
          }),
        })),
        maybeSingle: vi.fn(async () => {
          const r = await commitUpdate();
          return { data: r.data, error: null };
        }),
        then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
          return commitUpdate().then((r) => onFulfilled({ data: r.data, error: null }), onRejected);
        },
      };
      return updateChain;
    }),
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: queryRows(), error: null }).then(onFulfilled, onRejected);
    },
  };

  return chain;
}

export function createMockSupabaseClient(db: SchoolContractFlowDb) {
  const from = vi.fn((table: string) => buildChain(db, table));

  const storageFrom = vi.fn(() => ({
    download: vi.fn(async (path: string) => {
      const buf = db.storageFiles.get(path);
      if (!buf) return { data: null, error: { message: 'not found' } };
      return { data: new Blob([buf]), error: null };
    }),
    upload: vi.fn(async (path: string) => {
      db.storageFiles.set(path, Buffer.from('%PDF-uploaded'));
      if (path.includes('/contracts/')) db.contract.pdf_url = path;
      return { data: { path }, error: null };
    }),
    createSignedUrl: vi.fn(async (path: string) => ({
      data: { signedUrl: `https://signed.example/${encodeURIComponent(path)}` },
      error: null,
    })),
  }));

  return {
    from,
    storage: { from: storageFrom },
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: db.adminUserId } }, error: null })),
    },
  };
}

