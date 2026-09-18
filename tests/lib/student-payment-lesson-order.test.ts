import { describe, expect, it } from 'vitest';
import { orderStudentPaymentLessons } from '../../src/lib/studentPaymentLessonOrder';

describe('orderStudentPaymentLessons', () => {
  it('shows trial lessons first and otherwise orders lessons from closest to farthest', () => {
    const lessons = [
      { id: 'far', start_time: '2027-06-12T11:00:00.000Z', subject: { is_trial: false } },
      { id: 'trial', start_time: '2027-06-20T11:00:00.000Z', subject: { is_trial: true } },
      { id: 'near', start_time: '2027-05-22T11:00:00.000Z', subject: { is_trial: false } },
      { id: 'middle', start_time: '2027-05-29T11:00:00.000Z', subject: { is_trial: false } },
    ];

    expect(orderStudentPaymentLessons(lessons).map((lesson) => lesson.id)).toEqual([
      'trial',
      'near',
      'middle',
      'far',
    ]);
    expect(lessons.map((lesson) => lesson.id)).toEqual(['far', 'trial', 'near', 'middle']);
  });
});
