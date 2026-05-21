import { describe, it, expect } from 'vitest';

function firstRpcRow<T>(data: T | T[] | null | undefined): T | null {
  if (data == null) return null;
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

describe('parent invite preview RPC row parsing', () => {
  it('returns first row from array (avoids maybeSingle 406 on empty)', () => {
    expect(firstRpcRow([])).toBeNull();
    expect(firstRpcRow([{ used: false, parent_email: 'a@b.lt' }])).toEqual({
      used: false,
      parent_email: 'a@b.lt',
    });
  });

  it('passes through single object responses', () => {
    expect(firstRpcRow({ used: true })).toEqual({ used: true });
  });
});
