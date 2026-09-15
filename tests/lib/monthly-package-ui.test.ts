import { describe, expect, it } from 'vitest';
import { monthlyPackageErrorI18nKey, monthlyPackageErrorMessage } from '../../src/lib/monthlyPackageUi';

describe('monthly package admin errors', () => {
  it('maps the English API miss to a localized client-not-in-org message', () => {
    expect(monthlyPackageErrorI18nKey('Student not found')).toBe('compStu.packageStudentNotFound');
    expect(monthlyPackageErrorI18nKey(' student not found ')).toBe('compStu.packageStudentNotFound');
    expect(monthlyPackageErrorMessage('Student not found', (key) => key === 'compStu.packageStudentNotFound' ? 'localized' : key)).toBe('localized');
  });

  it('leaves other server errors unchanged so operators still see the real cause', () => {
    expect(monthlyPackageErrorI18nKey('Schedule changed; refresh the package preview')).toBeNull();
    expect(monthlyPackageErrorMessage('Schedule changed; refresh the package preview', () => 'nope'))
      .toBe('Schedule changed; refresh the package preview');
  });
});
