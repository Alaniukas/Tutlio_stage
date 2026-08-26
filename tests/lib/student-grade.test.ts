import { describe, expect, it } from 'vitest';
import { normalizeStudentGrade1to12, studentGradeSelectValue } from '../../src/lib/studentGrade';

describe('normalizeStudentGrade1to12', () => {
  it('accepts 1–12 and stores the app grade format', () => {
    expect(normalizeStudentGrade1to12('5')).toBe('5 klasė');
    expect(normalizeStudentGrade1to12('12 klasė')).toBe('12 klasė');
    expect(normalizeStudentGrade1to12('1')).toBe('1 klasė');
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
    expect(studentGradeSelectValue('')).toBe('');
  });
});
