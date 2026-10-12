import { describe, expect, it } from 'vitest';
import { effectiveLessonRescheduleStatus } from '../../src/lib/lessonRescheduleApproval';
import { lessonRescheduleApprovalCopy, lessonRescheduleApprovalText } from '../../src/lib/i18n/lessonRescheduleApprovalCopy';
import { LEGACY_LOCALES } from '../../src/lib/i18n/locales';
import { rescheduleApprovalToken, verifyRescheduleApprovalToken } from '../../api/_lib/lessonRescheduleApproval';
import { lessonRescheduleApprovalEmail } from '../../api/_lib/lessonRescheduleApprovalEmail';

describe('reschedule approval links and copy', () => {
  it('binds the signed capability to exactly one request and recipient', () => {
    const token = rescheduleApprovalToken('request-a', 'parent-a', 'test-secret');
    expect(verifyRescheduleApprovalToken('request-a', 'parent-a', token, 'test-secret')).toBe(true);
    expect(verifyRescheduleApprovalToken('request-b', 'parent-a', token, 'test-secret')).toBe(false);
    expect(verifyRescheduleApprovalToken('request-a', 'parent-b', token, 'test-secret')).toBe(false);
    expect(verifyRescheduleApprovalToken('request-a', 'parent-a', token, 'other-secret')).toBe(false);
    expect(verifyRescheduleApprovalToken('request-a', 'parent-a', '', 'test-secret')).toBe(false);
  });
  it('provides the complete shared copy for all 13 baseline locales', () => {
    for (const locale of LEGACY_LOCALES) {
      expect(lessonRescheduleApprovalCopy[locale]).toHaveLength(lessonRescheduleApprovalCopy.lt.length);
      expect(lessonRescheduleApprovalCopy[locale].every(value => value.trim().length > 0)).toBe(true);
      expect(lessonRescheduleApprovalText(locale, 'intro', { student: 'Ona', tutor: 'Rasa' })).not.toContain('{');
    }
  });
  it('keeps final decisions final and expires unanswered proposals', () => {
    expect(effectiveLessonRescheduleStatus('pending', '2026-01-01', Date.parse('2026-10-12'))).toBe('expired');
    expect(effectiveLessonRescheduleStatus('approved', '2026-01-01', Date.parse('2026-10-12'))).toBe('approved');
  });
  it('escapes parent email content and provides both explicit choices', () => {
    const mail = lessonRescheduleApprovalEmail('proposal', {
      tutorName: '<script>', studentName: 'Ona <img>', scope: 'future', reason: '<b>Keitimas</b>',
      oldStart: '2030-10-22T10:00:00Z', oldEnd: '2030-10-22T11:00:00Z',
      newStart: '2030-10-23T12:00:00Z', newEnd: '2030-10-23T13:00:00Z',
      confirmUrl: 'https://tutlio.lt/lesson-reschedule-approval?choice=approved',
      rejectUrl: 'https://tutlio.lt/lesson-reschedule-approval?choice=rejected',
    }, 'lt');
    expect(mail.html).toContain('Patvirtinti');
    expect(mail.html).toContain('Nepatvirtinti');
    expect(mail.html).toContain('choice=approved');
    expect(mail.html).toContain('choice=rejected');
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;b&gt;Keitimas&lt;/b&gt;');
  });
});
