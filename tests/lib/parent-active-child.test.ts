import { describe, expect, it, beforeEach } from 'vitest';
import { pickParentChildId, PARENT_ACTIVE_CHILD_KEY } from '@/lib/parentActiveChild';

describe('pickParentChildId', () => {
  beforeEach(() => {
    localStorage.removeItem(PARENT_ACTIVE_CHILD_KEY);
  });

  it('prefers a valid URL / explicit id', () => {
    localStorage.setItem(PARENT_ACTIVE_CHILD_KEY, 'stored');
    expect(pickParentChildId(['a', 'b', 'stored'], 'b')).toBe('b');
  });

  it('falls back to stored id when it still belongs to the parent', () => {
    localStorage.setItem(PARENT_ACTIVE_CHILD_KEY, 'stored');
    expect(pickParentChildId(['a', 'stored'], null)).toBe('stored');
  });

  it('falls back to the first child when stored id is gone', () => {
    localStorage.setItem(PARENT_ACTIVE_CHILD_KEY, 'gone');
    expect(pickParentChildId(['a', 'b'], null)).toBe('a');
  });
});
