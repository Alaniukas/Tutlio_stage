import { describe, expect, it } from 'vitest';
import { matchRecordingToSession, groupsCanViewRecording } from '../../src/lib/schoolLessonRecordings';
import {
  addGroupScheduleSlot,
  classGroupRowFields,
  groupToWriteDraft,
  parseClassGroupWriteBody,
  scheduleLabelFromGroupSlots,
  studentsForGroupPicker,
  toggleMemberIds,
  updateGroupScheduleSlot,
  validateSchoolClassGroup,
} from '../../src/lib/schoolClassGroups';

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

  it('maps an existing group into a write draft including members', () => {
    const draft = groupToWriteDraft({
      id: 'g1',
      name: 'QA Legal Matematika',
      tutor_id: 't1',
      school_year_start: '2026-09-01T00:00:00.000Z',
      school_year_end: '2027-06-15T00:00:00.000Z',
      platform: 'Google Meet',
      duration_minutes: 45,
      meeting_link: 'https://meet.google.com/abc-defg-hij',
      slots: [{ weekday: 2, start_time: '16:00:00', end_time: '16:45:00' }],
      members: [{ student_id: 's1', student: { full_name: 'Jonas' } }],
    });
    expect(draft).toMatchObject({
      name: 'QA Legal Matematika',
      tutor_id: 't1',
      school_year_start: '2026-09-01',
      school_year_end: '2027-06-15',
      meeting_link: 'https://meet.google.com/abc-defg-hij',
      student_ids: ['s1'],
      slots: [{ weekday: 2, start_time: '16:00', end_time: '16:45' }],
    });
    expect(classGroupRowFields(draft)).toMatchObject({
      name: 'QA Legal Matematika',
      tutor_id: 't1',
      platform: 'Google Meet',
      duration_minutes: 45,
    });
  });

  it('parses PATCH body slots and student ids', () => {
    const parsed = parseClassGroupWriteBody({
      name: 'QA Matematika 5kl',
      tutor_id: 't1',
      school_year_start: '2026-09-01',
      school_year_end: '2027-06-15',
      platform: 'Zoom',
      duration_minutes: 60,
      meeting_link: 'https://zoom.us/j/1',
      slots: [{ weekday: 1, start_time: '15:00' }, { weekday: 3, start_time: '15:00' }],
      student_ids: ['s1', 's1', 's2'],
    }, 'fallback-tutor');
    expect(parsed.platform).toBe('Zoom');
    expect(parsed.duration_minutes).toBe(60);
    expect(parsed.student_ids).toEqual(['s1', 's2']);
    expect(parsed.slots).toEqual([
      { weekday: 1, start_time: '15:00', end_time: '16:00' },
      { weekday: 3, start_time: '15:00', end_time: '16:00' },
    ]);
  });

  it('keeps an independent start time on each weekday', () => {
    const parsed = parseClassGroupWriteBody({
      name: 'Split',
      tutor_id: 't1',
      school_year_start: '2026-09-01',
      school_year_end: '2027-06-15',
      duration_minutes: 45,
      slots: [
        { weekday: 1, start_time: '11:00' },
        { weekday: 3, start_time: '14:00' },
      ],
    }, 't1');
    expect(parsed.slots).toEqual([
      { weekday: 1, start_time: '11:00', end_time: '11:45' },
      { weekday: 3, start_time: '14:00', end_time: '14:45' },
    ]);
    expect(scheduleLabelFromGroupSlots(parsed.slots)).toBe(
      'pirmadienis 11:00–11:45, trečiadienis 14:00–14:45',
    );

    const added = addGroupScheduleSlot(parsed.slots, 45);
    expect(added[0]).toEqual({ weekday: 1, start_time: '11:00', end_time: '11:45' });
    expect(added[1]).toEqual({ weekday: 3, start_time: '14:00', end_time: '14:45' });
    expect(updateGroupScheduleSlot(added, 2, { weekday: 5, start_time: '09:00' }, 45)[2]).toEqual({
      weekday: 5,
      start_time: '09:00',
      end_time: '09:45',
    });
  });

  it('keeps selected archived students in the picker and toggles membership', () => {
    const students = [
      { id: 'active', enrollment_status: 'active' },
      { id: 'left', enrollment_status: 'left' },
    ];
    expect(studentsForGroupPicker(students, ['left']).map((s) => s.id)).toEqual(['active', 'left']);
    expect(studentsForGroupPicker(students, []).map((s) => s.id)).toEqual(['active']);
    expect(toggleMemberIds(['s1'], 's2')).toEqual(['s1', 's2']);
    expect(toggleMemberIds(['s1', 's2'], 's1')).toEqual(['s2']);
  });
});
