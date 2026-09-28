import { expect, it } from 'vitest';
import { schoolFamilyConsultationsForView, schoolFamilyConsultationVisibleToParent, type SchoolFamilyConsultationBooking } from '../../src/lib/schoolFamilyConsultations';
import { schoolFamilyConsultationTranslations } from '../../src/lib/i18n/schoolFamilyConsultationTranslations';

it('separates the family overview from a selected child without hiding other authorized child reservations', () => {
  const base = { organization_id: 'school', kind: 'help_team', status: 'confirmed', school_year: '2026/2027' } as const;
  const rows: SchoolFamilyConsultationBooking[] = [
    { ...base, id: 'family', student_id: 'a', target_kind: 'family', family_student_ids: ['a', 'b'] },
    { ...base, id: 'child-a', student_id: 'a', target_kind: 'child' },
    { ...base, id: 'child-b', student_id: 'b', target_kind: 'child' },
  ];
  expect(schoolFamilyConsultationsForView(rows).map(row => row.id)).toEqual(['family', 'child-a', 'child-b']);
  expect(schoolFamilyConsultationsForView(rows, 'b').map(row => row.id)).toEqual(['child-b']);
  expect(schoolFamilyConsultationVisibleToParent(rows[0], ['b'])).toBe(true);
  expect(schoolFamilyConsultationVisibleToParent(rows[1], ['b'])).toBe(false);
  expect(schoolFamilyConsultationVisibleToParent(rows[0], ['c'])).toBe(false);
});

it('supplies every family-consultation label in all thirteen established locales', () => {
  expect(Object.keys(schoolFamilyConsultationTranslations)).toHaveLength(13);
  const keys = Object.keys(schoolFamilyConsultationTranslations.en).sort();
  for (const translations of Object.values(schoolFamilyConsultationTranslations)) {
    expect(Object.keys(translations).sort()).toEqual(keys);
    expect(Object.values(translations).every(value => typeof value === 'string' && value.trim().length > 0)).toBe(true);
  }
});
