import { describe, expect, it } from 'vitest';
import { isPendingChildName, sanitizeStudentNameForEmail } from '@/lib/pendingChildName';

describe('pendingChildName', () => {
  it('detects empty and Lithuanian placeholder', () => {
    expect(isPendingChildName('')).toBe(true);
    expect(isPendingChildName('   ')).toBe(true);
    expect(isPendingChildName('Laukiama registracijos')).toBe(true);
    expect(isPendingChildName('Pending registration')).toBe(true);
  });

  it('accepts real names', () => {
    expect(isPendingChildName('Mantas Petraitis')).toBe(false);
  });

  it('sanitizes placeholder names for emails', () => {
    expect(sanitizeStudentNameForEmail('Laukiama registracijos')).toBe('Mokinys');
    expect(sanitizeStudentNameForEmail('Ona')).toBe('Ona');
  });
});
