import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('Company schedule session loading', () => {
  it('paginates the visible calendar window with stable ordering', () => {
    const src = readFileSync('src/pages/company/CompanyTvarkarastis.tsx', 'utf8');
    const scheduleQuery = src.slice(
      src.indexOf('const loadSessionsForWindow = useCallback'),
      src.indexOf('const fetchScheduleMeta = async () =>'),
    );

    expect(scheduleQuery).toContain('scheduleFetchWindow(currentDate, currentView');
    expect(scheduleQuery).toContain('TVARKARASTIS_CALENDAR_SESSION_SELECT');
    expect(scheduleQuery).toContain('fetchAllRows<any>');
    expect(scheduleQuery).toContain(".order('start_time', { ascending: true })");
    expect(scheduleQuery).toContain(".order('id', { ascending: true })");
    expect(scheduleQuery).toContain('.range(from, to)');
    expect(scheduleQuery).not.toContain('addDays(new Date(), -90)');
    expect(scheduleQuery).not.toContain('addDays(new Date(), 180)');
  });
});
