/**
 * School portals say "mokytojas" / "mokinys"; company/solo keep "korepetitorius".
 */
export type StaffLabelKind = 'tutor' | 'teacher';

export function staffLabelKind(isSchool: boolean): StaffLabelKind {
  return isSchool ? 'teacher' : 'tutor';
}

export function staffNounKey(isSchool: boolean): 'role.staffSchool' | 'role.staff' {
  return isSchool ? 'role.staffSchool' : 'role.staff';
}

export function staffNounPluralKey(isSchool: boolean): 'role.staffSchoolPlural' | 'role.staffPlural' {
  return isSchool ? 'role.staffSchoolPlural' : 'role.staffPlural';
}

export function studentNounKey(): 'role.student' {
  return 'role.student';
}
