import { describe, expect, it } from 'vitest';
import { dedupeParentChildren, findExistingParentChild } from '@/lib/parentChildIdentity';
import { MOKSLO_VAISIAI_ORG_ID } from '@/lib/marketMoney';
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

  it('hides an empty retry duplicate for the same child and tutor', () => {
    expect(dedupeParentChildren([
      { id: 'empty', full_name: 'Marija Bukataja', tutor_id: 'tutor-1', organization_id: MOKSLO_VAISIAI_ORG_ID },
      { id: 'real', full_name: 'Marija Bukataja', tutor_id: 'tutor-1', organization_id: MOKSLO_VAISIAI_ORG_ID, linked_user_id: 'student-user' },
      { id: 'other-tutor', full_name: 'Marija Bukataja', tutor_id: 'tutor-2', organization_id: MOKSLO_VAISIAI_ORG_ID },
    ]).map((child) => child.id)).toEqual(['real', 'other-tutor']);
  });

  it('does not collapse same-name rows for other organizations', () => {
    expect(dedupeParentChildren([
      { id: 'one', full_name: 'Same Name', tutor_id: 'tutor-1', organization_id: 'other-org' },
      { id: 'two', full_name: 'Same Name', tutor_id: 'tutor-1', organization_id: 'other-org' },
    ])).toHaveLength(2);
  });

  it('does not merge unnamed or pending-registration child rows', () => {
    expect(dedupeParentChildren([
      { id: 'one', full_name: 'Laukiama registracijos', tutor_id: 'tutor-1' },
      { id: 'two', full_name: 'Laukiama registracijos', tutor_id: 'tutor-1' },
    ])).toHaveLength(2);
  });
});
