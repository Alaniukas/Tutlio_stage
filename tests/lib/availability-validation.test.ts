import { describe, expect, it, vi } from 'vitest';
import { availabilityRulesOverlap, hasAvailabilityConflict, type AvailabilitySaveRule } from '@/lib/availabilityValidation';
import { loadAvailabilityForTutorIds } from '@/lib/availabilityData';

const today = '2026-10-13';
const weekly: AvailabilitySaveRule = { tutor_id: 'tutor', is_recurring: true, day_of_week: 1,
  start_time: '12:00', end_time: '16:00', start_date: '2026-10-12', end_date: null };

function paginatedClient(rows: AvailabilitySaveRule[], errorAt = Infinity) {
  const range = vi.fn(async (from: number, to: number) => from >= errorAt
    ? { data: null, error: { message: 'Cannot verify availability' } }
    : { data: rows.slice(from, to + 1), error: null });
  const query = { select: () => query, eq: () => query, in: () => query, order: () => query, range };
  return { client: { from: () => query } as never, range };
}

describe('availability validation shared by tutor and administrator', () => {
  it('rejects duplicated and partly overlapping weekly times while allowing adjacent times', () => {
    expect(availabilityRulesOverlap(weekly, weekly, today)).toBe(true);
    expect(availabilityRulesOverlap(weekly, { ...weekly, start_time: '11:30', end_time: '14:00' }, today)).toBe(true);
    expect(availabilityRulesOverlap(weekly, { ...weekly, start_time: '16:00', end_time: '18:00' }, today)).toBe(false);
  });

  it('allows the same hours in separate date ranges, including the boundary weekday', () => {
    expect(availabilityRulesOverlap({ ...weekly, end_date: '2026-11-29' }, { ...weekly, start_date: '2026-11-30' }, today)).toBe(false);
    expect(availabilityRulesOverlap({ ...weekly, end_date: '2026-11-30' }, { ...weekly, start_date: '2026-11-30' }, today)).toBe(true);
    expect(availabilityRulesOverlap({ ...weekly, start_date: '2026-10-13', end_date: '2026-10-18' }, weekly, today)).toBe(false);
    expect(availabilityRulesOverlap({ ...weekly, end_date: '2026-10-12' }, weekly, today)).toBe(false);
  });

  it('isolates tutors, weekdays and date exceptions', () => {
    expect(availabilityRulesOverlap(weekly, { ...weekly, tutor_id: 'other' }, today)).toBe(false);
    expect(availabilityRulesOverlap(weekly, { ...weekly, day_of_week: 2 }, today)).toBe(false);
    const specific = { ...weekly, is_recurring: false, day_of_week: null, specific_date: '2026-10-19' };
    expect(availabilityRulesOverlap(weekly, specific, today)).toBe(false);
    expect(availabilityRulesOverlap(specific, specific, today)).toBe(true);
    expect(availabilityRulesOverlap(specific, { ...specific, specific_date: '2026-10-26' }, today)).toBe(false);
  });

  it('checks the next page before allowing a save and excludes the edited row', async () => {
    const rows = Array.from({ length: 500 }, (_, id) => ({ ...weekly, id: `earlier-${id}`, start_time: '18:00', end_time: '20:00' }));
    rows.push({ ...weekly, id: 'conflict', start_date: '2026-10-13' });
    const { client, range } = paginatedClient(rows);
    expect(await hasAvailabilityConflict(client, weekly)).toBe(true);
    expect(range.mock.calls.map(([from]) => from)).toEqual([0, 500, 501]);
    expect(await hasAvailabilityConflict(client, { ...weekly, id: 'conflict' })).toBe(false);
  });

  it('fails the save check when a later page cannot be loaded', async () => {
    const { client } = paginatedClient(Array.from({ length: 500 }, (_, id) => ({ ...weekly, id: String(id) })), 500);
    await expect(hasAvailabilityConflict(client, weekly)).rejects.toThrow('Cannot verify availability');
  });
});

describe('organization calendar availability pagination', () => {
  it('retains availability after the reported 2,000-row boundary', async () => {
    const rows = Array.from({ length: 2236 }, (_, id) => ({ ...weekly, id: String(id) }));
    const { client, range } = paginatedClient(rows);
    expect(await loadAvailabilityForTutorIds(client, ['tutor'])).toEqual(rows);
    expect(range.mock.calls.map(([from]) => from)).toEqual([0, 500, 1000, 1500, 2000, 2236]);
    expect(await loadAvailabilityForTutorIds(client, [])).toEqual([]);
  });
});
