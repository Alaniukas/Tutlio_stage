import { describe, expect, it, vi } from 'vitest';
import { readAllSchoolBillingRows } from '../../api/_lib/schoolBillingPagination';

describe('school billing pagination', () => {
  it('reads more than 1000 rows even when the server caps each page below the requested size', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ id: String(index).padStart(6, '0') }));
    const read = vi.fn(async (after: string | null) => ({ data: rows.filter((row) => !after || row.id > after).slice(0, 200), error: null }));
    const result = await readAllSchoolBillingRows(read);
    expect(result.data).toEqual(rows);
    expect(read).toHaveBeenCalledTimes(7);
  });
  it('does not expose partial billing rows after a later page fails', async () => {
    const result = await readAllSchoolBillingRows(async (after) => after
      ? { data: null, error: { message: 'unavailable' } }
      : { data: [{ id: 'first' }], error: null });
    expect(result).toEqual({ data: [], error: { message: 'unavailable' } });
  });
});
