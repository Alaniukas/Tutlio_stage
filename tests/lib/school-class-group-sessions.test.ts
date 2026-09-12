import { describe, expect, it } from 'vitest';
import {
  buildClassGroupMetaMap,
  calendarSessionTopicSuffix,
  calendarTitleForSession,
  classGroupDisplayName,
  classGroupParticipantStatusForDisplay,
  classGroupParticipantsForModal,
  isMergedClassGroupSession,
  mergeSchoolClassGroupSessions,
  sessionStatusI18nKey,
  type MergedClassGroupSession,
} from '../../src/lib/schoolClassGroupSessions';

const start = new Date('2026-09-08T11:00:00+03:00');
const end = new Date('2026-09-08T11:45:00+03:00');

describe('schoolClassGroupSessions', () => {
  const groups = [
    {
      id: 'g1',
      name: 'LT 5 kl.',
      tutor_id: 't1',
      school_year_start: '2026-09-01',
      school_year_end: '2027-06-15',
      slots: [{ weekday: 2, start_time: '11:00', end_time: '11:45' }],
      members: [
        { student_id: 's1', student: { full_name: 'Jonas Jonaitis' } },
        { student_id: 's2', student: { full_name: 'Ona Onaitė' } },
      ],
    },
  ];

  it('uses calendar_name in merged row when set', () => {
    const groups = [
      {
        id: 'g1',
        name: 'Alina 5 kl. 1 grupė – nuotoliniai papildomi užsiėmimai',
        calendar_name: 'Alina 5 kl. 1 grupė',
        tutor_id: 't1',
        school_year_start: '2026-09-01',
        school_year_end: '2027-06-15',
        slots: [{ weekday: 2, start_time: '11:00', end_time: '11:45' }],
        members: [{ student_id: 's1', student: { full_name: 'Jonas' } }],
      },
    ];
    const meta = buildClassGroupMetaMap(groups);
    const merged = mergeSchoolClassGroupSessions(
      [{
        id: 'a',
        student_id: 's1',
        class_group_id: 'g1',
        start_time: start,
        end_time: end,
        status: 'active',
      }],
      meta,
    )[0];
    expect((merged as MergedClassGroupSession<{ id: string }>)._classGroupName).toBe('Alina 5 kl. 1 grupė');
    expect((merged as { topic?: string | null }).topic).toBeNull();
    expect(calendarSessionTopicSuffix('Alina 5 kl. 1 grupė', 'Alina 5 kl. 1 grupė')).toBe('');
  });

  it('merges same class group + time into one calendar row with group name', () => {
    const meta = buildClassGroupMetaMap(groups);
    const merged = mergeSchoolClassGroupSessions(
      [
        {
          id: 'a',
          student_id: 's1',
          class_group_id: 'g1',
          start_time: start,
          end_time: end,
          status: 'active',
          student: null,
        },
        {
          id: 'b',
          student_id: 's2',
          class_group_id: 'g1',
          start_time: start,
          end_time: end,
          status: 'active',
          student: null,
        },
      ],
      meta,
    );

    expect(merged).toHaveLength(1);
    const row = merged[0] as MergedClassGroupSession<(typeof merged)[0]>;
    expect(isMergedClassGroupSession(row)).toBe(true);
    expect(row._classGroupName).toBe('LT 5 kl.');
    expect(row._classGroupSessions).toHaveLength(2);
    expect(row._classGroupSessions[0].student?.full_name).toBe('Jonas Jonaitis');
    expect(calendarTitleForSession(row, 'Unknown')).toBe('LT 5 kl.');
  });

  it('shows a mixed-attendance class as completed instead of inheriting one child no-show', () => {
    const meta = buildClassGroupMetaMap(groups);
    const rows = [
      {
        id: 'absent-first',
        student_id: 's1',
        class_group_id: 'g1',
        start_time: start,
        end_time: end,
        status: 'no_show',
      },
      {
        id: 'attended',
        student_id: 's2',
        class_group_id: 'g1',
        start_time: start,
        end_time: end,
        status: 'completed',
      },
      {
        id: 'awaiting-confirmation',
        student_id: 's3',
        class_group_id: 'g1',
        start_time: start,
        end_time: end,
        status: 'active',
      },
    ];

    expect(mergeSchoolClassGroupSessions(rows, meta)[0].status).toBe('completed');
    expect(mergeSchoolClassGroupSessions(rows, meta, { preferCancelledOccurrence: true })[0].status).toBe('completed');
  });

  it('shows legacy automatic missed-join rows as awaiting confirmation', () => {
    const meta = buildClassGroupMetaMap(groups);
    const rows = [{
      id: 'legacy-auto-no-show',
      student_id: 's1',
      class_group_id: 'g1',
      start_time: start,
      end_time: end,
      status: 'no_show',
      no_show_reason: 'missed_join',
      status_confirmed_at: null,
    }];

    expect(mergeSchoolClassGroupSessions(rows, meta)[0].status).toBe('active');
    expect(mergeSchoolClassGroupSessions(rows, meta, { preferCancelledOccurrence: true })[0].status).toBe('active');
  });

  it('lists all enrolled members for modal, with session when present', () => {
    const meta = buildClassGroupMetaMap(groups);
    const merged = mergeSchoolClassGroupSessions(
      [
        {
          id: 'a',
          student_id: 's1',
          class_group_id: 'g1',
          start_time: start,
          end_time: end,
          status: 'active',
        },
      ],
      meta,
    )[0] as MergedClassGroupSession<{
      id: string;
      student_id: string;
      class_group_id: string;
      start_time: Date;
      end_time: Date;
      status: string;
    }>;

    const participants = classGroupParticipantsForModal(merged);
    expect(participants).toHaveLength(2);
    expect(participants.find((p) => p.student_id === 's1')?.session?.id).toBe('a');
    expect(participants.find((p) => p.student_id === 's2')?.session).toBeNull();
  });

  it('keeps separate calendar rows for different class groups at the same time', () => {
    const groups = [
      {
        id: 'g1',
        name: 'LT 5 kl.',
        tutor_id: 't1',
        school_year_start: '2026-09-01',
        school_year_end: '2027-06-15',
        slots: [{ weekday: 2, start_time: '11:00', end_time: '11:45' }],
        members: [{ student_id: 's1', student: { full_name: 'Jonas' } }],
      },
      {
        id: 'g2',
        name: 'Matematika 6 kl.',
        tutor_id: 't1',
        school_year_start: '2026-09-01',
        school_year_end: '2027-06-15',
        slots: [{ weekday: 2, start_time: '11:00', end_time: '11:45' }],
        members: [{ student_id: 's3', student: { full_name: 'Petras' } }],
      },
    ];
    const meta = buildClassGroupMetaMap(groups);
    const merged = mergeSchoolClassGroupSessions(
      [
        {
          id: 'a',
          student_id: 's1',
          class_group_id: 'g1',
          start_time: start,
          end_time: end,
          status: 'active',
        },
        {
          id: 'b',
          student_id: 's3',
          class_group_id: 'g2',
          start_time: start,
          end_time: end,
          status: 'active',
        },
      ],
      meta,
    );

    expect(merged).toHaveLength(2);
    const names = merged.map((row) => (row as MergedClassGroupSession<(typeof merged)[0]>)._classGroupName);
    expect(names).toEqual(['LT 5 kl.', 'Matematika 6 kl.']);
  });

  it('resolves class group display name from meta map', () => {
    const meta = buildClassGroupMetaMap([
      {
        id: 'g1',
        name: 'LT 5 kl.',
        tutor_id: 't1',
        school_year_start: '2026-09-01',
        school_year_end: '2027-06-15',
        slots: [],
        members: [],
      },
    ]);
    expect(classGroupDisplayName('g1', meta)).toBe('LT 5 kl.');
    expect(classGroupDisplayName('missing', meta)).toBeNull();
  });

  it('picks cancelled over leftover completed when a group slot was cancelled', () => {
    const meta = buildClassGroupMetaMap(groups);
    const merged = mergeSchoolClassGroupSessions(
      [
        {
          id: 'completed-row',
          student_id: 's1',
          class_group_id: 'g1',
          start_time: start,
          end_time: end,
          status: 'completed',
        },
        {
          id: 'cancelled-row',
          student_id: 's2',
          class_group_id: 'g1',
          start_time: start,
          end_time: end,
          status: 'canceled',
        },
      ],
      meta,
      { preferCancelledOccurrence: true },
    )[0] as MergedClassGroupSession<{
      id: string;
      student_id: string;
      class_group_id: string;
      start_time: Date;
      end_time: Date;
      status: string;
    }>;

    expect(merged.status).toBe('canceled');
    const participants = classGroupParticipantsForModal(merged);
    expect(
      participants.map((p) =>
        classGroupParticipantStatusForDisplay(
          p.session?.status,
          participants.map((x) => x.session?.status || ''),
          { coerceCompletedAfterGroupCancel: true },
        ),
      ),
    ).toEqual(['cancelled', 'cancelled']);
  });

  it('does not rewrite leftover completed unless explicitly opted in', () => {
    expect(classGroupParticipantStatusForDisplay('completed', ['completed', 'cancelled', 'completed'])).toBe(
      'completed',
    );
  });

  it('treats leftover completed as cancelled when a third of the slot was cancelled', () => {
    expect(classGroupParticipantStatusForDisplay('completed', ['completed', 'cancelled', 'completed'], {
      coerceCompletedAfterGroupCancel: true,
    })).toBe('cancelled');
  });

  it('keeps completed when only one classmate was cancelled', () => {
    expect(
      classGroupParticipantStatusForDisplay('completed', [
        'completed',
        'completed',
        'cancelled',
        'completed',
        'completed',
        'completed',
      ]),
    ).toBe('completed');
    expect(sessionStatusI18nKey('completed')).toBe('status.completed');
    expect(sessionStatusI18nKey('canceled')).toBe('status.cancelled');
    expect(sessionStatusI18nKey('cancelled')).toBe('status.cancelled');
  });

  it('prefers cancelled leftover over completed without throwing on invalid sibling times', () => {
    const meta = buildClassGroupMetaMap(groups);
    const invalidStart = new Date('not-a-date');
    const merged = mergeSchoolClassGroupSessions(
      [
        {
          id: 'a',
          student_id: 's1',
          class_group_id: 'g1',
          start_time: start,
          end_time: end,
          status: 'cancelled',
        },
        {
          id: 'b',
          student_id: 's2',
          class_group_id: 'g1',
          start_time: start,
          end_time: end,
          status: 'completed',
        },
        {
          id: 'broken',
          student_id: 's1',
          class_group_id: 'g1',
          start_time: invalidStart,
          end_time: end,
          status: 'active',
        },
      ],
      meta,
      { preferCancelledOccurrence: true },
    );
    const groupRow = merged.find((row) => isMergedClassGroupSession(row));
    expect(groupRow && 'status' in groupRow ? groupRow.status : null).toBe('cancelled');
    expect(merged.some((row) => row.id === 'broken')).toBe(true);
  });

  it('includes grade in 1:1 calendar title when student grade is set', () => {
    expect(
      calendarTitleForSession(
        {
          id: 'x',
          student_id: 's1',
          start_time: start,
          end_time: end,
          status: 'active',
          student: { full_name: 'Jonas', grade: '5 klasė' },
        },
        'Unknown',
      ),
    ).toBe('Jonas · 5 klasė');
  });
});
