import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchStudentPortalPolicyMap } from '@/lib/studentBookingPolicy';

const mocks = vi.hoisted(() => ({ features: {} as Record<string, unknown> }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        in: async () => ({
          data: table === 'students'
            ? [{ id: 'student-1', organization_id: 'org-1', tutor_id: 'tutor-1' }]
            : [{ id: 'org-1', entity_type: 'company', features: mocks.features }],
        }),
      }),
    }),
  },
}));

describe('student lesson action policy', () => {
  beforeEach(() => { mocks.features = {}; });

  it('restricts rescheduling without also restricting cancellation', async () => {
    mocks.features = { disable_student_reschedule: true };
    const policy = (await fetchStudentPortalPolicyMap(['student-1']))['student-1'];
    expect(policy.rescheduleDisabled).toBe(true);
    expect(policy.actionsDisabled).toBe(false);
    expect(policy.cancellationDisabled).toBe(false);
  });

  it('allows rescheduling when only cancellation is restricted', async () => {
    mocks.features = { disable_student_cancel: true, disable_student_reschedule: false };
    expect((await fetchStudentPortalPolicyMap(['student-1']))['student-1']).toMatchObject({
      rescheduleDisabled: false,
      cancellationDisabled: true,
      actionsDisabled: false,
    });
  });

  it('keeps the existing combined restriction and ordinary org behavior', async () => {
    mocks.features = { disable_student_reschedule_cancel: true };
    expect((await fetchStudentPortalPolicyMap(['student-1']))['student-1']).toMatchObject({
      rescheduleDisabled: true,
      actionsDisabled: true,
      cancellationDisabled: true,
    });
    mocks.features = {};
    expect((await fetchStudentPortalPolicyMap(['student-1']))['student-1']).toMatchObject({
      rescheduleDisabled: false,
      actionsDisabled: false,
      cancellationDisabled: false,
    });
  });
});
