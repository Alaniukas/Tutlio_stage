import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('Company schedule session loading', () => {
  it('paginates the complete organization schedule with stable ordering', () => {
    const src = readFileSync('src/pages/company/CompanyTvarkarastis.tsx', 'utf8');
    const scheduleQuery = src.slice(
      src.indexOf('// Fetch sessions for org tutors'),
      src.indexOf('const parsedSessions'),
    );

    expect(scheduleQuery).toContain('fetchAllRows<any>');
    expect(scheduleQuery).toContain(".order('start_time', { ascending: true })");
    expect(scheduleQuery).toContain(".order('id', { ascending: true })");
    expect(scheduleQuery).toContain('.range(from, to)');
    expect(scheduleQuery).not.toContain('.limit(1000)');
  });
});
