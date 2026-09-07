import { describe, expect, it } from 'vitest';
import {
  calendarStudentTitlePart,
  formatStudentPickerLabel,
  orgStudentIdentityGroupKey,
  pickStudentsForOrgTutorPicker,
} from '../../src/lib/orgStudentIdentity';

describe('orgStudentIdentity', () => {
  it('groups by linked_user_id when present', () => {
    expect(orgStudentIdentityGroupKey({ id: 'a', linked_user_id: 'u1' })).toBe('u:u1');
  });

  it('groups unlinked rows by org and student email', () => {
    expect(
      orgStudentIdentityGroupKey({
        id: 'a',
        organization_id: 'org1',
        email: 'Child@Example.com',
      }),
    ).toBe('e:org1:child@example.com');
  });

  it('falls back to row id when no link or email', () => {
    expect(orgStudentIdentityGroupKey({ id: 'row-99' })).toBe('s:row-99');
  });

  it('dedupes picker rows by identity and prefers tutor match', () => {
    const students = [
      { id: 'chem', full_name: 'Ona', tutor_id: 't-chem', linked_user_id: 'u1', email: 'ona@x.lt' },
      { id: 'math', full_name: 'Ona', tutor_id: 't-math', linked_user_id: 'u1', email: 'ona@x.lt' },
    ];
    expect(pickStudentsForOrgTutorPicker(students, 't-math')).toEqual([students[1]]);
    expect(pickStudentsForOrgTutorPicker(students, 't-chem')).toEqual([students[0]]);
    expect(pickStudentsForOrgTutorPicker(students, 't-other')).toHaveLength(1);
  });

  it('shows grade in picker label when set', () => {
    expect(formatStudentPickerLabel('Jonas', '5 klasė')).toBe('Jonas (5 klasė)');
    expect(formatStudentPickerLabel('Jonas', null)).toBe('Jonas');
  });

  it('builds calendar title part with grade', () => {
    expect(calendarStudentTitlePart('Jonas', '10 klasė')).toBe('Jonas · 10 klasė');
    expect(calendarStudentTitlePart('Jonas', '')).toBe('Jonas');
  });
});
