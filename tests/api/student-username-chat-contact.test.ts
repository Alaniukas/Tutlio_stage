import { describe, expect, it, vi } from 'vitest';
import { resolveRecipientEmail } from '../../api/chat-notify-on-message';

describe('chat notifications for username students', () => {
  it('uses the trusted parent contact instead of the internal auth identifier', async () => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({ data: null }),
    };
    const db = {
      from: () => chain,
      auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: {
        email: 'mv-0123456789abcdef@student-login.tutlio.invalid',
        app_metadata: {
          provisioned_by_organization: 'c1f36796-c281-4650-bed2-1bd6874764f1',
          student_login_name: 'mv-0123456789abcdef',
          student_contact_email: 'parent@example.test',
        },
        user_metadata: { full_name: 'Child' },
      } } }) } },
    };

    expect(await resolveRecipientEmail(db, 'child'))
      .toEqual({ email: 'parent@example.test', name: 'Child' });
  });
});
