import { describe, expect, it, vi } from 'vitest';
import { ensureStudentPairedWithTutor } from '../../src/lib/orgStudentPairing';

describe('ensureStudentPairedWithTutor', () => {
  function pairingClient(options: {
    visible?: boolean;
    privateNote?: { admin_comment: string; last_contacted_at: string } | null;
    privateNotes?: Array<{ student_id: string; admin_comment: string; last_contacted_at: string }>;
    copyError?: { message: string } | null;
    notesError?: { message: string } | null;
    source?: Record<string, unknown>;
    siblings?: Array<Record<string, unknown>>;
  } = {}) {
    const inserted: Record<string, unknown>[] = [];
    const deleted: string[] = [];
    const updated: Array<{ id: string; payload: Record<string, unknown> }> = [];
    const student = {
      id: 'source-child', tutor_id: 'old-tutor', linked_user_id: null,
      organization_id: 'org1', full_name: 'Source Child', email: 'child@example.com',
      phone: null, grade: '5 klasė', payer_name: null, payer_email: null,
      payer_phone: null, child_birth_date: null, payment_model: null, preferred_availability: null,
      admin_comment: options.visible === false ? 'Legacy private text' : 'Tutor instructions',
      admin_comment_visible_to_tutor: options.visible !== false,
      ...options.source,
    };
    const client = {
      rpc: vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ error: options.copyError || null })),
      from: vi.fn((table: string) => {
        const builder: Record<string, any> = {
          select: vi.fn(() => builder),
          eq: vi.fn((column: string, value: string) => {
            builder._eq = { column, value };
            if (builder._delete) deleted.push(value);
            return builder;
          }),
          in: vi.fn(() => builder),
          update: vi.fn((payload: Record<string, unknown>) => { builder._update = payload; return builder; }),
          insert: vi.fn((payload: Record<string, unknown>) => { inserted.push(payload); return builder; }),
          delete: vi.fn(() => { builder._delete = true; return builder; }),
          maybeSingle: vi.fn(async () => ({ data: table === 'student_admin_notes' ? options.privateNote || null : student, error: null })),
          single: vi.fn(async () => ({ data: { id: inserted.length <= 1 ? 'new-pairing' : `new-pairing-${inserted.length}` }, error: null })),
          then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
            if (builder._update && table === 'students') updated.push({ id: builder._eq.value, payload: builder._update });
            if (table === 'student_admin_notes') {
              const notes = options.privateNotes || (options.privateNote ? [{ student_id: student.id, ...options.privateNote }] : []);
              return Promise.resolve({ data: notes, error: options.notesError || null }).then(resolve, reject);
            }
            if (table === 'students' && builder._eq?.column === 'linked_user_id') {
              return Promise.resolve({ data: (options.siblings || []).map((row) => ({ ...student, ...row })), error: null }).then(resolve, reject);
            }
            return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          },
        };
        return builder;
      }),
    };
    return { client, inserted, deleted, updated, student };
  }

  it('returns same row when already paired with tutor', async () => {
    const supabase = {
      from: vi.fn(() => {
        const builder: Record<string, unknown> = {
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          in: vi.fn(() => builder),
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
          in: vi.fn(() => builder),
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

  it('copies separate tutor instructions and private notes to the new tutor pairing', async () => {
    const { client, inserted } = pairingClient({
      privateNote: { admin_comment: 'Administration only', last_contacted_at: '2026-09-30' },
    });
    await expect(ensureStudentPairedWithTutor(client as any, 'source-child', 'new-tutor')).resolves.toBe('new-pairing');
    expect(inserted[0]).toMatchObject({ admin_comment: 'Tutor instructions', admin_comment_visible_to_tutor: true });
    expect(JSON.stringify(inserted)).not.toContain('Administration only');
    expect(client.rpc).toHaveBeenCalledWith('save_student_notes', {
      p_student_ids: ['source-child', 'new-pairing'], p_admin_comment: 'Administration only',
      p_last_contacted_at: '2026-09-30', p_tutor_comment: 'Tutor instructions',
    });
    expect(client.from).toHaveBeenCalledWith('student_admin_notes');
  });

  it('never copies an older hidden comment into the new tutor-visible comment', async () => {
    const { client, inserted } = pairingClient({ visible: false });
    await ensureStudentPairedWithTutor(client as any, 'source-child', 'new-tutor');
    expect(inserted[0]).toMatchObject({ admin_comment: null, admin_comment_visible_to_tutor: true });
    expect(JSON.stringify(inserted)).not.toContain('Legacy private text');
  });

  it('undoes a new pairing when administration note copying fails so retries do not lose notes', async () => {
    const { client, deleted } = pairingClient({
      privateNote: { admin_comment: 'Administration only', last_contacted_at: '2026-09-30' },
      copyError: { message: 'Insufficient student administration permission' },
    });
    await expect(ensureStudentPairedWithTutor(client as any, 'source-child', 'new-tutor'))
      .rejects.toThrow('Insufficient student administration permission');
    expect(deleted).toEqual(['new-pairing']);
  });

  it('inherits instructions and merged private history from verified same-child pairings when the selected row is blank', async () => {
    const { client, inserted } = pairingClient({
      source: { linked_user_id: 'child-auth', admin_comment: null },
      siblings: [
        { id: 'populated', tutor_id: 'second-tutor', admin_comment: 'Existing tutor instructions' },
        { id: 'duplicate', tutor_id: 'third-tutor', admin_comment: 'Existing tutor instructions' },
        { id: 'different-instructions', tutor_id: 'fourth-tutor', admin_comment: 'Further instructions' },
        { id: 'same-parent-different-child', full_name: 'Different Child', admin_comment: 'Sibling-specific secret' },
        { id: 'other-login', linked_user_id: 'another-auth', admin_comment: 'Unverified login secret' },
        { id: 'other-org', organization_id: 'other-org', admin_comment: 'Other organization secret' },
      ],
      privateNotes: [
        { student_id: 'source-child', admin_comment: 'Earlier history', last_contacted_at: '2026-09-01' },
        { student_id: 'populated', admin_comment: 'Latest history', last_contacted_at: '2026-09-30' },
      ],
    });
    await ensureStudentPairedWithTutor(client as any, 'source-child', 'new-tutor');
    expect(inserted[0].admin_comment).toBe('Existing tutor instructions\n\nFurther instructions');
    expect(JSON.stringify(inserted)).not.toMatch(/Sibling-specific|Unverified|Other organization/);
    expect(client.rpc).toHaveBeenCalledWith('save_student_notes', {
      p_student_ids: ['source-child', 'populated', 'duplicate', 'different-instructions', 'new-pairing'], p_admin_comment: 'Earlier history\n\nLatest history',
      p_last_contacted_at: '2026-09-30', p_tutor_comment: 'Existing tutor instructions\n\nFurther instructions',
    });
  });

  it('does not infer another pairing from a shared email or payer contact without a linked account', async () => {
    const { client, inserted } = pairingClient({ source: { linked_user_id: null, admin_comment: null },
      siblings: [{ id: 'unverified', admin_comment: 'Must remain separate' }] });
    await ensureStudentPairedWithTutor(client as any, 'source-child', 'new-tutor');
    expect(inserted[0].admin_comment).toBeNull();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('saves inherited notes before claiming a blank tutorless same-child pairing', async () => {
    const { client, inserted, updated } = pairingClient({
      source: { linked_user_id: 'child-auth', admin_comment: 'Tutor instructions' },
      siblings: [{ id: 'tutorless', tutor_id: null, admin_comment: null }],
      privateNotes: [{ student_id: 'source-child', admin_comment: 'History', last_contacted_at: '2026-09-30' }],
    });
    await expect(ensureStudentPairedWithTutor(client as any, 'source-child', 'new-tutor')).resolves.toBe('tutorless');
    expect(inserted).toHaveLength(0);
    expect(client.rpc).toHaveBeenCalledWith('save_student_notes', {
      p_student_ids: ['source-child', 'tutorless'], p_admin_comment: 'History', p_last_contacted_at: '2026-09-30', p_tutor_comment: 'Tutor instructions',
    });
    expect(updated).toEqual([{ id: 'tutorless', payload: { tutor_id: 'new-tutor' } }]);
  });

  it('leaves the tutorless row unclaimed if the notes RPC fails', async () => {
    const { client, inserted, updated } = pairingClient({
      source: { linked_user_id: 'child-auth' },
      siblings: [{ id: 'tutorless', tutor_id: null, admin_comment: null }],
      copyError: { message: 'Notes schema is unavailable' },
    });
    await expect(ensureStudentPairedWithTutor(client as any, 'source-child', 'new-tutor')).rejects.toThrow('Notes schema is unavailable');
    expect(updated).toHaveLength(0);
    expect(inserted).toHaveLength(0);
  });

  it('leaves a legacy tutorless row untouched if private notes cannot be loaded', async () => {
    const { client, inserted, updated } = pairingClient({
      source: { tutor_id: null }, notesError: { message: 'Private notes relation unavailable' },
    });
    await expect(ensureStudentPairedWithTutor(client as any, 'source-child', 'new-tutor')).rejects.toThrow('Private notes relation unavailable');
    expect(updated).toHaveLength(0);
    expect(inserted).toHaveLength(0);
  });

  it('keeps merged instructions stable when another tutor is assigned later', async () => {
    const options = {
      source: { linked_user_id: 'child-auth', admin_comment: 'Alpha' },
      siblings: [{ id: 'beta-pairing', tutor_id: 'beta-tutor', admin_comment: 'Beta' }],
    };
    const { client, inserted, student } = pairingClient(options);
    // Model the atomic RPC's effect on the rows returned by later reads.
    client.rpc.mockImplementation(async (_name, args) => {
      const ids = args.p_student_ids as string[];
      const shared = args.p_tutor_comment as string;
      if (ids.includes(student.id)) student.admin_comment = shared;
      options.siblings.forEach((row) => { if (ids.includes(row.id)) row.admin_comment = shared; });
      return { error: null };
    });
    await ensureStudentPairedWithTutor(client as any, 'source-child', 'first-new-tutor');
    expect(inserted[0].admin_comment).toBe('Alpha\n\nBeta');
    expect(options.siblings[0].admin_comment).toBe('Alpha\n\nBeta');
    options.siblings.push({ id: 'new-pairing', tutor_id: 'first-new-tutor', admin_comment: String(inserted[0].admin_comment) });
    await ensureStudentPairedWithTutor(client as any, 'source-child', 'second-new-tutor');
    expect(inserted[1].admin_comment).toBe('Alpha\n\nBeta');
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });
});
