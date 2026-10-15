import { describe, expect, it } from 'vitest';
import {
  buildInactiveAdminRows,
  buildWeeklyDigest,
  buildWeeklyDigestEmail,
} from '../../api/_lib/adminUsageWeeklyReport';
import type { TelemetryReport } from '../../src/lib/orgAdminTelemetryShared';

const now = Date.parse('2026-10-15T09:00:00.000Z');

function sampleReport(): TelemetryReport {
  return {
    started_at: '2026-10-01T00:00:00.000Z',
    last_cleanup_at: '2026-10-14T02:35:00.000Z',
    last_ingested_at: '2026-10-15T08:55:00.000Z',
    total: 2,
    organizations: [
      {
        id: 'org-1',
        name: 'Aktyvi mokykla',
        entity_type: 'school',
        status: 'active',
        created_at: '2026-08-01T00:00:00.000Z',
        features: {},
        is_demo: false,
        admins: [{
          user_id: 'admin-1',
          full_name: 'Ona Admin',
          email: 'ona@example.lt',
          role: 'owner',
          status: 'active',
          permissions: {},
          first_observed_at: '2026-09-01T00:00:00.000Z',
          last_active_at: '2026-10-14T10:00:00.000Z',
          last_action_at: '2026-10-14T10:00:00.000Z',
          last_action: 'student.create',
          last_module: 'students',
          last_login_at: '2026-10-14T09:00:00.000Z',
          first_actions: { 'student.create': '2026-09-02T00:00:00.000Z' },
          module_last_used: { students: '2026-10-14T10:00:00.000Z' },
          active_days_7: 4,
          active_days_30: 12,
          actions_7: 8,
          actions_30: 20,
        }],
        active_days_7: 4,
        active_days_30: 12,
        current_week_actions: 8,
        previous_week_actions: 6,
        modules_30: { students: 10, schedule: 4 },
        actions_30: { 'student.create.success': 3 },
        errors_7: 0,
        errors_today: 0,
        repeated_errors_today: 0,
      },
      {
        id: 'org-2',
        name: 'Užmigusi įmonė',
        entity_type: 'company',
        status: 'active',
        created_at: '2026-01-01T00:00:00.000Z',
        features: {},
        is_demo: false,
        admins: [{
          user_id: 'admin-2',
          full_name: 'Petras Petraitis',
          email: 'petras@example.lt',
          role: 'owner',
          status: 'active',
          permissions: {},
          first_observed_at: '2026-02-01T00:00:00.000Z',
          last_active_at: '2026-09-20T10:00:00.000Z',
          last_action_at: '2026-09-20T10:00:00.000Z',
          last_action: 'session.create',
          last_module: 'schedule',
          last_login_at: '2026-09-19T09:00:00.000Z',
          first_actions: {},
          module_last_used: {},
          active_days_7: 0,
          active_days_30: 1,
          actions_7: 0,
          actions_30: 0,
        }],
        active_days_7: 0,
        active_days_30: 1,
        current_week_actions: 0,
        previous_week_actions: 2,
        modules_30: { schedule: 1 },
        actions_30: {},
        errors_7: 2,
        errors_today: 0,
        repeated_errors_today: 0,
      },
    ],
    errors: [],
    daily: [],
    server_errors: [],
  };
}

describe('adminUsageWeeklyReport', () => {
  it('flags admins inactive for 7 and 14 days', () => {
    const rows = buildInactiveAdminRows(sampleReport().organizations, now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      email: 'petras@example.lt',
      tier: 'alert',
      inactiveDays: 24,
      lastModule: 'schedule',
    });
  });

  it('builds digest metrics and onboarding sections', () => {
    const report = sampleReport();
    report.started_at = '2026-09-01T00:00:00.000Z';
    report.organizations[1] = {
      ...report.organizations[1],
      entity_type: 'school',
      created_at: '2026-10-01T00:00:00.000Z',
      features: { school_class_groups: true },
      admins: [{
        ...report.organizations[1].admins[0],
        role: 'owner',
        permissions: { students: { edit: true }, tutors: { edit: true }, sessions: { edit: true }, finance: { edit: true }, contracts: { edit: true } },
        first_observed_at: '2026-10-05T00:00:00.000Z',
        first_actions: {},
      }],
    };
    const digest = buildWeeklyDigest(report, now);
    expect(digest.organizationCount).toBe(2);
    expect(digest.activeOrganizations7).toBe(1);
    expect(digest.inactiveAdmins).toHaveLength(1);
    expect(digest.onboardingOrganizations.length).toBeGreaterThanOrEqual(1);
    expect(digest.topModules[0]).toEqual({ module: 'students', hits: 10 });
    const email = buildWeeklyDigestEmail(digest);
    expect(email.subject).toContain('Tutlio savaitinė');
    expect(email.html).toContain('Petras Petraitis');
    expect(email.html).toContain('Onboarding checklist');
  });
});
