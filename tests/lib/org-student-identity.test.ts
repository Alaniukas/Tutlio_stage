import { describe, expect, it } from 'vitest';
import {
  calendarStudentTitlePart,
  formatOrgStudentPickerLabel,
  formatStudentPickerLabel,
  matchesOrgStudentPickerSearch,
  orgStudentDisplayName,
  orgStudentIdentityGroupKey,
  pickStudentsForOrgTutorPicker,
  sameOrgStudentIdentity,
} from '../../src/lib/orgStudentIdentity';

describe('orgStudentIdentity', () => {
  it('groups by linked_user_id and name when present', () => {
    expect(orgStudentIdentityGroupKey({ id: 'a', linked_user_id: 'u1', full_name: 'Ona' })).toBe(
      'u:u1:ona',
    );
  });

  it('groups unlinked rows by org, student email, and name', () => {
    expect(
      orgStudentIdentityGroupKey({
        id: 'a',
        organization_id: 'org1',
        email: 'Child@Example.com',
        full_name: 'Ona',
      }),
    ).toBe('e:org1:child@example.com:ona');
  });

  it('groups partial duplicate rows by payer email and child name', () => {
    const linked = {
      id: 'linked',
      organization_id: 'org1',
      full_name: 'Marija Bukataja',
      email: 'child@example.test',
      payer_email: 'parent@example.test',
      linked_user_id: 'student-user',
    };
    const duplicate = {
      id: 'duplicate',
      organization_id: 'org1',
      full_name: 'Marija Bukataja',
      payer_email: 'parent@example.test',
    };
    expect(orgStudentIdentityGroupKey(linked)).toBe(orgStudentIdentityGroupKey(duplicate));
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

  it('keeps siblings who share a parent login or email as separate picker rows', () => {
    const students = [
      {
        id: 'kajus',
        full_name: 'Adomaitis Kajus Stasys',
        tutor_id: null,
        linked_user_id: 'parent-1',
        email: 'houseformykids@gmail.com',
      },
      {
        id: 'etme',
        full_name: 'Vitkutė Etmė',
        tutor_id: null,
        linked_user_id: 'parent-1',
        email: 'houseformykids@gmail.com',
      },
    ];
    const rows = pickStudentsForOrgTutorPicker(students, 't-olga');
    expect(rows.map((row) => row.id).sort()).toEqual(['etme', 'kajus']);
  });

  it('treats the same child on two tutors as one identity', () => {
    const chem = { id: 'chem', full_name: 'Ona', tutor_id: 't-chem', linked_user_id: 'u1', email: 'ona@x.lt' };
    const math = { id: 'math', full_name: 'Ona', tutor_id: 't-math', linked_user_id: 'u1', email: 'ona@x.lt' };
    expect(sameOrgStudentIdentity(chem, math)).toBe(true);
    expect(
      sameOrgStudentIdentity(chem, { ...chem, id: 'etme', full_name: 'Vitkutė Etmė' }),
    ).toBe(false);
  });

  it('shows grade in picker label when set', () => {
    expect(formatStudentPickerLabel('Jonas', '5 klasė')).toBe('Jonas (5 klasė)');
    expect(formatStudentPickerLabel('Jonas', null)).toBe('Jonas');
  });

  it('keeps real student name in picker label', () => {
    expect(
      formatOrgStudentPickerLabel({
        id: 's1',
        full_name: 'Paulius Tolvaišas',
        grade: '8 klasė',
      }),
    ).toBe('Paulius Tolvaišas (8 klasė)');
  });

  it('shows payer hint for pending registration placeholder', () => {
    expect(
      orgStudentDisplayName({
        id: 's1',
        full_name: 'Laukiama registracijos',
        payer_name: 'Eglė Tolvaišienė',
        payer_email: 'eglegiedr@gmail.com',
      }),
    ).toBe('Laukiama registracijos · Eglė Tolvaišienė');
  });

  it('matches picker search by payer name and email', () => {
    const student = {
      id: 's1',
      full_name: 'Laukiama registracijos',
      payer_name: 'Eglė Tolvaišienė',
      payer_email: 'eglegiedr@gmail.com',
      grade: '8 klasė',
    };
    expect(matchesOrgStudentPickerSearch(student, 'tolvaiš')).toBe(true);
    expect(matchesOrgStudentPickerSearch(student, 'eglegiedr')).toBe(true);
    expect(matchesOrgStudentPickerSearch(student, 'paulius')).toBe(false);
  });

  it('builds calendar title part with grade', () => {
    expect(calendarStudentTitlePart('Jonas', '10 klasė')).toBe('Jonas · 10 klasė');
    expect(calendarStudentTitlePart('Jonas', '')).toBe('Jonas');
  });
});
