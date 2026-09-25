import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  invite: null as Record<string, unknown> | null,
  profile: null as Record<string, unknown> | null,
  profilePatch: null as Record<string, unknown> | null,
  insertedProfile: null as Record<string, unknown> | null,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: 'tutor-1', email: 'tutor@example.com', user_metadata: {} } },
        error: null,
      }),
    },
    from: (table: string) => {
      const query: any = {
        select: () => query,
        eq: () => query,
        neq: () => query,
        maybeSingle: async () => ({
          data: table === 'tutor_invites'
            ? state.invite
            : table === 'profiles'
              ? state.profile
              : { preferred_locale: 'lt' },
          error: null,
        }),
        update: (patch: Record<string, unknown>) => {
          if (table === 'profiles') {
            state.profilePatch = patch;
            if (state.profile) Object.assign(state.profile, patch);
          }
          return query;
        },
        insert: async (row: Record<string, unknown>) => {
          if (table === 'profiles') state.insertedProfile = row;
          return { error: null };
        },
      };
      return query;
    },
  }),
}));

import handler from '../../api/claim-tutor-invite';

async function claimInvite() {
  const response: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer session-token' },
    body: { token: 'invite-token' },
  } as any, response);
  expect(response.status).toHaveBeenCalledWith(200);
  return response;
}

describe('claiming a tutor invite with a personal meeting link', () => {
  beforeEach(() => {
    process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    state.invite = {
      id: 'invite-1',
      organization_id: 'org-1',
      used: false,
      used_by_profile_id: null,
      invitee_email: 'tutor@example.com',
      subjects_preset: [],
      personal_meeting_link: null,
    };
    state.profile = {
      id: 'tutor-1',
      organization_id: 'org-1',
      preferred_locale: 'lt',
      personal_meeting_link: 'https://meet.google.com/existing-room',
    };
    state.profilePatch = null;
    state.insertedProfile = null;
  });

  it('keeps an existing personal link when the invite link is blank', async () => {
    state.invite!.personal_meeting_link = '   ';

    await claimInvite();

    expect(state.profilePatch).not.toHaveProperty('personal_meeting_link');
    expect(state.profile?.personal_meeting_link).toBe('https://meet.google.com/existing-room');
  });

  it('does not update the profile when login replays an already claimed invite', async () => {
    state.invite!.used = true;
    state.invite!.used_by_profile_id = 'tutor-1';
    state.invite!.personal_meeting_link = null;

    const response = await claimInvite();

    expect(response.json).toHaveBeenCalledWith({ success: true, organizationId: 'org-1' });
    expect(state.profilePatch).toBeNull();
    expect(state.insertedProfile).toBeNull();
    expect(state.profile?.personal_meeting_link).toBe('https://meet.google.com/existing-room');
  });

  it('repairs a missing organization on a profile even when the invite is already claimed', async () => {
    state.invite!.used = true;
    state.invite!.used_by_profile_id = 'tutor-1';
    state.profile!.organization_id = null;

    await claimInvite();

    expect(state.profilePatch?.organization_id).toBe('org-1');
    expect(state.profilePatch).not.toHaveProperty('personal_meeting_link');
  });

  it('sets a provided invite link on an existing profile', async () => {
    state.invite!.personal_meeting_link = '  https://meet.google.com/invite-room  ';

    await claimInvite();

    expect(state.profilePatch?.personal_meeting_link).toBe('https://meet.google.com/invite-room');
    expect(state.profile?.personal_meeting_link).toBe('https://meet.google.com/invite-room');
  });

  it('stores null for a new profile when the invite has no link', async () => {
    state.profile = null;

    await claimInvite();

    expect(state.insertedProfile?.personal_meeting_link).toBeNull();
  });
});
