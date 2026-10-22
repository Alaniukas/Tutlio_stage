import { describe, expect, it, vi } from 'vitest';
import { reassignOpenLessonsToTutor, removeOrgStudentTutorPairing, tutorPairingRemovalErrorKey } from '@/lib/reassignStudentTutorLessons';

function mockSb(handlers: Record<string, any>) {
  return {
    rpc: vi.fn(async () => ({ error: null })),
    from(table: string) {
      const h = handlers[table];
      if (!h) throw new Error(`unexpected table ${table}`);
      return h;
    },
  };
}

describe('reassignOpenLessonsToTutor', () => {
  it('updates active sessions and linked packages onto the new tutor pairing', async () => {
    const sessionUpdate = vi.fn(async () => ({ error: null }));
    const pkgUpdate = vi.fn(async () => ({ error: null }));
    const recUpdate = vi.fn(async () => ({ error: null }));

    const sb = mockSb({
      sessions: {
        select() {
          return {
            eq() {
              return {
                in: async () => ({
                  data: [
                    { id: 'sess-1', lesson_package_id: 'pkg-1' },
                    { id: 'sess-2', lesson_package_id: null },
                  ],
                  error: null,
                }),
              };
            },
          };
        },
        update(patch: unknown) {
          return { in: (col: string, ids: string[]) => sessionUpdate({ patch, col, ids }) };
        },
      },
      lesson_packages: {
        select() {
          return {
            eq() {
              return {
                is() {
                  return {
                    or: async () => ({ data: [{ id: 'pkg-open' }], error: null }),
                  };
                },
              };
            },
          };
        },
        update(patch: unknown) {
          return { in: (col: string, ids: string[]) => pkgUpdate({ patch, col, ids }) };
        },
      },
      recurring_individual_sessions: {
        update(patch: unknown) {
          return {
            eq() {
              return {
                eq: async () => recUpdate(patch),
              };
            },
          };
        },
      },
    });

    const result = await reassignOpenLessonsToTutor(sb as any, 'ieva-student', {
      studentId: 'rimantas-student',
      tutorId: 'rimantas',
    });

    expect(result.movedSessions).toBe(2);
    expect(sessionUpdate).toHaveBeenCalledWith({
      patch: { tutor_id: 'rimantas', student_id: 'rimantas-student' },
      col: 'id',
      ids: ['sess-1', 'sess-2'],
    });
    expect(pkgUpdate.mock.calls[0][0].ids.sort()).toEqual(['pkg-1', 'pkg-open'].sort());
    expect(recUpdate).toHaveBeenCalledWith({
      student_id: 'rimantas-student',
      tutor_id: 'rimantas',
    });
    expect(sb.rpc).toHaveBeenCalledWith('copy_student_parent_links_for_tutor_pairing', {
      p_source_student_id: 'ieva-student',
      p_target_student_id: 'rimantas-student',
    });
  });

  it('keeps student_id when the same pairing is claimed by a new tutor', async () => {
    const sessionUpdate = vi.fn(async () => ({ error: null }));
    const sb = mockSb({
      sessions: {
        select() {
          return {
            eq() {
              return {
                in: async () => ({
                  data: [{ id: 'sess-1', lesson_package_id: 'pkg-1' }],
                  error: null,
                }),
              };
            },
          };
        },
        update(patch: unknown) {
          return { in: (_c: string, ids: string[]) => sessionUpdate({ patch, ids }) };
        },
      },
      lesson_packages: {
        update(patch: unknown) {
          return { in: async (_c: string, ids: string[]) => ({ error: null, patch, ids }) };
        },
      },
      recurring_individual_sessions: {
        update() {
          return { eq() { return { eq: async () => ({ error: null }) }; } };
        },
      },
    });

    await reassignOpenLessonsToTutor(sb as any, 'same-row', {
      studentId: 'same-row',
      tutorId: 'rimantas',
    });

    expect(sessionUpdate.mock.calls[0][0].patch).toEqual({ tutor_id: 'rimantas' });
    expect(sb.rpc).not.toHaveBeenCalled();
  });

  it('does not move lessons or packages when preserving parent access fails', async () => {
    const from = vi.fn();
    const rpc = vi.fn(async () => ({ error: { message: 'Parent copy failed' } }));
    await expect(reassignOpenLessonsToTutor({ from, rpc } as any, 'old-row', {
      studentId: 'new-row', tutorId: 'new-tutor',
    })).rejects.toThrow('Parent copy failed');
    expect(from).not.toHaveBeenCalled();
  });
});

describe('removeOrgStudentTutorPairing', () => {
  it('uses one atomic stop operation even when exactly one other tutor remains', async () => {
    const rpc = vi.fn(async () => ({ data: { mode: 'detached', cancelledSessions: 34 }, error: null }));
    const from = vi.fn();
    await expect(removeOrgStudentTutorPairing({ rpc, from } as any, {
      rowId: 'lithuanian-card', expectedTutorId: 'lithuanian-tutor',
      remainingGroup: [{ id: 'math-card', tutor_id: 'math-tutor' }],
    })).resolves.toEqual({ mode: 'detached' });
    expect(rpc).toHaveBeenCalledExactlyOnceWith('remove_org_student_tutor_pairing', {
      p_student_id: 'lithuanian-card', p_expected_tutor_id: 'lithuanian-tutor',
      p_remaining_student_ids: ['math-card'],
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('passes every remaining family card, including an unassigned card', async () => {
    const rpc = vi.fn(async () => ({ data: { mode: 'detached' }, error: null }));
    await removeOrgStudentTutorPairing({ rpc } as any, {
      rowId: 'old', expectedTutorId: 'old-tutor', remainingGroup: [
        { id: 'first', tutor_id: 'one' }, { id: 'second', tutor_id: 'two' },
        { id: 'unassigned', tutor_id: null }, { id: 'first', tutor_id: 'one' },
      ],
    });
    expect(rpc.mock.calls[0][1].p_remaining_student_ids).toEqual(['first', 'second', 'unassigned']);
  });

  it('propagates transaction failures without falling back to individual writes', async () => {
    const error = { message: 'canceling statement due to statement timeout', code: '57014' };
    const rpc = vi.fn(async () => ({ error, data: null }));
    const from = vi.fn();
    await expect(removeOrgStudentTutorPairing({ rpc, from } as any, {
      rowId: 'old', expectedTutorId: 'tutor', remainingGroup: [],
    })).rejects.toEqual(error);
    expect(from).not.toHaveBeenCalled();
  });

  it('does not report success for an empty or malformed RPC response', async () => {
    await expect(removeOrgStudentTutorPairing({ rpc: async () => ({ data: null, error: null }) } as any, {
      rowId: 'old', expectedTutorId: 'tutor', remainingGroup: [],
    })).rejects.toThrow('Invalid tutor removal response');
  });

  it('explains billing review and stale assignments without exposing database messages', () => {
    expect(tutorPairingRemovalErrorKey({ message: 'tutor_pairing_billing_review_required' })).toBe('compStu.tutorRemovalBilling');
    expect(tutorPairingRemovalErrorKey({ message: 'tutor_pairing_changed' })).toBe('compStu.tutorRemovalChanged');
    expect(tutorPairingRemovalErrorKey({ message: 'sensitive database detail' })).toBe('compStu.tutorRemoveFailed');
  });
});
