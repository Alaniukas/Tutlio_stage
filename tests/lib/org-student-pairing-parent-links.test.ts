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

function fixture(initial: Row[] = [source], failFamilyCopy = false) {
  const students = initial.map((row) => ({ ...row }));
  const operations: string[] = [];
  const rpc = vi.fn(async (name: string, args: Row) => {
    operations.push(name);
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
});
