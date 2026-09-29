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
type IndividualPrice = { student_id: string; tutor_id: string; subject_id: string; price: number };

function database(rows: MonthlySession[], individualPrices: IndividualPrice[] = []) {
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
        const data = table === 'sessions' ? rows
          : table === 'student_individual_pricing' ? individualPrices
            : [{ id: 'tutor-math', organization_id: 'org' }, { id: 'tutor-lt', organization_id: 'org' }];
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
    expect(result.items).toEqual([{ subjectId: 'math', subjectName: 'Matematika', totalLessons: 7,
      pricePerLesson: 27, itemTotalPrice: 189 }]);
    expect(result.sessionIds).toHaveLength(7);
    expect(tables).not.toContain('recurring_individual_sessions');
  });

  it('pools four Lithuanian and five maths lessons at the shared rate when neither has an individual price', async () => {
    const rows = [
      ...Array.from({ length: 5 }, (_, i) => lesson(`math-${i}`)),
      ...Array.from({ length: 4 }, (_, i) => lesson(`lt-${i}`, { student_id: 'student-lt', tutor_id: 'tutor-lt', subject_id: 'lt', subjects: { name: 'Lietuvių kalba' } })),
      lesson('other-child', { student_id: 'unrelated-student' }),
    ];
    const { db } = database(rows);
    const result = await previewMonthlyStudentPackage(db, 'student-lt', 'org', '2026-10-01');
    expect(result).toMatchObject({ totalLessons: 9, totalPrice: 243, pricePerLesson: 27 });
    expect(result.items).toEqual([
      { subjectId: 'lt', subjectName: 'Lietuvių kalba', totalLessons: 4, pricePerLesson: 27, itemTotalPrice: 108 },
      { subjectId: 'math', subjectName: 'Matematika', totalLessons: 5, pricePerLesson: 27, itemTotalPrice: 135 },
    ]);
  });

  it('quotes each subject at its matching student-specific rate and invalidates changed prices', async () => {
    pricing.mockResolvedValue({ price: 31, lessonsPerWeek: 2, studentIds: ['student-math', 'student-lt'] });
    const rows = [
      ...Array.from({ length: 4 }, (_, i) => lesson(`lt-${i}`, {
        student_id: 'student-lt', tutor_id: 'tutor-lt', subject_id: 'lt', subjects: { name: 'Lietuvių kalba' },
      })),
      ...Array.from({ length: 5 }, (_, i) => lesson(`math-${i}`)),
    ];
    const individualPrices = [
      { student_id: 'student-math', tutor_id: 'tutor-math', subject_id: 'math', price: 25 },
      { student_id: 'unrelated-student', tutor_id: 'tutor-lt', subject_id: 'lt', price: 1 },
    ];
    const { db } = database(rows, individualPrices);

    const result = await previewMonthlyStudentPackage(db, 'student-math', 'org', '2026-10-01');
    expect(result.items).toEqual([
      { subjectId: 'lt', subjectName: 'Lietuvių kalba', totalLessons: 4, pricePerLesson: 31, itemTotalPrice: 124 },
      { subjectId: 'math', subjectName: 'Matematika', totalLessons: 5, pricePerLesson: 25, itemTotalPrice: 125 },
    ]);
    expect(result.totalLessons).toBe(9);
    expect(result.totalPrice).toBe(249);

    individualPrices[0].price = 24;
    const repriced = await previewMonthlyStudentPackage(db, 'student-math', 'org', '2026-10-01');
    expect(repriced.items[1]).toMatchObject({ pricePerLesson: 24, itemTotalPrice: 120 });
    expect(repriced.totalPrice).toBe(244);
    expect(repriced.previewToken).not.toBe(result.previewToken);
  });

  it('uses a valid individual rate even without an organization tier', async () => {
    pricing.mockResolvedValue({ price: null, lessonsPerWeek: 1, studentIds: ['student-math'] });
    const { db } = database([lesson('one')], [
      { student_id: 'student-math', tutor_id: 'tutor-math', subject_id: 'math', price: 25 },
    ]);
    const result = await previewMonthlyStudentPackage(db, 'student-math', 'org', '2026-10-01');
    expect(result).toMatchObject({ pricePerLesson: null, totalPrice: 25 });
    expect(result.items[0]).toMatchObject({ pricePerLesson: 25, itemTotalPrice: 25 });
  });

  it('rejects conflicting rates for the same subject across a pooled identity', async () => {
    pricing.mockResolvedValue({ price: 31, lessonsPerWeek: 1, studentIds: ['student-math', 'student-lt'] });
    const { db } = database([
      lesson('first'),
      lesson('second', { student_id: 'student-lt' }),
    ], [
      { student_id: 'student-math', tutor_id: 'tutor-math', subject_id: 'math', price: 25 },
    ]);
    await expect(previewMonthlyStudentPackage(db, 'student-math', 'org', '2026-10-01'))
      .rejects.toThrow(/Conflicting individual prices/);
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
