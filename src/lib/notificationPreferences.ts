import { orgRequiresTutorStatusConfirmation } from './sessionStatusConfirmation.js';
import { schoolMaterialDigestsEnabled } from './schoolNotificationPolicy.js';
import { isWaitlistHiddenForOrg } from './marketMoney.js';

export const NOTIFICATION_KEYS = [
  'lesson_reminders', 'lesson_updates', 'lesson_feedback', 'school_materials',
  'attendance_updates', 'payment_reminders', 'payment_updates', 'messages',
  'waitlist', 'availability_changes', 'lesson_status_reminders',
  'student_assignments', 'contract_updates', 'product_updates',
] as const;
export type NotificationKey = typeof NOTIFICATION_KEYS[number];
export type NotificationPortal = 'tutor' | 'student' | 'parent' | 'org_admin';
export type NotificationChoice = { key: NotificationKey; enabled: boolean };

export function isNotificationKey(value: unknown): value is NotificationKey {
  return typeof value === 'string' && (NOTIFICATION_KEYS as readonly string[]).includes(value);
}

/** Only optional alerts belong here. Account access, invoices, receipts and
 * contract documents remain deliverable regardless of these preferences. */
const TYPE_CATEGORY: Readonly<Record<string, NotificationKey>> = {
  session_reminder: 'lesson_reminders',
  session_reminder_payer: 'lesson_reminders',
  booking_confirmation: 'lesson_updates',
  recurring_booking_confirmation: 'lesson_updates',
  booking_notification: 'lesson_updates',
  lesson_confirmed_tutor: 'lesson_updates',
  mv_first_lesson_planned_tutor: 'lesson_updates',
  session_cancelled: 'lesson_updates',
  session_cancelled_parent: 'lesson_updates',
  lesson_rescheduled: 'lesson_updates',
  school_extra_first_lesson_invite: 'lesson_updates',
  session_comment_added: 'lesson_feedback',
  school_material_digest: 'school_materials',
  session_student_no_show: 'attendance_updates',
  payment_reminder: 'payment_reminders',
  payment_after_lesson_reminder: 'payment_reminders',
  payment_rejection_reminder: 'payment_reminders',
  school_installment_request: 'payment_reminders',
  payment_review_needed: 'payment_updates',
  payment_deadline_warning_tutor: 'payment_updates',
  payment_deadline_warning_org_admin: 'payment_updates',
  payment_received_tutor: 'payment_updates',
  penalty_payment_tutor: 'payment_updates',
  chat_new_message: 'messages',
  chat_message_digest: 'messages',
  waitlist_added: 'waitlist',
  waitlist_matched_student: 'waitlist',
  waitlist_matched_tutor: 'waitlist',
  org_tutor_availability_notice: 'availability_changes',
  lesson_status_confirmation_reminder: 'lesson_status_reminders',
  tutor_student_assigned: 'student_assignments',
  school_contract_completion_admin: 'contract_updates',
  school_contract_parent_signed_admin: 'contract_updates',
  product_update_sf_chat: 'product_updates',
  product_update_whiteboard_tutor: 'product_updates',
  product_update_whiteboard_student: 'product_updates',
  product_update_whiteboard_parent: 'product_updates',
  custom_html_announcement: 'product_updates',
};

export function notificationKeyForType(type: unknown): NotificationKey | null {
  return typeof type === 'string' ? TYPE_CATEGORY[type] || null : null;
}

export type NotificationOrganization = {
  id: string;
  email?: string | null;
  entity_type?: string | null;
  features?: Record<string, unknown> | null;
  canMessage?: boolean;
  canViewFinance?: boolean;
  canViewContracts?: boolean;
};
export type NotificationContext = {
  portal: NotificationPortal;
  organizations: NotificationOrganization[];
  /** A family can have children with organizations and solo tutors. */
  hasSoloTutor?: boolean;
  studentPays?: boolean;
  studentReceivesAttendanceAlerts?: boolean;
  parentReceivesWaitlistAlerts?: boolean;
};

/** Match the same feature switches as the senders, including legacy org rules. */
export function availableNotificationKeys(context: NotificationContext): NotificationKey[] {
  const { portal, organizations } = context;
  const keys = new Set<NotificationKey>(['product_updates']);
  if (portal !== 'org_admin') {
    keys.add('lesson_reminders');
    keys.add('lesson_updates');
  }
  if (portal === 'parent' || portal === 'student') {
    keys.add('lesson_feedback');
    if (portal === 'parent' || context.studentReceivesAttendanceAlerts) keys.add('attendance_updates');
    if (portal === 'parent' || context.studentPays) keys.add('payment_reminders');
    if (organizations.some(org => org.entity_type === 'school' && schoolMaterialDigestsEnabled(org.features))) {
      keys.add('school_materials');
    }
  }
  if (portal === 'org_admin') {
    if (organizations.some(org => org.canMessage)) keys.add('messages');
    if (organizations.some(org => org.canViewFinance && org.entity_type !== 'school'
      && !(Array.isArray(org.features?.admin_email_opt_out)
        && org.features.admin_email_opt_out.includes('payment_deadline_warning')))) {
      keys.add('payment_updates');
    }
    if (organizations.some(org => org.entity_type === 'school' && org.canViewContracts)) keys.add('contract_updates');
  } else {
    keys.add('messages');
    if ((portal !== 'parent' || context.parentReceivesWaitlistAlerts)
      && (context.hasSoloTutor || organizations.length === 0
        || organizations.some(org => org.entity_type !== 'school' && org.features?.disable_waitlist !== true
          && !isWaitlistHiddenForOrg(org.id)))) {
      keys.add('waitlist');
    }
  }
  if (portal === 'tutor') {
    if (organizations.length === 0) keys.add('payment_updates');
    else {
      keys.add('availability_changes');
      if (organizations.some(org => orgRequiresTutorStatusConfirmation(org.id, org.features))) keys.add('lesson_status_reminders');
      if (organizations.some(org => org.features?.notify_tutors_on_student_assign === true)) keys.add('student_assignments');
    }
  }
  return NOTIFICATION_KEYS.filter(key => {
    if (!keys.has(key)) return false;
    if (portal !== 'parent' || context.hasSoloTutor || !organizations.length) return true;
    const legacyKey = key === 'lesson_feedback' || key === 'school_materials' ? 'lesson_updates' : key;
    return !organizations.every(org => Array.isArray(org.features?.parent_email_opt_out)
      && org.features.parent_email_opt_out.includes(legacyKey));
  });
}

export function legacyNotificationEnabled(key: NotificationKey, portal: NotificationPortal,
  profileOptOut: unknown, parentOptOut: unknown, disableParentReminders = false): boolean {
  const profile = Array.isArray(profileOptOut) ? profileOptOut : [];
  const parent = Array.isArray(parentOptOut) ? parentOptOut : [];
  if (portal === 'parent') {
    if (key === 'lesson_reminders') return !disableParentReminders && !parent.includes(key);
    if (key === 'lesson_feedback' || key === 'school_materials') return !parent.includes('lesson_updates');
    return !parent.includes(key);
  }
  if (portal === 'tutor') {
    if (key === 'lesson_reminders') return !profile.includes('lesson_reminder_tutor');
    if (key === 'availability_changes') return !profile.includes('org_tutor_availability_notice');
    if (key === 'payment_updates') return !profile.includes('payment_deadline_warning');
  }
  return true;
}
