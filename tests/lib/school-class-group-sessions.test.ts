import { describe, expect, it } from 'vitest';
import {
  buildClassGroupMetaMap,
  calendarSessionTopicSuffix,
  calendarTitleForSession,
  classGroupDisplayName,
  classGroupParticipantStatusForDisplay,
  classGroupParticipantsForModal,
  classGroupParticipantsWithSessions,
  isMergedClassGroupSession,
  mergeSchoolClassGroupSessions,
  pickClassGroupOccurrenceSession,
  sessionStatusI18nKey,
  type MergedClassGroupSession,
} from '../../src/lib/schoolClassGroupSessions';
import { schoolMeetingOccurrences } from '../../src/lib/schoolSessionMonitoring';
import { schoolTutorPayOccurrences } from '../../src/lib/schoolTutorLessonPay';

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

  it('keeps a historical automatically completed group pending while preserving the raw child outcomes', () => {
    const meta = buildClassGroupMetaMap(groups);
    const rows = [
      { id: 'old-first', student_id: 's1', class_group_id: 'g1', start_time: start, end_time: end, status: 'completed', status_confirmed_at: null },
      { id: 'old-second', student_id: 's2', class_group_id: 'g1', start_time: start, end_time: end, status: 'no_show', status_confirmed_at: null },
    ];

    for (const preferCancelledOccurrence of [false, true]) {
      const merged = mergeSchoolClassGroupSessions(rows, meta, {
        preferCancelledOccurrence,
        requireConfirmation: true,
      })[0];
      expect(isMergedClassGroupSession(merged)).toBe(true);
      if (!isMergedClassGroupSession(merged)) throw new Error('Expected one merged class group');
      expect(merged.status).toBe('active');
      expect(merged._classGroupSessions.map(row => row.status)).toEqual(['completed', 'no_show']);
      expect(merged._classGroupSessions.map(row => row.id)).toEqual(['old-first', 'old-second']);
      expect(merged._classGroupSessions.every(row => row.status_confirmed_at === null)).toBe(true);
    }
    expect(rows.map(row => row.status)).toEqual(['completed', 'no_show']);
    expect(mergeSchoolClassGroupSessions(rows, meta)[0].status).toBe('completed');
  });

  it('uses the confirmed child as the group representative after one explicit outcome confirmation', () => {
    const meta = buildClassGroupMetaMap(groups);
    const rows = [
      { id: 'automatic-first', student_id: 's1', class_group_id: 'g1', start_time: start, end_time: end, status: 'completed', status_confirmed_at: null },
      { id: 'confirmed-child', student_id: 's2', class_group_id: 'g1', start_time: start, end_time: end, status: 'completed', status_confirmed_at: '2026-09-08T09:00:00Z' },
    ];
    expect(pickClassGroupOccurrenceSession(rows, { requireConfirmation: true })).toBe(rows[1]);
    expect(pickClassGroupOccurrenceSession(rows)).toBe(rows[0]);
    for (const preferCancelledOccurrence of [false, true]) {
      const merged = mergeSchoolClassGroupSessions(rows, meta, {
        preferCancelledOccurrence,
        requireConfirmation: true,
      })[0];
      expect(merged.status).toBe('completed');
      expect(merged.status_confirmed_at).toBe('2026-09-08T09:00:00Z');
      expect(isMergedClassGroupSession(merged)).toBe(true);
      if (!isMergedClassGroupSession(merged)) throw new Error('Expected one merged class group');
      expect(merged._classGroupSessions[0].status_confirmed_at).toBeNull();
      expect(merged._classGroupSessions.map(row => row.status)).toEqual(['completed', 'completed']);
    }
  });

  it('keeps confirmed attendance ahead of cancelled and pending children in calendar and finance', () => {
    const meta = buildClassGroupMetaMap(groups);
    const rows = [
      { id: 'cancelled', student_id: 's1', class_group_id: 'g1', start_time: start, end_time: end, status: 'cancelled', status_confirmed_at: null },
      { id: 'attended', student_id: 's2', class_group_id: 'g1', start_time: start, end_time: end, status: 'completed', status_confirmed_at: '2026-09-08T09:00:00Z' },
      { id: 'pending-completed', student_id: 's3', class_group_id: 'g1', start_time: start, end_time: end, status: 'completed', status_confirmed_at: null },
      { id: 'pending-no-show', student_id: 's4', class_group_id: 'g1', start_time: start, end_time: end, status: 'no_show', status_confirmed_at: null },
    ];
    const options = { requireConfirmation: true };
    expect(pickClassGroupOccurrenceSession(rows, options)).toBe(rows[1]);
    for (const preferCancelledOccurrence of [false, true]) {
      const merged = mergeSchoolClassGroupSessions(rows, meta, { ...options, preferCancelledOccurrence })[0];
      expect(merged.status).toBe('completed');
      expect(merged.status_confirmed_at).toBe(rows[1].status_confirmed_at);
      if (!isMergedClassGroupSession(merged)) throw new Error('Expected one merged class group');
      expect(merged._classGroupSessions.map(row => row.status)).toEqual(rows.map(row => row.status));
    }
    const financeRows = rows.map(row => ({ ...row, start_time: start.toISOString(), end_time: end.toISOString(), tutor_id: 't1', tutor_pay_eur_snapshot: 45 }));
    expect(schoolMeetingOccurrences(financeRows, options)[0].row.id).toBe('attended');
    const pay = schoolTutorPayOccurrences(financeRows, 0, new Date('2026-09-09T00:00:00Z'), options);
    expect(pay).toHaveLength(1);
    expect(pay[0].payEur).toBe(45);
    expect(pay[0].sessionIds).toEqual(rows.map(row => row.id));
  });

  it('keeps cancelled and unconfirmed children pending under the shared confirmation policy', () => {
    const meta = buildClassGroupMetaMap(groups);
    const rows = [
      { id: 'cancelled-first', student_id: 's1', class_group_id: 'g1', start_time: start, end_time: end, status: 'cancelled', status_confirmed_at: null },
      { id: 'pending-child', student_id: 's2', class_group_id: 'g1', start_time: start, end_time: end, status: 'completed', status_confirmed_at: null },
    ];
    const options = { requireConfirmation: true };
    expect(pickClassGroupOccurrenceSession(rows, options)).toMatchObject({ id: 'pending-child', status: 'active' });
    for (const preferCancelledOccurrence of [false, true]) {
      const merged = mergeSchoolClassGroupSessions(rows, meta, { ...options, preferCancelledOccurrence })[0];
      expect(merged.status).toBe('active');
      if (!isMergedClassGroupSession(merged)) throw new Error('Expected one merged class group');
      expect(merged._classGroupSessions.map(row => row.status)).toEqual(['cancelled', 'completed']);
    }
    const financeRows = rows.map(row => ({ ...row, start_time: start.toISOString(), end_time: end.toISOString(), tutor_id: 't1', tutor_pay_eur_snapshot: 45 }));
    expect(schoolMeetingOccurrences(financeRows, options)[0].row.status).toBe('active');
    expect(schoolTutorPayOccurrences(financeRows, 45, new Date('2026-09-09T00:00:00Z'), options)).toEqual([]);
    expect(pickClassGroupOccurrenceSession(rows)).toBe(rows[0]);
    expect(mergeSchoolClassGroupSessions(rows, meta, { preferCancelledOccurrence: true })[0].status).toBe('cancelled');
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

  it('refreshes open participant attendance from current occurrence sessions', () => {
    const initialSession = {
      id: 'lesson-1', student_id: 's1', start_time: start, end_time: end,
      status: 'active', status_confirmed_at: null as string | null, no_show_reason: null as string | null,
    };
    const openedParticipants = [
      { student_id: 's1', full_name: 'Jonas Jonaitis', session: initialSession },
      { student_id: 's2', full_name: 'Ona Onaitė', session: null },
    ];

    for (const status of ['completed', 'no_show', 'active']) {
      const currentSession = {
        ...initialSession,
        status,
        status_confirmed_at: status === 'active' ? null : '2026-09-30T10:00:00Z',
        no_show_reason: status === 'no_show' ? 'manual' : null,
      };
      const displayed = classGroupParticipantsWithSessions(openedParticipants, [currentSession]);

      expect(displayed[0].session).toBe(currentSession);
      expect(displayed[0].session?.status).toBe(status);
      expect(displayed[0].session?.status_confirmed_at).toBe(currentSession.status_confirmed_at);
      expect(displayed[1].session).toBeNull();
      expect(openedParticipants[0].session?.status).toBe('active');
    }
  });

  it('does not retain removed session snapshots or omit newly loaded occurrence sessions', () => {
    const previousSession = { id: 'old', student_id: 's1', start_time: start, end_time: end, status: 'completed' };
    const currentSession = { id: 'new', student_id: 's2', start_time: start, end_time: end, status: 'active' };
    const openedParticipants = [
      { student_id: 's1', full_name: 'Jonas Jonaitis', session: previousSession },
      { student_id: 's2', full_name: 'Ona Onaitė', session: null },
    ];
    const displayed = classGroupParticipantsWithSessions(openedParticipants, [currentSession]);

    expect(displayed[0].session).toBeNull();
    expect(displayed[1].session).toBe(currentSession);
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
