import { describe, expect, it, vi } from 'vitest';
import { fetchOrganizationRow } from '@/lib/orgLookup';

describe('fetchOrganizationRow', () => {
  it('loads organizations by id without an admin-seat embed', async () => {
    const selects: string[] = [];
    const sb = {
      from(table: string) {
        return {
          select(columns: string) {
            selects.push(`${table}:${columns}`);
            return {
              eq() {
                return this;
              },
              async maybeSingle() {
                return { data: { name: 'Mokykla' }, error: null };
              },
            };
          },
        };
      },
    };
    const row = await fetchOrganizationRow<{ name: string }>(sb as any, 'org-1', 'name');
    expect(row).toEqual({ name: 'Mokykla' });
    expect(selects).toEqual(['organizations:name']);
  });
});
