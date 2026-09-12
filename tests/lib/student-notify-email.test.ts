import { expect, it, vi } from 'vitest';
import { MOKSLO_VAISIAI_ORG_ID } from '@/lib/marketMoney';

const mocks = vi.hoisted(() => ({ maybeSingle: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => {
      const query: any = {
        select: () => query,
        eq: () => query,
        maybeSingle: mocks.maybeSingle,
      };
      return query;
    },
  },
}));

import { resolveStudentNotificationEmail } from '@/lib/studentNotifyEmail';

it('does not send lesson mail to a username account internal alias', async () => {
  mocks.maybeSingle.mockResolvedValue({
    data: { email: 'mv-0123456789abcdef@student-login.tutlio.invalid' },
  });

  await expect(resolveStudentNotificationEmail({
    email: null,
    linked_user_id: 'auth-student',
    payer_email: 'parent@example.test',
    organization_id: MOKSLO_VAISIAI_ORG_ID,
  })).resolves.toBe('parent@example.test');
});
