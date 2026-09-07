import { describe, expect, it, vi } from 'vitest';
import { ensureStudentPairedWithTutor } from '../../src/lib/orgStudentPairing';

describe('ensureStudentPairedWithTutor', () => {
  it('returns same row when already paired with tutor', async () => {
    const supabase = {
      from: vi.fn(() => {
        const builder: Record<string, unknown> = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({
            data: {
              id: 's1',
              tutor_id: 't1',
              linked_user_id: null,
              organization_id: 'org1',
              full_name: 'Ona',
              email: 'ona@x.lt',
              phone: null,
              grade: '5 klasė',
              payer_name: null,
              payer_email: null,
              payer_phone: null,
              child_birth_date: null,
              payment_model: null,
              preferred_availability: null,
            },
            error: null,
          })),
        };
        return builder;
      }),
    } as any;

    await expect(ensureStudentPairedWithTutor(supabase, 's1', 't1')).resolves.toBe('s1');
  });

  it('inserts duplicate row copying organization_id and grade', async () => {
    const insertPayloads: unknown[] = [];
    let maybeSingleCalls = 0;
    const supabase = {
      from: vi.fn(() => {
        const builder: Record<string, unknown> = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          update: vi.fn(() => builder),
          insert: vi.fn((payload: unknown) => {
            insertPayloads.push(payload);
            return builder;
          }),
          maybeSingle: vi.fn(async () => {
            maybeSingleCalls += 1;
            if (maybeSingleCalls === 1) {
              return {
                data: {
                  id: 's1',
                  tutor_id: 't-chem',
                  linked_user_id: 'u1',
                  organization_id: 'org1',
                  full_name: 'Ona',
                  email: 'ona@x.lt',
                  phone: '+37060000000',
                  grade: '8 klasė',
                  payer_name: 'Tėvas',
                  payer_email: 't@x.lt',
                  payer_phone: null,
                  child_birth_date: null,
                  payment_model: 'per_lesson',
                  preferred_availability: null,
                },
                error: null,
              };
            }
            return { data: null, error: null };
          }),
          single: vi.fn(async () => ({ data: { id: 's2' }, error: null })),
        };
        return builder;
      }),
    } as any;

    await expect(ensureStudentPairedWithTutor(supabase, 's1', 't-math')).resolves.toBe('s2');
    expect(insertPayloads).toHaveLength(1);
    expect(insertPayloads[0]).toMatchObject({
      tutor_id: 't-math',
      organization_id: 'org1',
      grade: '8 klasė',
      full_name: 'Ona',
      linked_user_id: 'u1',
    });
  });

  it('does not reuse a sibling row that only shares the parent login', async () => {
    const kajus = {
      id: 'kajus',
      tutor_id: 't-olga',
      linked_user_id: 'parent-1',
      organization_id: 'org1',
      full_name: 'Adomaitis Kajus Stasys',
      email: 'houseformykids@gmail.com',
      phone: null,
      grade: '2 klasė',
      payer_name: null,
      payer_email: 'houseformykids@gmail.com',
      payer_phone: null,
      child_birth_date: null,
      payment_model: null,
      preferred_availability: null,
    };
    const etme = { ...kajus, id: 'etme', tutor_id: null, full_name: 'Vitkutė Etmė' };
    const updatedIds: string[] = [];
    const supabase = {
      from: vi.fn(() => {
        const builder: Record<string, any> = {
          select: vi.fn(() => builder),
          in: vi.fn(() => builder),
          is: vi.fn(() => builder),
          or: vi.fn(() => builder),
          maybeSingle: vi.fn(async () => ({ data: etme, error: null })),
          eq: vi.fn((col: string, val: string) => {
            builder._eq = { col, val };
            return builder;
          }),
          update: vi.fn((payload: unknown) => {
            builder._update = payload;
            return builder;
          }),
          then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
            if (builder._update) {
              if (builder._eq?.col === 'id') updatedIds.push(builder._eq.val);
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            }
            if (builder._eq?.col === 'linked_user_id') {
              return Promise.resolve({ data: [kajus, etme], error: null }).then(resolve, reject);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          },
        };
        return builder;
      }),
    } as any;

    await expect(ensureStudentPairedWithTutor(supabase, 'etme', 't-olga')).resolves.toBe('etme');
    expect(updatedIds).toContain('etme');
    expect(updatedIds).not.toContain('kajus');
  });
});
