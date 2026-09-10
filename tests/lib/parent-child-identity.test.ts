import { describe, expect, it } from 'vitest';
import { findExistingParentChild } from '@/lib/parentChildIdentity';
describe('parent add-child duplicate prevention', () => {
  it('recognizes an existing named child despite case and extra spaces', () => {
    const child = { id: 'existing', full_name: 'Vardytė Pavardytė' };
    expect(findExistingParentChild([child], '  VARDYTĖ   PAVARDYTĖ ')).toBe(child);
  });
  it('does not guess which placeholder belongs to a named child', () => {
    expect(findExistingParentChild([{ full_name: 'Laukiama registracijos' }], 'Emilija Jaugaitė')).toBeUndefined();
  });
  it('does not confuse siblings or select archived records', () => {
    expect(findExistingParentChild([{ full_name: 'Emilija Jaugaitė' }, { full_name: 'Vardytė Pavardytė', detached_at: '2026-09-08' }], 'Vardytė Pavardytė')).toBeUndefined();
  });
});
