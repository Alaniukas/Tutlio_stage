import { describe, expect, it } from 'vitest';
import { availableNotificationKeys, legacyNotificationEnabled, notificationKeyForType } from '../../src/lib/notificationPreferences';
import { PRO_KLASE_ORG_ID } from '../../src/lib/marketMoney';

const company = { id: 'company', entity_type: 'company', features: {} };
const school = { id: 'school', entity_type: 'school', features: {} };
describe('personal notification choices', () => {
  it('offers solo tutors their payments but no organization-only alerts', () => {
    const keys = availableNotificationKeys({ portal: 'tutor', organizations: [] });
    expect(keys).toEqual(['lesson_reminders', 'lesson_updates', 'payment_updates', 'messages', 'waitlist', 'product_updates']);
  });
  it('matches school and company tutor feature flags without exposing client finance alerts', () => {
    expect(availableNotificationKeys({ portal: 'tutor', organizations: [company] }))
      .toEqual(['lesson_reminders', 'lesson_updates', 'messages', 'waitlist', 'availability_changes', 'product_updates']);
    const keys = availableNotificationKeys({ portal: 'tutor', organizations: [{ ...school,
      features: { notify_tutors_on_student_assign: true, tutor_lesson_status_confirmation: true } }] });
    expect(keys).toContain('lesson_status_reminders');
    expect(keys).toContain('student_assignments');
    expect(keys).not.toContain('waitlist');
    expect(keys).not.toContain('payment_updates');
    expect(availableNotificationKeys({ portal: 'tutor', organizations: [{ ...company, id: PRO_KLASE_ORG_ID }] })).not.toContain('waitlist');
  });
  it('hides student payment alerts when parents pay and material alerts before feature activation', () => {
    const keys = availableNotificationKeys({ portal: 'student', organizations: [school], studentPays: false });
    expect(keys).not.toContain('payment_reminders');
    expect(keys).not.toContain('school_materials');
    expect(keys).not.toContain('attendance_updates');
    expect(availableNotificationKeys({ portal: 'student', organizations: [], studentReceivesAttendanceAlerts: true })).toContain('attendance_updates');
    expect(availableNotificationKeys({ portal: 'student', studentPays: true, organizations: [
      { ...school, features: { school_family_portal: true } },
    ] })).toContain('school_materials');
  });
  it('respects parent delivery master switches but unions options for mixed families', () => {
    const muted = { ...company, features: { parent_email_opt_out: ['lesson_updates', 'payment_reminders'], disable_waitlist: true } };
    const keys = availableNotificationKeys({ portal: 'parent', organizations: [muted] });
    expect(keys).not.toContain('lesson_updates');
    expect(keys).not.toContain('lesson_feedback');
    expect(keys).not.toContain('payment_reminders');
    expect(keys).not.toContain('waitlist');
    const mixed = availableNotificationKeys({ portal: 'parent', organizations: [muted, company] });
    expect(mixed).toContain('lesson_updates');
    expect(mixed).toContain('payment_reminders');
    expect(availableNotificationKeys({ portal: 'parent', organizations: [muted], hasSoloTutor: true })).not.toContain('waitlist');
    expect(availableNotificationKeys({ portal: 'parent', organizations: [muted], hasSoloTutor: true, parentReceivesWaitlistAlerts: true })).toContain('waitlist');
  });
  it('gives administrators only notifications covered by their permissions', () => {
    expect(availableNotificationKeys({ portal: 'org_admin', organizations: [{ ...school, canViewContracts: true }] }))
      .toEqual(['contract_updates', 'product_updates']);
    expect(availableNotificationKeys({ portal: 'org_admin', organizations: [company] })).toEqual(['product_updates']);
    expect(availableNotificationKeys({ portal: 'org_admin', organizations: [{ ...company, canMessage: true, canViewFinance: true }] }))
      .toEqual(['payment_updates', 'messages', 'product_updates']);
  });
  it('preserves existing tutor and parent opt-outs, including the former grouped parent updates', () => {
    expect(legacyNotificationEnabled('lesson_reminders', 'tutor', ['lesson_reminder_tutor'], [])).toBe(false);
    expect(legacyNotificationEnabled('availability_changes', 'tutor', ['org_tutor_availability_notice'], [])).toBe(false);
    expect(legacyNotificationEnabled('lesson_feedback', 'parent', [], ['lesson_updates'])).toBe(false);
    expect(legacyNotificationEnabled('school_materials', 'parent', [], ['lesson_updates'])).toBe(false);
    expect(legacyNotificationEnabled('lesson_reminders', 'parent', [], [], true)).toBe(false);
  });
  it('classifies optional alerts and leaves mandatory documents outside opt-out categories', () => {
    expect(notificationKeyForType('chat_new_message')).toBe('messages');
    expect(notificationKeyForType('session_comment_added')).toBe('lesson_feedback');
    expect(notificationKeyForType('school_material_digest')).toBe('school_materials');
    for (const type of ['invite_email', 'parent_invite', 'school_contract', 'school_monthly_invoice',
      'monthly_invoice', 'payment_success', 'school_contract_extra_accepted', 'unknown']) {
      expect(notificationKeyForType(type)).toBeNull();
    }
  });
});
