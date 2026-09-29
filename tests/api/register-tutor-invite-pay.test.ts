import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  invite: null as Record<string, unknown> | null,
  profileWriteFails: false,
  events: [] as string[],
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      admin: {
        createUser: async () => ({
          data: { user: { id: 'new-tutor' } },
          error: null,
        }),
      },
    },
    from: (table: string) => {
      const query: any = {
        select: () => query,
        eq: () => query,
        neq: () => query,
        maybeSingle: async () => ({ data: state.invite, error: null }),
        update: () => {
          if (table === 'tutor_invites') state.events.push('invite-used');
          return query;
        },
        upsert: async (row: Record<string, unknown>) => {
          if (table === 'profiles') {
            state.events.push('profile-saved');
            if (!state.profileWriteFails) state.profile = row;
          }
          return { error: state.profileWriteFails ? new Error('write failed') : null };
        },
      };
      return query;
    },
  }),
}));

import handler from '../../api/register-tutor-invite';

describe('register-tutor-invite pay', () => {
  beforeEach(() => {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    state.profile = null;
    state.profileWriteFails = false;
    state.events = [];
    state.invite = {
      id: 'invite-1',
      used: false,
      organization_id: 'org-1',
      invitee_email: 'tutor@example.com',
      company_commission_percent: 16.5,
    };
  });

  it('stores the invited tutor pay before marking the registration complete', async () => {
    const response: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

    await handler({
      method: 'POST',
      body: {
        email: 'tutor@example.com',
        password: 'example-password',
        fullName: 'Tutor',
        orgToken: 'INVITE12',
      },
    } as any, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(state.profile?.organization_id).toBe('org-1');
    expect(state.profile?.company_commission_percent).toBe(16.5);
    expect(state.events.indexOf('profile-saved')).toBeLessThan(state.events.indexOf('invite-used'));
  });

  it('leaves the invitation available when tutor pay cannot be saved', async () => {
    state.profileWriteFails = true;
    const response: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };

    await handler({
      method: 'POST',
      body: {
        email: 'tutor@example.com',
        password: 'example-password',
        fullName: 'Tutor',
        orgToken: 'INVITE12',
      },
    } as any, response);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(state.events).toEqual(['profile-saved']);
  });
});
