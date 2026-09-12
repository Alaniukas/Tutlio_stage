import { beforeEach, describe, expect, it, vi } from 'vitest';
import { previewMonthlyStudentPackage, type MonthlySession } from '../../api/_lib/monthlyStudentPackage';

const pricing = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/orgStudentPricing.js', () => ({ fetchOrgStudentDynamicPrice: pricing }));

function lesson(id: string, overrides: Partial<MonthlySession> = {}): MonthlySession {
  return { id, student_id: 'student-math', tutor_id: 'tutor-math', subject_id: 'math',
    start_time: '2026-10-15T13:00:00Z', status: 'active', paid: false, lesson_package_id: null,
    subjects: { name: 'Matematika' }, ...overrides };
}

// Apply the actual query bounds, including Vilnius UTC offsets around DST.
function database(rows: MonthlySession[]) {
  const tables: string[] = [];
  const db = { from(table: string) {
    tables.push(table);
    const filters: Array<(row: any) => boolean> = [];
    const query: any = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
      gte: (key: string, value: string) => { filters.push(row => row[key] >= value); return query; },
      lt: (key: string, value: string) => { filters.push(row => row[key] < value); return query; },
      then: (resolve: any, reject: any) => {
        const data = table === 'sessions' ? rows : [
          { id: 'tutor-math', organization_id: 'org' }, { id: 'tutor-lt', organization_id: 'org' },
        ];
        return Promise.resolve({ data: data.filter(row => filters.every(filter => filter(row))), error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
  return { db: db as any, tables };
}

describe('consolidated future monthly calendar preview', () => {
  beforeEach(() => {
    pricing.mockReset().mockResolvedValue({ price: 27, lessonsPerWeek: 2, studentIds: ['student-math', 'student-lt'] });
  });

  it('charges seven actual future lessons at the two/week rate, never ten estimated credits', async () => {
    const { db, tables } = database(Array.from({ length: 7 }, (_, i) => lesson(`lesson-${i}`)));
    const result = await previewMonthlyStudentPackage(db, 'student-math', 'org', '2026-10-01');
    expect(result).toMatchObject({ totalLessons: 7, pricePerLesson: 27, totalPrice: 189, lessonsPerWeek: 2,
      periodEnd: '2026-10-31', nextGenerationDate: '2026-11-01' });
    expect(result.sessionIds).toHaveLength(7);
    expect(tables).not.toContain('recurring_individual_sessions');
  });

  it('pools four Lithuanian and five maths lessons with one price across tutors', async () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => lesson(`math-${i}`)),
      ...Array.from({ length: 4 }, (_, i) => lesson(`lt-${i}`, { student_id: 'student-lt', tutor_id: 'tutor-lt', subject_id: 'lt', subjects: { name: 'Lietuvių kalba' } })),
      lesson('other-child', { student_id: 'unrelated-student' }),
    ];
    const { db } = database(rows);
    const result = await previewMonthlyStudentPackage(db, 'student-lt', 'org', '2026-10-01');
    expect(result).toMatchObject({ totalLessons: 9, totalPrice: 243, pricePerLesson: 27 });
    expect(result.items).toEqual([
      { subjectId: 'lt', subjectName: 'Lietuvių kalba', totalLessons: 4 },
      { subjectId: 'math', subjectName: 'Matematika', totalLessons: 5 },
    ]);
  });

  it('counts current moved dates and completed unpaid lessons, excluding cancellations and already covered lessons', async () => {
    const { db } = database([
      lesson('moved-in', { start_time: '2026-09-30T21:00:00Z' }), // October 1 midnight Vilnius
      lesson('completed', { status: 'completed' }),
      lesson('last-day', { start_time: '2026-10-31T21:59:59Z' }),
      lesson('moved-out', { start_time: '2026-10-31T22:00:00Z' }), // November 1 midnight Vilnius
      lesson('previous-month', { start_time: '2026-09-30T20:59:59Z' }),
      lesson('cancelled', { status: 'cancelled' }), lesson('paid', { paid: true }),
      lesson('covered', { lesson_package_id: 'existing' }), lesson('trial', { subjects: { name: 'Trial', is_trial: true } }),
      lesson('free', { is_complimentary: true }), lesson('makeup', { is_makeup: true }),
    ]);
    const result = await previewMonthlyStudentPackage(db, 'student-math', 'org', '2026-10-01');
    expect(result.sessionIds).toEqual(['completed', 'last-day', 'moved-in']);
    expect(result.totalLessons).toBe(3);
  });

  it('does not invent future credits when no calendar rows exist', async () => {
    const { db } = database([]);
    await expect(previewMonthlyStudentPackage(db, 'student-math', 'org', '2026-11-01')).rejects.toThrow();
  });

  it('invalidates the preview when an actual date moves even if quantity and rate stay the same', async () => {
    const rows = [lesson('one')];
    const { db } = database(rows);
    const before = await previewMonthlyStudentPackage(db, 'student-math', 'org', '2026-10-01');
    rows[0].start_time = '2026-10-16T13:00:00Z';
    const after = await previewMonthlyStudentPackage(db, 'student-math', 'org', '2026-10-01');
    expect(after.totalPrice).toBe(before.totalPrice);
    expect(after.previewToken).not.toBe(before.previewToken);
  });
});
