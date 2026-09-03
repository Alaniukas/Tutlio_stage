import { describe, expect, it } from 'vitest';
import {
  studentEmailMatchesPayer,
  viewerCanPayLessons,
  viewerSeesLessonPaymentAmounts,
} from '@/lib/lessonPayerView';

describe('lessonPayerView', () => {
  it('matches payer email case-insensitively', () => {
    expect(studentEmailMatchesPayer('Mom@Gmail.com', 'mom@gmail.com')).toBe(true);
    expect(studentEmailMatchesPayer('kid@tutlio.lt', 'parent@tutlio.lt')).toBe(false);
  });

  it('shows amounts for self payer', () => {
    expect(viewerSeesLessonPaymentAmounts('self', 'kid@tutlio.lt', 'kid@tutlio.lt', null)).toBe(true);
  });

  it('hides amounts when parent pays with different email', () => {
    expect(
      viewerSeesLessonPaymentAmounts('parent', 'kid@tutlio.lt', 'kid@tutlio.lt', 'parent@tutlio.lt'),
    ).toBe(false);
  });

  it('shows amounts and pay when parent email equals student and viewer', () => {
    const email = 'aistevelutiene@gmail.com';
    expect(viewerSeesLessonPaymentAmounts('parent', email, email, email)).toBe(true);
    expect(viewerCanPayLessons('parent', email, email, email)).toBe(true);
  });

  it('blocks checkout while payer role unknown', () => {
    expect(viewerCanPayLessons(null, 'a@b.com', 'a@b.com', 'a@b.com')).toBe(false);
  });

  it('blocks checkout for student when parent pays elsewhere', () => {
    expect(
      viewerCanPayLessons('parent', 'kid@tutlio.lt', 'kid@tutlio.lt', 'parent@tutlio.lt'),
    ).toBe(false);
  });
});
