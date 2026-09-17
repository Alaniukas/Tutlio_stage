import { describe, expect, it } from 'vitest';
import { buildInAppSupportCustomerContext } from '../../api/_lib/inAppSupportCustomerContext';

describe('in-app support customer function isolation', () => {
  it('includes only enabled school functions allowed by the administrator permissions', () => {
    const context = buildInAppSupportCustomerContext({
      page: '/school/contracts',
      organizations: [{
        id: 'org-school',
        entity_type: 'school',
        features: {
          school_class_groups: true,
          school_lesson_recordings: false,
          student_card_booking: true,
        },
        perlas_finance_enabled: false,
      }],
      adminSeats: [{
        organization_id: 'org-school',
        role: 'custom',
        permissions: { 'sessions.view': true },
      }],
    });

    expect(context.organizationId).toBe('org-school');
    expect(context.entityType).toBe('school');
    expect(context.enabledFeatureIds).toContain('school_class_groups');
    expect(context.enabledFeatureIds).toContain('school_activity_labels');
    expect(context.enabledFeatureIds).not.toContain('school_lesson_recordings');
    expect(context.enabledFeatureIds).not.toContain('student_card_booking');
    expect(context.functionContext).not.toContain('Book lessons from the student card');
  });

  it('does not expose organization-admin-only features to a student', () => {
    const context = buildInAppSupportCustomerContext({
      page: '/student/sessions',
      organizations: [{
        id: 'org-company',
        entity_type: 'school',
        features: {
          org_admin_calendar_full_control: true,
          school_class_groups: true,
          disable_student_booking: true,
        },
        perlas_finance_enabled: false,
      }],
    });

    expect(context.enabledFeatureIds).toContain('school_class_groups');
    expect(context.enabledFeatureIds).toContain('disable_student_booking');
    expect(context.enabledFeatureIds).not.toContain('org_admin_calendar_full_control');
    expect(context.functionContext).not.toContain('Org Admin Full Calendar Control');
  });

  it('uses only the common feature intersection when a user belongs to multiple customers', () => {
    const context = buildInAppSupportCustomerContext({
      page: '/parent',
      organizations: [
        {
          id: 'org-a',
          entity_type: 'school',
          features: { school_class_groups: true, school_lesson_recordings: true },
          perlas_finance_enabled: false,
        },
        {
          id: 'org-b',
          entity_type: 'school',
          features: { school_class_groups: true, school_lesson_recordings: false },
          perlas_finance_enabled: false,
        },
      ],
    });

    expect(context.organizationId).toBeNull();
    expect(context.enabledFeatureIds).toContain('school_class_groups');
    expect(context.enabledFeatureIds).not.toContain('school_lesson_recordings');
  });

  it('does not expose school-only functions to a company even if stale flags exist', () => {
    const context = buildInAppSupportCustomerContext({
      page: '/company/students',
      organizations: [{
        id: 'org-company',
        entity_type: 'company',
        features: { school_class_groups: true, school_lesson_recordings: true },
        perlas_finance_enabled: false,
      }],
      adminSeats: [{
        organization_id: 'org-company',
        role: 'owner',
        permissions: {},
      }],
    });

    expect(context.enabledFeatureIds).not.toContain('school_class_groups');
    expect(context.enabledFeatureIds).not.toContain('school_lesson_recordings');
  });
});
