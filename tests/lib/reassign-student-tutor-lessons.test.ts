import { describe, expect, it, vi } from 'vitest';
import {
  canHardDeleteStudentPairing,
  reassignOpenLessonsToTutor,
  removeOrgStudentTutorPairing,
  targetPairingForRemovedRow,
} from '@/lib/reassignStudentTutorLessons';

describe('targetPairingForRemovedRow', () => {
  it('moves lessons when exactly one other tutor pairing remains', () => {
    expect(
      targetPairingForRemovedRow([{ id: 'rimantas-row', tutor_id: 'rimantas' }]),
    ).toEqual({ id: 'rimantas-row', tutorId: 'rimantas' });
  });

  it('does not guess when several tutors remain or none have a tutor', () => {
    expect(targetPairingForRemovedRow([])).toBeNull();
    expect(targetPairingForRemovedRow([{ id: 'a', tutor_id: null }])).toBeNull();
    expect(
      targetPairingForRemovedRow([
        { id: 'a', tutor_id: 't1' },
        { id: 'b', tutor_id: 't2' },
      ]),
    ).toBeNull();
  });
});

describe('canHardDeleteStudentPairing', () => {
  it('never deletes the last pairing row', () => {
    expect(canHardDeleteStudentPairing(0, 0)).toBe(false);
  });

  it('does not delete a row that still has sessions or packages', () => {
    expect(canHardDeleteStudentPairing(1, 2)).toBe(false);
  });

  it('deletes an empty extra pairing', () => {
    expect(canHardDeleteStudentPairing(1, 0)).toBe(true);
  });
});

function mockSb(handlers: Record<string, any>) {
  return {
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
  });
});

describe('removeOrgStudentTutorPairing', () => {
  it('moves open lessons then deletes the empty Ieva pairing', async () => {
    const deleted: string[] = [];
    let sessionsSelectCalls = 0;
    const from = (table: string) => {
      if (table === 'sessions') {
        return {
          select(cols: string) {
            sessionsSelectCalls += 1;
            if (cols.includes('lesson_package_id')) {
              return {
                eq() {
                  return {
                    in: async () => ({ data: [{ id: 's1', lesson_package_id: null }], error: null }),
                  };
                },
              };
            }
            return {
              eq() {
                return { limit: async () => ({ data: [], error: null }) };
              },
            };
          },
          update() {
            return { in: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'lesson_packages') {
        return {
          select(cols: string) {
            if (cols === 'id') {
              return {
                eq() {
                  return {
                    is() {
                      return { or: async () => ({ data: [], error: null }) };
                    },
                    limit: async () => ({ data: [], error: null }),
                  };
                },
              };
            }
            return {
              eq() {
                return { limit: async () => ({ data: [], error: null }) };
              },
            };
          },
          update() {
            return { in: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'recurring_individual_sessions') {
        return {
          update() {
            return { eq() { return { eq: async () => ({ error: null }) }; } };
          },
        };
      }
      if (table === 'students') {
        return {
          delete() {
            return {
              eq: async (_c: string, id: string) => {
                deleted.push(id);
                return { error: null };
              },
            };
          },
        };
      }
      throw new Error(table);
    };

    const result = await removeOrgStudentTutorPairing({ from } as any, {
      rowId: 'ieva-row',
      remainingGroup: [{ id: 'rimantas-row', tutor_id: 'rimantas' }],
    });
    expect(result.mode).toBe('deleted');
    expect(deleted).toEqual(['ieva-row']);
    expect(sessionsSelectCalls).toBeGreaterThanOrEqual(2);
  });

  it('detaches instead of deleting when past lessons remain on the old row', async () => {
    const detached: string[] = [];
    const from = (table: string) => {
      if (table === 'sessions') {
        return {
          select(cols: string) {
            if (cols.includes('lesson_package_id')) {
              return {
                eq() {
                  return { in: async () => ({ data: [], error: null }) };
                },
              };
            }
            return {
              eq() {
                return { limit: async () => ({ data: [{ id: 'old-completed' }], error: null }) };
              },
            };
          },
          update() {
            return { in: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'lesson_packages') {
        return {
          select() {
            return {
              eq() {
                return {
                  is() {
                    return { or: async () => ({ data: [], error: null }) };
                  },
                  limit: async () => ({ data: [], error: null }),
                };
              },
            };
          },
          update() {
            return { in: async () => ({ error: null }) };
          },
        };
      }
      if (table === 'recurring_individual_sessions') {
        return {
          update() {
            return { eq() { return { eq: async () => ({ error: null }) }; } };
          },
        };
      }
      if (table === 'students') {
        return {
          update() {
            return {
              eq: async (_c: string, id: string) => {
                detached.push(id);
                return { error: null };
              },
            };
          },
        };
      }
      throw new Error(table);
    };

    const result = await removeOrgStudentTutorPairing({ from } as any, {
      rowId: 'ieva-row',
      remainingGroup: [{ id: 'rimantas-row', tutor_id: 'rimantas' }],
    });
    expect(result.mode).toBe('detached');
    expect(detached).toEqual(['ieva-row']);
  });
});
