import { describe, it, expect, vi } from 'vitest';
import {
  assertTutorSlotsFree,
  convertOrgAdminSessionToRecurring,
  filterRowsAgainstBusyTutorSlots,
  insertSessionRowsInChunks,
  ORG_ADMIN_SESSION_INSERT_CHUNK,
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
});

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
});
