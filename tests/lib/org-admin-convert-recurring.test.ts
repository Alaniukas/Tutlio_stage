import { describe, it, expect, vi } from 'vitest';
import {
  assertTutorSlotsFree,
  convertOrgAdminSessionToRecurring,
  filterRowsAgainstBusyTutorSlots,
  insertSessionRowsInChunks,
  ORG_ADMIN_SESSION_INSERT_CHUNK,
  resolveOrCreateTrialSubject,
  SessionRowsInsertError,
} from '@/pages/company/orgAdminSessionCreate';
import { PRO_KLASE_QA_ORG_ID } from '@/lib/marketMoney';

function mockSupabaseForSlotCheck(busyRows: Array<{ id: string; start_time: string; end_time: string }>) {
  const from = vi.fn((table: string) => {
    if (table !== 'sessions') throw new Error(`unexpected table ${table}`);
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      lt: vi.fn(() => chain),
      gt: vi.fn(async () => ({ data: busyRows, error: null })),
    };
    return chain;
  });
  return { from } as unknown as import('@supabase/supabase-js').SupabaseClient;
}

describe('assertTutorSlotsFree excludeSessionIds', () => {
  it('ignores conflicts on excluded session ids', async () => {
    const supabase = mockSupabaseForSlotCheck([
      {
        id: 'anchor-session',
        start_time: '2026-09-17T15:00:00.000Z',
        end_time: '2026-09-17T16:00:00.000Z',
      },
    ]);
    await expect(
      assertTutorSlotsFree(
        supabase,
        'tutor-1',
        [{ start: new Date('2026-09-17T15:00:00.000Z'), end: new Date('2026-09-17T16:00:00.000Z') }],
        ['anchor-session'],
      ),
    ).resolves.toBeUndefined();
  });

  it('still blocks when another session overlaps', async () => {
    const supabase = mockSupabaseForSlotCheck([
      {
        id: 'other-session',
        start_time: '2026-09-17T15:00:00.000Z',
        end_time: '2026-09-17T16:00:00.000Z',
      },
    ]);
    await expect(
      assertTutorSlotsFree(
        supabase,
        'tutor-1',
        [{ start: new Date('2026-09-17T15:00:00.000Z'), end: new Date('2026-09-17T16:00:00.000Z') }],
        ['anchor-session'],
      ),
    ).rejects.toThrow();
  });
});

describe('filterRowsAgainstBusyTutorSlots', () => {
  it('keeps free weeks and skips only the overlapping occurrence', () => {
    const rows = [
      { start_time: '2026-09-15T13:00:00.000Z', end_time: '2026-09-15T14:00:00.000Z', topic: 'week1' },
      { start_time: '2026-09-22T13:00:00.000Z', end_time: '2026-09-22T14:00:00.000Z', topic: 'week2' },
    ];
    const kept = filterRowsAgainstBusyTutorSlots(rows, [
      {
        id: 'busy',
        start_time: '2026-09-15T13:00:00.000Z',
        end_time: '2026-09-15T14:00:00.000Z',
      },
    ]);
    expect(kept.map((row) => row.topic)).toEqual(['week2']);
  });

  it('ignores the excluded anchor lesson when converting a series', () => {
    const rows = [
      { start_time: '2026-09-22T13:00:00.000Z', end_time: '2026-09-22T14:00:00.000Z' },
    ];
    const kept = filterRowsAgainstBusyTutorSlots(
      rows,
      [{
        id: 'anchor-session',
        start_time: '2026-09-22T13:00:00.000Z',
        end_time: '2026-09-22T14:00:00.000Z',
      }],
      new Set(['anchor-session']),
    );
    expect(kept).toHaveLength(1);
  });
});

describe('insertSessionRowsInChunks', () => {
  it('splits a long series into several inserts', async () => {
    const insertSizes: number[] = [];
    const from = vi.fn(() => ({
      insert: vi.fn((chunk: Array<{ start_time: string }>) => {
        insertSizes.push(chunk.length);
        return {
          select: vi.fn(async () => ({
            data: chunk.map((row, index) => ({
              id: `id-${insertSizes.length}-${index}`,
              student_id: 'st',
              paid: false,
              start_time: row.start_time,
              end_time: row.start_time,
            })),
            error: null,
          })),
        };
      }),
    }));
    const rows = Array.from({ length: 45 }, (_, i) => ({
      start_time: `2026-09-${String(10 + (i % 20)).padStart(2, '0')}T13:00:00.000Z`,
      end_time: `2026-09-${String(10 + (i % 20)).padStart(2, '0')}T14:00:00.000Z`,
    }));
    const inserted = await insertSessionRowsInChunks(
      { from } as unknown as import('@supabase/supabase-js').SupabaseClient,
      rows,
    );
    expect(insertSizes).toEqual([ORG_ADMIN_SESSION_INSERT_CHUNK, ORG_ADMIN_SESSION_INSERT_CHUNK, 5]);
    expect(inserted).toHaveLength(45);
  });

  it('keeps the successfully inserted rows on a later chunk error so callers can compensate', async () => {
    let call = 0;
    const from = vi.fn(() => ({
      insert: vi.fn((chunk: Array<{ start_time: string }>) => ({
        select: vi.fn(async () => {
          call += 1;
          if (call === 2) return { data: null, error: { message: 'second chunk failed' } };
          return {
            data: chunk.map((row, index) => ({
              id: `inserted-${index}`,
              student_id: 'student-1',
              paid: false,
              start_time: row.start_time,
              end_time: row.start_time,
            })),
            error: null,
          };
        }),
      })),
    }));
    const rows = Array.from({ length: 25 }, (_, index) => ({
      start_time: new Date(Date.UTC(2026, 8, 1 + index, 13)).toISOString(),
      end_time: new Date(Date.UTC(2026, 8, 1 + index, 14)).toISOString(),
    }));

    try {
      await insertSessionRowsInChunks(
        { from } as unknown as import('@supabase/supabase-js').SupabaseClient,
        rows,
      );
      throw new Error('Expected the second chunk to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(SessionRowsInsertError);
      expect((error as SessionRowsInsertError).insertedRows).toHaveLength(ORG_ADMIN_SESSION_INSERT_CHUNK);
    }
  });
});

describe('resolveOrCreateTrialSubject', () => {
  it('uses the organization trial price and duration and refreshes an existing trial subject', async () => {
    const subjectUpdates: Array<Record<string, unknown>> = [];
    const from = vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { organization_id: PRO_KLASE_QA_ORG_ID }, error: null })),
            })),
          })),
        };
      }
      if (table === 'organizations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: {
                  features: {
                    trial_lesson_topic: 'Bandomoji pamoka',
                    trial_lesson_duration_minutes: 45,
                    trial_lesson_price_eur: 10,
                  },
                },
                error: null,
              })),
            })),
          })),
        };
      }
      if (table === 'subjects') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: {
                    id: 'trial-subject',
                    name: 'Old trial',
                    price: 25,
                    duration_minutes: 60,
                    is_group: false,
                    max_students: null,
                    is_trial: true,
                  },
                  error: null,
                })),
              })),
            })),
          })),
          update: vi.fn((patch: Record<string, unknown>) => {
            subjectUpdates.push(patch);
            return { eq: vi.fn(async () => ({ error: null })) };
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const result = await resolveOrCreateTrialSubject(
      { from } as unknown as import('@supabase/supabase-js').SupabaseClient,
      'tutor-1',
      undefined,
      { useOrgPriceOnly: true },
    );

    expect(result.price).toBe(10);
    expect(result.durationMinutes).toBe(45);
    expect(result.subject).toMatchObject({
      id: 'trial-subject',
      price: 10,
      duration_minutes: 45,
    });
    expect(subjectUpdates).toEqual([{
      name: 'Bandomoji pamoka',
      duration_minutes: 45,
      price: 10,
    }]);
  });
});

function mockSupabaseForConversionInsertFailure(
  busyRows: Array<{ id: string; start_time: string; end_time: string }> = [],
  isTrial = false,
) {
  const deletedSessionIds: string[][] = [];
  const deletedTemplateIds: string[][] = [];
  let anchorUpdates = 0;
  let sessionInsertCalls = 0;
  let templateIndex = 0;

  const originalAnchor = {
    tutor_id: 'tutor-1',
    student_id: 'student-1',
    subject_id: 'subj-1',
    start_time: '2026-09-17T15:00:00.000Z',
    end_time: '2026-09-17T16:00:00.000Z',
    topic: 'Original lesson',
    meeting_link: null,
    price: 29,
    paid: true,
    payment_status: 'paid',
    lesson_package_id: null,
    status: 'active',
    tutor_comment: null,
    show_comment_to_student: false,
    show_comment_to_parent: false,
    recurring_session_id: null,
    created_by_role: 'org_admin',
    subjects: { is_trial: isTrial },
  };

  const from = vi.fn((table: string) => {
    if (table === 'sessions') {
      return {
        select: vi.fn((columns: string) => {
          if (columns.includes('recurring_session_id')) {
            return {
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: originalAnchor, error: null })),
              })),
            };
          }
          const busyChain: any = {};
          busyChain.eq = vi.fn(() => busyChain);
          busyChain.lt = vi.fn(() => busyChain);
          busyChain.gt = vi.fn(async () => ({ data: busyRows, error: null }));
          return busyChain;
        }),
        insert: vi.fn((rows: Array<Record<string, unknown>>) => ({
          select: vi.fn(async () => {
            sessionInsertCalls += 1;
            if (sessionInsertCalls === 2) {
              return { data: null, error: { message: 'future insert failed' } };
            }
            return {
              data: rows.map((row, index) => ({
                ...row,
                id: `future-${index}`,
              })),
              error: null,
            };
          }),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(async () => {
            anchorUpdates += 1;
            return { error: null };
          }),
        })),
        delete: vi.fn(() => ({
          in: vi.fn(async (_column: string, ids: string[]) => {
            deletedSessionIds.push(ids);
            return { error: null };
          }),
        })),
      };
    }
    if (table === 'recurring_individual_sessions') {
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => {
              templateIndex += 1;
              return { data: { id: `template-${templateIndex}`, student_id: 'student-1' }, error: null };
            }),
          })),
        })),
        delete: vi.fn(() => ({
          in: vi.fn(async (_column: string, ids: string[]) => {
            deletedTemplateIds.push(ids);
            return { error: null };
          }),
        })),
      };
    }
    if (table === 'students') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: { payment_model: null }, error: null })),
          })),
        })),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });

  return {
    supabase: { from } as unknown as import('@supabase/supabase-js').SupabaseClient,
    deletedSessionIds,
    deletedTemplateIds,
    anchorUpdates: () => anchorUpdates,
  };
}

describe('convertOrgAdminSessionToRecurring', () => {
  const baseInput = {
    supabase: { from: vi.fn() } as unknown as import('@supabase/supabase-js').SupabaseClient,
    organizationId: PRO_KLASE_QA_ORG_ID,
    sessionId: 'sess-1',
    tutorId: 'tutor-1',
    studentId: 'student-1',
    subjectId: 'subj-1',
    startTime: '2026-09-17T15:00:00.000Z',
    endTime: '2026-09-17T16:00:00.000Z',
    topic: 'Pamoka',
    meetingLink: null,
    price: 29,
    paid: false,
    paymentStatus: 'pending',
    lessonPackageId: null,
    tutorComment: null,
    showCommentToStudent: false,
    showCommentToParent: false,
    status: 'active',
    frequency: 'weekly' as const,
    weekdays: [3],
    recurringEndDate: '',
  };

  it('rejects non–Pro Klasė organizations', async () => {
    await expect(
      convertOrgAdminSessionToRecurring({
        ...baseInput,
        organizationId: 'c3a00000-7e57-4000-8000-000000000001',
      }),
    ).rejects.toThrow(/Pro Klasė/);
  });

  it('requires weekdays for weekly recurrence', async () => {
    await expect(
      convertOrgAdminSessionToRecurring({
        ...baseInput,
        weekdays: [],
      }),
    ).rejects.toThrow(/savaitės dieną/);
  });

  it('rejects converting a trial lesson into a recurring series', async () => {
    const mock = mockSupabaseForConversionInsertFailure([], true);
    await expect(convertOrgAdminSessionToRecurring({
      ...baseInput,
      supabase: mock.supabase,
    })).rejects.toThrow(/Bandomosios pamokos/);
    expect(mock.anchorUpdates()).toBe(0);
    expect(mock.deletedTemplateIds).toHaveLength(0);
  });

  it('removes partially inserted future rows without mutating the anchor when a later chunk fails', async () => {
    const mock = mockSupabaseForConversionInsertFailure();

    await expect(convertOrgAdminSessionToRecurring({
      ...baseInput,
      supabase: mock.supabase,
      paid: true,
      paymentStatus: 'paid',
      weekdays: [1, 2, 3, 4, 5],
    })).rejects.toThrow('future insert failed');

    expect(mock.anchorUpdates()).toBe(0);
    expect(mock.deletedSessionIds.flat()).toHaveLength(ORG_ADMIN_SESSION_INSERT_CHUNK);
    expect(mock.deletedTemplateIds.flat()).toHaveLength(5);
  });

  it('rejects an edited anchor collision before inserting or mutating sessions and cleans its template', async () => {
    const mock = mockSupabaseForConversionInsertFailure([{
      id: 'other-session',
      start_time: '2026-09-17T15:30:00.000Z',
      end_time: '2026-09-17T16:30:00.000Z',
    }]);

    await expect(convertOrgAdminSessionToRecurring({
      ...baseInput,
      supabase: mock.supabase,
      paid: true,
      paymentStatus: 'paid',
    })).rejects.toThrow(/already has a lesson/i);

    expect(mock.anchorUpdates()).toBe(0);
    expect(mock.deletedSessionIds).toHaveLength(0);
    expect(mock.deletedTemplateIds.flat()).toEqual(['template-1']);
  });
});
