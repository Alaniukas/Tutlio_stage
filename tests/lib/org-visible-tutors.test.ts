import { describe, expect, it, vi } from 'vitest';
import { getOrgVisibleTutors } from '../../src/lib/orgVisibleTutors';

function clientFor(options: {
  adminUsers?: Array<{ user_id: string }>;
  teammateAdmins?: Array<{ user_id: string }>;
  rpcTutors?: Array<{ user_id: string }>;
  linkedStudents?: Array<{ tutor_id: string | null }>;
  inviteTutors?: Array<{ used_by_profile_id: string | null; used?: boolean; invitee_email?: string | null }>;
  classGroups?: Array<{ tutor_id: string | null }>;
  errors?: Record<string, { message: string }>;
  rpcError?: { message: string };
  rpcStatus?: number;
  profiles: Array<{ id: string; full_name: string; email?: string | null }>;
}) {
  const rows: Record<string, unknown[]> = {
    organization_admins: options.adminUsers || [],
    students: options.linkedStudents || [],
    tutor_invites: options.inviteTutors || [],
    school_class_groups: options.classGroups || [],
    profiles: options.profiles,
  };
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: rows[table] || [], error: options.errors?.[table] || null }),
      })),
    })),
    rpc: vi.fn((name: string) => Promise.resolve({
      data: name === 'get_my_org_admin_user_ids'
        ? options.teammateAdmins || []
        : options.rpcTutors || [],
      error: options.rpcError || null,
      status: options.rpcStatus,
    })),
  };
}

describe('getOrgVisibleTutors', () => {
  it('rejects a failed profile read instead of returning a successful empty roster in strict mode', async () => {
    const client = clientFor({ profiles: [], errors: { profiles: { message: 'HTTP 522' } } });
    await expect(getOrgVisibleTutors(client as any, 'org-1', 'id', { strict: true })).rejects.toThrow('HTTP 522');
  });

  it('keeps the relationship fallback for unavailable legacy RPCs in strict mode', async () => {
    const client = clientFor({
      rpcError: { message: 'function not found' }, rpcStatus: 404,
      linkedStudents: [{ tutor_id: 'tutor-1' }],
      profiles: [{ id: 'tutor-1', full_name: 'Tutor' }],
    });
    await expect(getOrgVisibleTutors(client as any, 'org-1', 'id', { strict: true }))
      .resolves.toEqual([{ id: 'tutor-1', full_name: 'Tutor' }]);
  });

  it('does not hide transport failures behind an optional RPC fallback', async () => {
    const client = clientFor({ profiles: [], rpcError: { message: 'HTTP 522' }, rpcStatus: 522 });
    await expect(getOrgVisibleTutors(client as any, 'org-1', 'id', { strict: true })).rejects.toThrow('HTTP 522');
  });

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

  it('includes class group tutors even when no student is assigned to them directly', async () => {
    const client = clientFor({
      adminUsers: [{ user_id: 'admin-1' }],
      rpcTutors: [],
      linkedStudents: [],
      inviteTutors: [],
      classGroups: [{ tutor_id: 'tutor-group' }],
      profiles: [
        { id: 'admin-1', full_name: 'Owner' },
        { id: 'tutor-group', full_name: 'Group Tutor' },
      ],
    });

    const result = await getOrgVisibleTutors(client as any, 'org-1', 'id, full_name');

    expect(result).toEqual([{ id: 'tutor-group', full_name: 'Group Tutor' }]);
  });

  it('keeps a joined tutor visible when the used invite has no used_by_profile_id', async () => {
    const client = clientFor({
      adminUsers: [{ user_id: 'admin-1' }],
      rpcTutors: [{ user_id: 'tutor-1' }],
      inviteTutors: [{
        used_by_profile_id: null,
        used: true,
        invitee_email: 'hidden@org.lt',
      }],
      profiles: [
        { id: 'admin-1', full_name: 'Owner' },
        { id: 'tutor-1', full_name: 'Tutor One', email: 'one@org.lt' },
        { id: 'tutor-2', full_name: 'Tutor Two', email: 'hidden@org.lt' },
      ],
    });

    const result = await getOrgVisibleTutors(client as any, 'org-1', 'id, full_name, email');

    expect(result.map((row) => row.id).sort()).toEqual(['tutor-1', 'tutor-2']);
  });
});
