import { describe, expect, it } from 'vitest';
import { displayStudentGrade, normalizeStudentGrade1to12, proKlaseGradeSelectValue, studentGradeSelectValue } from '../../src/lib/studentGrade';

describe('normalizeStudentGrade1to12', () => {
  it('accepts 1–12 and stores the app grade format', () => {
    expect(normalizeStudentGrade1to12('5')).toBe('5 klasė');
    expect(normalizeStudentGrade1to12('12 klasė')).toBe('12 klasė');
    expect(normalizeStudentGrade1to12('1')).toBe('1 klasė');
    expect(normalizeStudentGrade1to12('12 klas??')).toBe('12 klasė');
    expect(normalizeStudentGrade1to12('12 klas?')).toBe('12 klasė');
    expect(normalizeStudentGrade1to12('12 klase')).toBe('12 klasė');
  });

  it('rejects empty, out of range, and free text', () => {
    expect(normalizeStudentGrade1to12('')).toBeNull();
    expect(normalizeStudentGrade1to12('0')).toBeNull();
    expect(normalizeStudentGrade1to12('13')).toBeNull();
    expect(normalizeStudentGrade1to12('Studentas')).toBeNull();
    expect(normalizeStudentGrade1to12('Kita')).toBeNull();
  });

  it('maps stored grade back to the select value', () => {
    expect(studentGradeSelectValue('7 klasė')).toBe('7');
    expect(studentGradeSelectValue('12 klas??')).toBe('12');
    expect(studentGradeSelectValue('')).toBe('');
  });

  it('repairs corrupted grades for display and keeps free text', () => {
    expect(displayStudentGrade('12 klas??')).toBe('12 klasė');
    expect(displayStudentGrade('Studentas')).toBe('Studentas');
    expect(displayStudentGrade('')).toBe('');
  });

  it('keeps Pro Klasė grade Select values inside the item list', () => {
    expect(proKlaseGradeSelectValue('5 klas?')).toBe('5 klasė');
    expect(proKlaseGradeSelectValue('12 klas??')).toBe('12 klasė');
    expect(proKlaseGradeSelectValue(null)).toBe('unset');
    expect(proKlaseGradeSelectValue('Studentas')).toBe('Studentas');
    expect(proKlaseGradeSelectValue('something else')).toBe('Kita');
  });
});
