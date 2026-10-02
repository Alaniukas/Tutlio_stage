import { describe, expect, it, vi } from 'vitest';
import { fetchAllRows } from '../../src/lib/fetchAllRows';

describe('complete Supabase pagination', () => {
  it.each([37, 137, 500])('reads all rows when the server caps each response at %s', async cap => {
    const source = Array.from({ length: 1105 }, (_, id) => ({ id }));
    const query = vi.fn(async (from: number, to: number) => ({
      data: source.slice(from, Math.min(to + 1, from + cap)), error: null,
    }));
    expect(await fetchAllRows(query)).toEqual(source);
    expect(query.mock.calls.at(-1)?.[0]).toBe(source.length);
  });

  it('does not return an incomplete list when a later page fails', async () => {
    const query = vi.fn(async (from: number) => from === 0
      ? { data: [{ id: 1 }], error: null }
      : { data: null, error: { message: 'Page unavailable' } });
    await expect(fetchAllRows(query)).rejects.toThrow('Page unavailable');
  });
});
