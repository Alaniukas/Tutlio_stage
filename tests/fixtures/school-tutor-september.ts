/** Eight scheduled meetings, with only the last six actually conducted. */
export function schoolTutorSeptemberRows(organizationId: string, firstWeekCancelled = false) {
  return [7, 9, 14, 16, 21, 23, 28, 30].flatMap((day, index) => {
    const date = `2026-09-${String(day).padStart(2, '0')}`;
    const start_time = `${date}T${index % 2 === 0 ? '14' : '09'}:00:00+03:00`;
    const end_time = `${date}T${index % 2 === 0 ? '15' : '10'}:00:00+03:00`;
    const status = index < 2 && firstWeekCancelled ? 'cancelled' : 'completed';
    return [0, 1].map(child => ({
      id: `september-${day}-child-${child}`,
      student_id: `child-${child}`,
      tutor_id: 'teacher',
      class_group_id: index % 2 === 0 ? 'seniors' : 'juniors',
      subject_id: null,
      start_time,
      end_time,
      status,
      // Old valid history retains its end-time stamp. New automatic completed
      // rows without confirmation must not increase either pay or lesson count.
      status_confirmed_at: index >= 2 || firstWeekCancelled ? end_time : null,
      status_confirmed_by: null,
      tutor_pay_eur_snapshot: 45,
      tutor_joined_at: null,
      student_joined_at: null,
      students: { organization_id: organizationId, full_name: `Student ${child}` },
    }));
  });
}
