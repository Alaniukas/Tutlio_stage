import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureStudentPairedWithTutor } from '@/lib/orgStudentPairing';
import { reassignOpenLessonsToTutor } from '@/lib/reassignStudentTutorLessons';

vi.mock('@/lib/reassignStudentTutorLessons', () => ({ reassignOpenLessonsToTutor: vi.fn(async () => ({})) }));
beforeEach(() => { vi.clearAllMocks(); });

type Row = Record<string, any>;
const source: Row = {
  id: 'original',organization_id: 'org',tutor_id: 'old-tutor',full_name: 'Denas',
  email: 'placeholder@example.test',payer_email: 'parent@example.test',
  linked_user_id: 'child-account',parent_user_id: 'parent-account',
};

function fixture(initial: Row[] = [source], failFamilyCopy = false, beforeClaim?: (rows: Row[]) => void) {
  const students = initial.map((row) => ({ ...row }));
  const operations: string[] = [];
  const rpc = vi.fn(async (name: string, args: Row) => {
    operations.push(name);
    if (name === 'copy_student_parent_links_for_tutor_pairing' && students.some((row) =>
      [args.p_source_student_id,args.p_target_student_id].includes(row.id) && row.detached_at,
    )) {
      return { data: null,error: { message: 'Student assignments do not represent the same child' } };
    }
    return { data: null,error: failFamilyCopy && name === 'copy_student_parent_links_for_tutor_pairing'
      ? { message: 'Family links unavailable' } : null };
  });
  const client = {
    rpc,
    from(table: string) {
      let action = 'select';
      let fields = '*';
      let payload: Row = {};
      const filters: Array<(row: Row) => boolean> = [];
      const run = () => {
        if (table === 'student_admin_notes') return { data: [],error: null };
        if (table !== 'students') throw new Error(`Unexpected table: ${table}`);
        if (action === 'update' && payload.tutor_id) beforeClaim?.(students);
        let rows = students.filter((row) => filters.every((filter) => filter(row)));
        if (action === 'insert') {
          rows = [{ ...payload,id: 'new-pairing' }];
          students.push(...rows);
        } else if (action === 'update') {
          operations.push('update-tutor');
          rows.forEach((row) => Object.assign(row,payload));
        } else if (action === 'delete') {
          operations.push('delete-pairing');
          rows.forEach((row) => students.splice(students.indexOf(row),1));
        }
        return { data: rows.map((row) => fields === '*' ? { ...row }
          : Object.fromEntries(fields.split(',').map((key) => [key.trim(),row[key.trim()]]))),error: null };
      };
      const query: any = {
        select(value: string) { fields = value;return query; },
        eq(key: string,value: unknown) { filters.push((row) => row[key] === value);return query; },
        is(key: string,value: unknown) { filters.push((row) => (row[key] ?? null) === value);return query; },
        ilike(key: string,value: string) { filters.push((row) => String(row[key]).toLowerCase() === value.toLowerCase());return query; },
        in(key: string,values: unknown[]) { filters.push((row) => values.includes(row[key]));return query; },
        insert(value: Row) { action = 'insert';payload = value;return query; },
        update(value: Row) { action = 'update';payload = value;return query; },
        delete() { action = 'delete';return query; },
        async maybeSingle() { const result = run();return { ...result,data: result.data[0] || null }; },
        async single() { const result = run();return { ...result,data: result.data[0] || null }; },
        then(resolve: any,reject: any) { return Promise.resolve().then(run).then(resolve,reject); },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { client,students,rpc,operations };
}

describe('organization tutor assignment family preservation', () => {
  it('carries the parent pointer and copies family links before returning a new tutor assignment', async () => {
    const f = fixture();
    expect(await ensureStudentPairedWithTutor(f.client,'original','new-tutor')).toBe('new-pairing');
    expect(f.students.find((row) => row.id === 'new-pairing')).toMatchObject({
      parent_user_id: 'parent-account',linked_user_id: 'child-account',tutor_id: 'new-tutor',
    });
    expect(f.rpc).toHaveBeenCalledWith('copy_student_parent_links_for_tutor_pairing',{
      p_source_student_id: 'original',p_target_student_id: 'new-pairing',
    });
    expect(f.students.find((row) => row.id === 'original')?.parent_user_id).toBe('parent-account');
  });

  it('repairs an existing assignment rather than inserting a duplicate', async () => {
    const f = fixture([source,{ ...source,id: 'existing',tutor_id: 'new-tutor',parent_user_id: null }]);
    expect(await ensureStudentPairedWithTutor(f.client,'original','new-tutor')).toBe('existing');
    expect(f.students).toHaveLength(2);
    expect(f.rpc).toHaveBeenCalledWith('copy_student_parent_links_for_tutor_pairing',{
      p_source_student_id: 'original',p_target_student_id: 'existing',
    });
  });

  it('checks family links even when the requested tutor already matches', async () => {
    const f = fixture();
    expect(await ensureStudentPairedWithTutor(f.client,'original','old-tutor')).toBe('original');
    expect(f.rpc).toHaveBeenCalledWith('copy_student_parent_links_for_tutor_pairing',{
      p_source_student_id: 'original',p_target_student_id: 'original',
    });
  });

  it('preserves family links before claiming a tutorless row and moving lessons', async () => {
    const f = fixture([{ ...source,tutor_id: null }]);
    await ensureStudentPairedWithTutor(f.client,'original','new-tutor');
    expect(f.operations.slice(0,2)).toEqual(['copy_student_parent_links_for_tutor_pairing','update-tutor']);
    expect(f.students[0]).toMatchObject({ tutor_id: 'new-tutor',parent_user_id: 'parent-account' });
    expect(reassignOpenLessonsToTutor).toHaveBeenCalledOnce();
  });

  it('does not claim a tutorless row or move lessons if preserving the family fails', async () => {
    const f = fixture([{ ...source,tutor_id: null }],true);
    await expect(ensureStudentPairedWithTutor(f.client,'original','new-tutor')).rejects.toThrow('Family links unavailable');
    expect(f.students[0].tutor_id).toBeNull();
    expect(reassignOpenLessonsToTutor).not.toHaveBeenCalled();
  });

  it('removes an unused new assignment if copying family links fails', async () => {
    const f = fixture([source],true);
    await expect(ensureStudentPairedWithTutor(f.client,'original','new-tutor')).rejects.toThrow('Family links unavailable');
    expect(f.students).toEqual([source]);
    expect(f.operations).toContain('delete-pairing');
  });

  it('does not return an existing assignment as ready when copying family links failed', async () => {
    const f = fixture([source,{ ...source,id: 'existing',tutor_id: 'new-tutor',parent_user_id: null }],true);
    await expect(ensureStudentPairedWithTutor(f.client,'original','new-tutor')).rejects.toThrow('Family links unavailable');
    expect(f.students).toHaveLength(2);
  });

  it('creates a live pairing without claiming a deleted tutorless duplicate or copying its notes', async () => {
    const archived = { ...source,id: 'archived',tutor_id: null,payer_email: null,
      detached_at: '2026-10-22T12:04:02Z',admin_comment: 'Archived instructions',
      admin_comment_visible_to_tutor: true };
    const f = fixture([{ ...source,parent_user_id: null },archived]);

    expect(await ensureStudentPairedWithTutor(f.client,'original','new-tutor')).toBe('new-pairing');

    expect(f.students.find((row) => row.id === 'archived')).toEqual(archived);
    expect(f.students.find((row) => row.id === 'new-pairing')).toMatchObject({
      tutor_id: 'new-tutor',payer_email: source.payer_email,parent_user_id: null,admin_comment: null,
    });
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith('copy_student_parent_links_for_tutor_pairing',{
      p_source_student_id: 'original',p_target_student_id: 'new-pairing',
    });
    expect(reassignOpenLessonsToTutor).not.toHaveBeenCalled();
  });

  it.each([true,false])('ignores a deleted target-tutor assignment (linked account: %s)', async (linked) => {
    const live = { ...source,linked_user_id: linked ? source.linked_user_id : null };
    const archived = { ...live,id: 'archived',tutor_id: 'new-tutor',
      detached_at: '2026-10-22T12:04:02Z' };
    const f = fixture([live,archived]);

    expect(await ensureStudentPairedWithTutor(f.client,'original','new-tutor')).toBe('new-pairing');

    expect(f.students.find((row) => row.id === 'archived')).toEqual(archived);
    expect(f.rpc).toHaveBeenCalledExactlyOnceWith('copy_student_parent_links_for_tutor_pairing',{
      p_source_student_id: 'original',p_target_student_id: 'new-pairing',
    });
  });

  it('claims a live tutorless assignment when an older deleted duplicate also exists', async () => {
    const archived = { ...source,id: 'archived',tutor_id: null,detached_at: '2026-10-22T12:04:02Z' };
    const f = fixture([source,archived,{ ...source,id: 'live-tutorless',tutor_id: null }]);

    expect(await ensureStudentPairedWithTutor(f.client,'original','new-tutor')).toBe('live-tutorless');

    expect(f.students.find((row) => row.id === 'archived')).toEqual(archived);
    expect(f.students.find((row) => row.id === 'live-tutorless')?.tutor_id).toBe('new-tutor');
    expect(reassignOpenLessonsToTutor).toHaveBeenCalledExactlyOnceWith(f.client,'live-tutorless',{
      studentId: 'live-tutorless',tutorId: 'new-tutor',
    });
  });

  it('stops a stale card before copying notes, parent links or lessons', async () => {
    const archived = { ...source,detached_at: '2026-10-22T12:04:02Z' };
    const f = fixture([archived]);
    await expect(ensureStudentPairedWithTutor(f.client,'original','new-tutor'))
      .rejects.toThrow('Student assignment changed; try again');
    expect(f.students).toEqual([archived]);
    expect(f.rpc).not.toHaveBeenCalled();
    expect(reassignOpenLessonsToTutor).not.toHaveBeenCalled();
  });

  it('stops if the selected card has been deleted instead of returning an unusable ID', async () => {
    const f = fixture([]);
    await expect(ensureStudentPairedWithTutor(f.client,'original','new-tutor'))
      .rejects.toThrow('Student assignment changed; try again');
    expect(f.students).toEqual([]);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('surfaces a failed source read before attempting an assignment', async () => {
    const f = fixture();
    const query: any = {
      select: () => query,eq: () => query,
      maybeSingle: async () => ({ data: null,error: { message: 'Connection unavailable' } }),
    };
    f.client.from = vi.fn(() => query);
    await expect(ensureStudentPairedWithTutor(f.client,'original','new-tutor'))
      .rejects.toThrow('Connection unavailable');
    expect(f.students).toEqual([source]);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it.each(['archive','assign'])('does not overwrite a concurrent %s or move its lessons', async (change) => {
    const f = fixture([{ ...source,tutor_id: null }],false,(rows) => {
      if (change === 'archive') rows[0].detached_at = '2026-10-22T12:04:02Z';
      else rows[0].tutor_id = 'another-tutor';
    });
    await expect(ensureStudentPairedWithTutor(f.client,'original','new-tutor'))
      .rejects.toThrow('Student assignment changed; try again');
    expect(f.students).toHaveLength(1);
    expect(f.students[0].tutor_id).toBe(change === 'archive' ? null : 'another-tutor');
    expect(reassignOpenLessonsToTutor).not.toHaveBeenCalled();
  });
});
