import { describe, expect, it } from 'vitest';
import { schoolMeetings, schoolMeetingCounts, schoolStudentAttendance } from '../../src/lib/schoolSessionMonitoring';
import { sumSchoolReceipts } from '../../src/lib/schoolStatsRevenue';
import { sumOrgTutorLessonsPayEur } from '../../src/lib/orgTutorLessonPay';
import { filterConductedOrgSessions } from '../../src/lib/orgTutorConductedSessions';
import { countCancellationAttribution } from '../../src/lib/session-stats';

const group = Array.from({ length: 6 }, (_, i) => ({ id: String(i), class_group_id: 'group', tutor_id: 'tutor', student_id: String(i), start_time: '2026-09-08T08:15:00Z', status: 'completed', price: 0, status_confirmed_at: '2026-09-08T09:16:00Z' }));
const pay = (rows: typeof group) => sumOrgTutorLessonsPayEur(filterConductedOrgSessions(schoolMeetings(rows)), 20, null, 'school');

describe('school accounting across group and individual lessons', () => {
  it('pays once for six children, while counting six attendance records', () => {
    expect(schoolMeetingCounts(group).completed).toBe(1);
    expect(pay(group)).toBe(20);
    expect(schoolStudentAttendance(group).reduce((n, row) => n + row.joined, 0)).toBe(6);
  });
  it('does not add another payment when one child misses a conducted group lesson', () => {
    const rows = group.map((row, i) => ({ ...row, status: i === 0 ? 'no_show' : 'completed' }));
    expect(pay(rows)).toBe(20);
    expect(schoolMeetingCounts(rows).completed).toBe(1);
    expect(schoolStudentAttendance(rows).reduce((n, row) => n + row.noShow, 0)).toBe(1);
  });
  it('counts one cancellation and no remuneration for the cancelled group', () => {
    const rows = group.map(row => ({ ...row, status: 'cancelled', cancelled_by: 'tutor' }));
    expect(schoolMeetingCounts(rows).cancelled).toBe(1);
    expect(countCancellationAttribution(schoolMeetings(rows))).toMatchObject({ totalCancelled: 1, cancelledByTutor: 1 });
    expect(pay(rows)).toBe(0);
  });
  it('keeps individual lessons distinct and pays no-show under the existing policy without calling it completed', () => {
    const rows = group.slice(0, 2).map((row, i) => ({ ...row, class_group_id: '', status: i ? 'no_show' : 'completed' }));
    expect(schoolMeetingCounts(rows)).toMatchObject({ completed: 1, no_show: 1 });
    expect(pay(rows)).toBe(40);
  });
  it('recognizes subject-based groups and equivalent timestamp encodings', () => {
    const rows = group.map((row, i) => ({ ...row, class_group_id: '', subject_id: 'art', subjects: { is_group: true }, start_time: i ? '2026-09-08T11:15:00+03:00' : row.start_time }));
    expect(schoolMeetings(rows)).toHaveLength(1);
    expect(pay(rows)).toBe(20);
    expect(schoolMeetings([...rows, { ...rows[0], id: 'next', start_time: '2026-09-09T08:15:00Z' }])).toHaveLength(2);
  });
  it('sums only received money within the period, once per receipt, using cents', () => {
    const receipt = { id: 'a', amount: '24.10', payment_status: 'paid', paid_at: '2026-09-08T10:00:00Z' };
    expect(sumSchoolReceipts([
      receipt, receipt,
      { ...receipt, id: 'b', amount: '6.20' },
      { ...receipt, id: 'c', payment_status: 'pending' },
      { ...receipt, id: 'd', paid_at: null },
      { ...receipt, id: 'e', paid_at: '2026-08-31T10:00:00Z' },
    ], '2026-09-01T00:00:00Z', '2026-09-30T23:59:59Z')).toBe(30.30);
  });
});
