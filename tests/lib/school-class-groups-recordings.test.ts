import { describe, expect, it } from 'vitest';
import { matchRecordingToSession, groupsCanViewRecording } from '../../src/lib/schoolLessonRecordings';
import { validateSchoolClassGroup } from '../../src/lib/schoolClassGroups';

describe('schoolLessonRecordings + class groups', () => {
  it('matches recording by Meet conference id first', () => {
    const match = matchRecordingToSession(
      {
        drive_file_id: 'f1',
        name: 'rec',
        created_at: '2026-08-26T10:05:00.000Z',
        meet_conference_id: 'abc-defg-hij',
      },
      [
        {
          id: 's1',
          start_time: '2026-08-26T10:00:00.000Z',
          meeting_link: 'https://meet.google.com/abc-defg-hij',
        },
        {
          id: 's2',
          start_time: '2026-08-26T10:00:00.000Z',
          meeting_link: 'https://meet.google.com/other',
        },
      ],
    );
    expect(match?.id).toBe('s1');
  });

  it('gates visibility by assigned groups', () => {
    expect(groupsCanViewRecording(['g1'], ['g2'])).toBe(false);
    expect(groupsCanViewRecording(['g1', 'g2'], ['g2'])).toBe(true);
  });

  it('validates class group drafts', () => {
    expect(validateSchoolClassGroup({
      name: 'LT 2kl',
      tutor_id: 't1',
      school_year_start: '2026-09-01',
      school_year_end: '2027-06-15',
      slots: [{ weekday: 2, start_time: '16:00', end_time: '16:45' }],
    })).toEqual([]);
    expect(validateSchoolClassGroup({
      name: '',
      tutor_id: '',
      school_year_start: '',
      school_year_end: '',
      slots: [],
    })).toContain('name');
  });
});
