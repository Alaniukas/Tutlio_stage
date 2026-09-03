import { describe, expect, it } from 'vitest';
import {
  buildClassGroupMetaMap,
  calendarTitleForSession,
  classGroupParticipantsForModal,
  isMergedClassGroupSession,
  mergeSchoolClassGroupSessions,
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
});
