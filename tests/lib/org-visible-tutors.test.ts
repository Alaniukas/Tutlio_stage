import { describe, expect, it, vi } from 'vitest';
import { getOrgVisibleTutors } from '../../src/lib/orgVisibleTutors';

function clientFor(options: {
  adminUsers?: Array<{ user_id: string }>;
  teammateAdmins?: Array<{ user_id: string }>;
  rpcTutors?: Array<{ user_id: string }>;
  linkedStudents?: Array<{ tutor_id: string | null }>;
  inviteTutors?: Array<{ used_by_profile_id: string | null }>;
  profiles: Array<{ id: string; full_name: string }>;
}) {
  const rows: Record<string, unknown[]> = {
    organization_admins: options.adminUsers || [],
    students: options.linkedStudents || [],
    tutor_invites: options.inviteTutors || [],
    profiles: options.profiles,
  };
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: rows[table] || [], error: null }),
      })),
    })),
    rpc: vi.fn((name: string) => Promise.resolve({
      data: name === 'get_my_org_admin_user_ids'
        ? options.teammateAdmins || []
        : options.rpcTutors || [],
      error: null,
    })),
  };
}

describe('getOrgVisibleTutors', () => {
  it('uses the narrow tutor-id RPC for an organization admin', async () => {
    const client = clientFor({
      adminUsers: [{ user_id: 'admin-1' }],
      teammateAdmins: [{ user_id: 'admin-1' }, { user_id: 'admin-2' }],
      rpcTutors: [{ user_id: 'tutor-1' }],
      // Even if the direct invite read is denied/empty, the ID-only RPC is enough.
      inviteTutors: [],
      profiles: [
        { id: 'admin-1', full_name: 'Owner' },
        { id: 'admin-2', full_name: 'Accountant' },
        { id: 'tutor-1', full_name: 'Tutor' },
      ],
    });

    const result = await getOrgVisibleTutors(client as any, 'org-1', 'id, full_name');

    expect(result).toEqual([{ id: 'tutor-1', full_name: 'Tutor' }]);
  });

  it('keeps the legacy relationship fallback for non-admin callers', async () => {
    const client = clientFor({
      adminUsers: [],
      rpcTutors: [],
      linkedStudents: [{ tutor_id: 'tutor-1' }],
      inviteTutors: [{ used_by_profile_id: 'tutor-2' }],
      profiles: [
        { id: 'tutor-1', full_name: 'Tutor One' },
        { id: 'tutor-2', full_name: 'Tutor Two' },
      ],
    });

    const result = await getOrgVisibleTutors(client as any, 'org-1', 'id, full_name');

    expect(result.map((row) => row.id)).toEqual(['tutor-1', 'tutor-2']);
  });

  it('falls back to student/invite relationships when the tutor-id RPC returns empty', async () => {
    const client = clientFor({
      adminUsers: [{ user_id: 'admin-1' }],
      rpcTutors: [],
      linkedStudents: [{ tutor_id: 'tutor-1' }],
      inviteTutors: [{ used_by_profile_id: 'tutor-2' }],
      profiles: [
        { id: 'admin-1', full_name: 'Owner' },
        { id: 'tutor-1', full_name: 'Tutor One' },
        { id: 'tutor-2', full_name: 'Tutor Two' },
      ],
    });

    const result = await getOrgVisibleTutors(client as any, 'org-1', 'id, full_name');

    expect(result.map((row) => row.id)).toEqual(['tutor-1', 'tutor-2']);
  });
});
