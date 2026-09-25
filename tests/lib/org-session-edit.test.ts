import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MANO_KOREPETITORIUS_ORG_ID, PRO_KLASE_ORG_ID } from '../../src/lib/marketMoney';
import { canEditFutureOrgSeries, canEditOrgSession, orgSessionPriceChangingIds } from '../../src/lib/orgSessionEdit';

const now = new Date('2026-09-25T12:00:00.000Z');
const past = { status: 'completed', start_time: '2026-09-24T10:00:00.000Z', end_time: '2026-09-24T11:00:00.000Z' };

describe('organization lesson editing eligibility', () => {
  it('allows Mano Korepetitorius admins to correct completed and ended active lessons', () => {
    expect(canEditOrgSession(past, MANO_KOREPETITORIUS_ORG_ID, now)).toBe(true);
    expect(canEditOrgSession({ ...past, status: 'active' }, MANO_KOREPETITORIUS_ORG_ID, now)).toBe(true);
  });

  it('keeps other organizations and cancelled lessons restricted', () => {
    expect(canEditOrgSession(past, PRO_KLASE_ORG_ID, now)).toBe(false);
    expect(canEditOrgSession({ ...past, status: 'cancelled' }, MANO_KOREPETITORIUS_ORG_ID, now)).toBe(false);
  });

  it('preserves future editing and limits recurring-series edits to future active lessons', () => {
    const future = { ...past, status: 'active', start_time: '2026-09-26T10:00:00.000Z', end_time: '2026-09-26T11:00:00.000Z' };
    expect(canEditOrgSession(future, PRO_KLASE_ORG_ID, now)).toBe(true);
    expect(canEditFutureOrgSeries(future, now)).toBe(true);
    expect(canEditFutureOrgSeries(past, now)).toBe(false);
  });

  it('preserves editing of class group occurrences in the lesson list', () => {
    expect(canEditOrgSession({ ...past, class_group_id: 'group-1' }, PRO_KLASE_ORG_ID, now, true)).toBe(true);
  });
});

describe('price changes across an organization lesson edit', () => {
  const selected = {
    id: 'selected', status: 'active',
    start_time: '2026-09-26T10:00:00.000Z', end_time: '2026-09-26T11:00:00.000Z',
    recurring_session_id: 'series-1',
  };

  function fakeSessions(rows: Array<{ id: string; price: number }>) {
    const filters: Array<[string, string, string]> = [];
    const query = {
      eq(field: string, value: string) { filters.push(['eq', field, value]); return this; },
      gte(field: string, value: string) { filters.push(['gte', field, value]); return this; },
      then(resolve: (result: { data: typeof rows; error: null }) => void) { resolve({ data: rows, error: null }); },
    };
    const sb = { from: () => ({ select: () => query }) } as unknown as SupabaseClient;
    return { sb, filters };
  }

  it('checks every future series occurrence whose price changes', async () => {
    const { sb, filters } = fakeSessions([
      { id: 'selected', price: 20 }, { id: 'future-same', price: 30 }, { id: 'future-different', price: 25 },
    ]);
    expect(await orgSessionPriceChangingIds(sb, selected, 'all_future', 30)).toEqual(['selected', 'future-different']);
    expect(filters).toEqual([
      ['eq', 'recurring_session_id', 'series-1'],
      ['gte', 'start_time', selected.start_time],
    ]);
  });

  it('limits single edits to the selected lesson and fails if it no longer exists', async () => {
    const single = fakeSessions([{ id: 'selected', price: 20 }]);
    expect(await orgSessionPriceChangingIds(single.sb, selected, 'single', 20)).toEqual([]);
    expect(single.filters).toEqual([['eq', 'id', 'selected']]);
    await expect(orgSessionPriceChangingIds(fakeSessions([]).sb, selected, 'single', 25))
      .rejects.toThrow('not found');
  });

  it('checks all sibling rows in a class group occurrence', async () => {
    const { sb, filters } = fakeSessions([
      { id: 'selected', price: 20 }, { id: 'other-student', price: 25 },
    ]);
    expect(await orgSessionPriceChangingIds(sb, { ...selected, class_group_id: 'group-1' }, 'single', 20))
      .toEqual(['other-student']);
    expect(filters).toEqual([
      ['eq', 'class_group_id', 'group-1'],
      ['eq', 'start_time', selected.start_time],
    ]);
  });
});
