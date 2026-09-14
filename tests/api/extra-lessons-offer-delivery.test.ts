import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  render: vi.fn(),
  db: null as any,
}));

vi.mock('../../api/_lib/orgAdminAccess.js', () => ({
  requireOrgAdminAccess: vi.fn(async () => ({ access: { organizationId: 'school-1' } })),
}));
vi.mock('../../api/_lib/extraLessonsPdf.js', () => ({
  renderAndStoreExtraLessonsPdf: state.render,
}));
vi.mock('../../api/_lib/extraLessonsContractShared.js', async (importOriginal) => ({
  ...await importOriginal<any>(),
  serviceSupabase: () => state.db,
}));

import handler from '../../api/extra-lessons-contract-offer';

function query(result: unknown) {
  const builder: any = {};
  for (const method of ['select', 'eq', 'order', 'limit']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => ({ data: result, error: null }));
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.render.mockRejectedValue(new Error('converter unavailable'));
  state.db = {
    from: vi.fn((table: string) => {
      if (table === 'organizations') {
        return query({
          id: 'school-1',
          name: 'School',
          features: { school_extra_lessons_contract: true },
          entity_type: 'school',
        });
      }
      if (table === 'school_contracts') {
        return query({
          id: 'contract-1',
          organization_id: 'school-1',
          student_id: 'student-1',
          contract_number: 'PP-1',
          kind: 'extra_lessons',
          pdf_url: null,
          filled_body: 'Contract body',
          template_id: null,
          order_snapshot: {
            service_name: 'Math',
            service_type: 'individual',
            duration_minutes: 60,
            start_date: '2026-09-15',
            end_date: '2027-06-01',
            unit_price_eur: 20,
            base_lessons_per_month: 4,
            indicative_monthly_eur: 80,
            schedule_label: 'Tuesday 16:00',
          },
        });
      }
      if (table === 'students') {
        return query({
          id: 'student-1',
          full_name: 'Student',
          payer_name: 'Parent',
          payer_email: 'parent@example.com',
        });
      }
      if (table === 'school_contract_completion_tokens') {
        return query({ token: 'still-valid', expires_at: '2099-01-01T00:00:00.000Z' });
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
});

it('does not send a resend email until a contract PDF exists', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  const response: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockImplementation((value) => value),
  };

  const result = await handler({
    method: 'POST',
    body: { contract_id: 'contract-1' },
    headers: {},
  } as any, response);

  expect(response.status).toHaveBeenCalledWith(503);
  expect(result).toMatchObject({ code: 'contract_pdf_generation_failed', emailSent: false });
  expect(fetch).not.toHaveBeenCalled();
});

it('discards a new offer instead of saving a sent contract without PDF', async () => {
  const deleted: Array<{ table: string; id?: string; contractId?: string }> = [];
  const fetch = vi.spyOn(globalThis, 'fetch');
  state.db = {
    from: vi.fn((table: string) => {
      const builder: any = {};
      for (const method of ['select', 'eq', 'order', 'limit', 'ilike']) {
        builder[method] = vi.fn(() => builder);
      }
      builder.maybeSingle = vi.fn(async () => {
        if (table === 'organizations') {
          return {
            data: {
              id: 'school-1',
              name: 'School',
              features: { school_extra_lessons_contract: true },
              entity_type: 'school',
            },
            error: null,
          };
        }
        if (table === 'students') {
          return {
            data: {
              id: 'student-1',
              full_name: 'Student',
              payer_name: 'Parent',
              payer_email: 'parent@example.com',
            },
            error: null,
          };
        }
        if (table === 'school_contract_templates') {
          return { data: null, error: null };
        }
        return { data: null, error: null };
      });
      builder.insert = vi.fn(() => {
        builder.then = (onFulfilled: any, onRejected: any) =>
          Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
        return builder;
      });
      builder.update = vi.fn(() => builder);
      builder.single = vi.fn(async () => ({
        data: table === 'school_contracts' ? { id: 'created-1', contract_number: 'PP-1' } : null,
        error: null,
      }));
      builder.delete = vi.fn(() => {
        builder.eq = vi.fn((column: string, value: string) => {
          if (column === 'id') deleted.push({ table, id: value });
          if (column === 'contract_id') deleted.push({ table, contractId: value });
          return Promise.resolve({ data: null, error: null });
        });
        return builder;
      });
      return builder;
    }),
  };

  const response: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockImplementation((value) => value),
  };
  const result = await handler({
    method: 'POST',
    body: { student_id: 'student-1', unit_price_eur: 6, send: true },
    headers: {},
  } as any, response);

  expect(response.status).toHaveBeenCalledWith(503);
  expect(result).toMatchObject({ code: 'contract_pdf_generation_failed', emailSent: false });
  expect(deleted).toEqual([
    { table: 'school_contract_completion_tokens', contractId: 'created-1' },
    { table: 'school_contracts', id: 'created-1' },
  ]);
  expect(fetch).not.toHaveBeenCalled();
});
