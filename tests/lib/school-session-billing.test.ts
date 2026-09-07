import { describe, expect, it } from 'vitest';
import {
  isSchoolBilledSession,
  shouldShowPerLessonPaymentUi,
  shouldSkipPerLessonPaymentReminders,
} from '../../src/lib/schoolSessionBilling';

describe('schoolSessionBilling', () => {
  it('treats class group sessions as school-billed', () => {
    expect(isSchoolBilledSession({ class_group_id: 'g1' })).toBe(true);
  });

  it('skips per-lesson reminders for school org and class groups', () => {
    expect(shouldSkipPerLessonPaymentReminders({ class_group_id: 'g1' }, 'company')).toBe(true);
    expect(shouldSkipPerLessonPaymentReminders({ price: 20 }, 'school')).toBe(true);
    expect(shouldSkipPerLessonPaymentReminders({ price: 20 }, 'company')).toBe(false);
  });

  it('hides per-lesson payment UI when school billing applies', () => {
    expect(shouldShowPerLessonPaymentUi({ class_group_id: 'g1' }, 'school')).toBe(false);
    expect(shouldShowPerLessonPaymentUi({ price: 15 }, 'company')).toBe(true);
  });
});
