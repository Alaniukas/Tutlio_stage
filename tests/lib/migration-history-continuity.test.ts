import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationDir = resolve(process.cwd(), 'supabase/migrations');

// These versions are already recorded in the production migration ledger.
// Renaming one would make Supabase try to replay the SQL under a new version.
const productionVersions = [
  '20260327000001_per_student_payment_and_booking_restriction.sql',
  '20260328120000_add_no_show_status.sql',
  '20260328130000_add_trial_lesson.sql',
  '20260329200002_org_features_column.sql',
  '20260329200003_org_suspension.sql',
  '20260329200004_org_lesson_edit_permissions.sql',
  '20260819162538_sessions_is_complimentary.sql',
  '20260820164051_pvm_invoice_numbering.sql',
  '20260820170026_pvm_invoice_numbering.sql',
  '20260821151936_school_teacher_contracts.sql',
  '20260826094637_parent_legal_and_invite_org.sql',
  '20260826121910_school_extra_lessons.sql',
  '20260826121932_school_student_enrollment_filters.sql',
  '20260827095137_extra_lessons_start_within_14.sql',
  '20260827144358_handle_new_user_skip_parent.sql',
  '20260827144421_capacity_background_job_rpcs.sql',
  '20260827145351_get_auth_user_id_by_email.sql',
  '20260827155030_parent_invite_preview_student_fields.sql',
  '20260831182026_students_deletion_requested_at.sql',
  '20260831182602_blog_auto_all_locales.sql',
  '20260902183514_tutor_pay_by_subject.sql',
  '20260903154617_org_admin_role_permission_presets.sql',
  '20260903155101_revert_org_admin_role_permission_presets.sql',
  '20260903160641_allow_multiple_org_owners.sql',
  '20260903161001_fix_students_school_tutor_select_recursion.sql',
  '20260903172018_org_admin_role_permission_presets_reapply.sql',
  '20260905121044_update_extra_lessons_template_uzsiemimai.sql',
  '20260905121111_update_extra_lessons_template_body_uzsiemimai.sql',
  '20260905121157_update_extra_lessons_template_body_uzsiemimai_v3.sql',
  '20260905121333_update_extra_lessons_template_body_replace_chain.sql',
  '20260905131429_extra_lessons_template_uzsiemimai_laisvi.sql',
  '20260906110349_school_class_group_calendar_name.sql',
  '20260907123727_grant_chat_recipients_allow_messages.sql',
  '20260907215717_proklase_paid_trial_invoice.sql',
  '20260907215738_payment_invoice_query_indexes.sql',
  '20260908080306_school_reminder_recipient_parity.sql',
  '20260908080341_school_member_schedule.sql',
  '20260908081019_session_storage_lookup_index.sql',
  '20260908083019_admin_provisioned_student_trigger.sql',
  '20260908084926_atomic_school_group_save.sql',
  '20260908085040_school_monthly_invoice_delivery.sql',
  '20260908094256_school_session_billing_evidence_guard.sql',
  '20260908170000_org_student_pooled_packages.sql',
  '20260908173000_org_identity_pricing_frequency.sql',
  '20260908230000_school_acceptance_jobs.sql',
  '20260909010000_unambiguous_student_email_link.sql',
  '20260909011000_safe_student_signup_trigger.sql',
  '20260909012000_atomic_parent_child_creation.sql',
  '20260909145447_org_visible_tutors_used_invite_email.sql',
  '20260910125413_subjects_select_parent.sql',
  '20260910130054_parent_rls_unified_access.sql',
  '20260910130347_parent_rls_unified_access_part2.sql',
  '20260910130353_parent_rls_unified_access_part3.sql',
  '20260910130358_parent_rls_unified_access_part4.sql',
  '20260910130418_parent_rls_reschedule_and_profiles_rpc.sql',
  '20260910143720_parent_rls_unified_access.sql',
  '20260910154207_availability_start_date.sql',
] as const;

const retiredRenames = [
  '20260327000001_org_admin_calendar_features.sql',
  '20260328120000_remote_history_placeholder.sql',
  '20260328130000_remote_history_placeholder.sql',
  '20260329200002_remote_history_placeholder.sql',
  '20260329200003_remote_history_placeholder.sql',
  '20260329200004_remote_history_placeholder.sql',
  '20260819120000_sessions_is_complimentary.sql',
  '20260820120000_pvm_invoice_numbering.sql',
  '20260821150000_school_teacher_contracts.sql',
  '20260825171248_capacity_background_jobs.sql',
  '20260826100000_parent_legal_and_invite_org.sql',
  '20260826140000_school_extra_lessons.sql',
  '20260826150000_school_student_enrollment_filters.sql',
  '20260827120000_extra_lessons_start_within_14.sql',
  '20260827140000_handle_new_user_skip_parent.sql',
  '20260827150000_get_auth_user_id_by_email.sql',
  '20260827160000_parent_invite_preview_student_fields.sql',
  '20260831180000_blog_auto_all_locales.sql',
  '20260831180100_students_deletion_requested_at.sql',
  '20260902190000_tutor_pay_by_subject.sql',
  '20260903160000_org_admin_role_permission_presets.sql',
  '20260903170000_allow_multiple_org_owners.sql',
  '20260903180000_school_tutor_student_visibility.sql',
  '20260903190000_fix_students_school_tutor_select_recursion.sql',
  '20260905130000_extra_lessons_template_uzsiemimai.sql',
  '20260905140000_extra_lessons_template_uzsiemimai_laisvi.sql',
  '20260906100000_school_class_group_calendar_name.sql',
  '20260907123000_grant_chat_recipients_allow_messages.sql',
  '20260909154500_org_visible_tutors_used_invite_email.sql',
  '20260910140000_parent_rls_unified_access.sql',
  '20260910160000_availability_start_date.sql',
  '20260910170000_school_monthly_invoice_delivery.sql',
  '20260910171000_school_acceptance_jobs.sql',
  '20260910172000_unambiguous_student_email_link.sql',
] as const;

describe('production migration history continuity', () => {
  it.each(productionVersions)('keeps the production-recorded migration %s', (filename) => {
    expect(existsSync(resolve(migrationDir, filename))).toBe(true);
  });

  it.each(retiredRenames)('does not replay a historical migration as %s', (filename) => {
    expect(existsSync(resolve(migrationDir, filename))).toBe(false);
  });
});
