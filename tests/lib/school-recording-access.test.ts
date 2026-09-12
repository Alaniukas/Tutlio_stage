import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  admin: null as Record<string, unknown> | null,
}));

vi.mock('../../api/_lib/orgAdminAccess.js', () => ({
  getOrgAdminAccessByUserId: vi.fn(async () => state.admin),
}));

import { resolveRecordingViewerAccess } from '../../api/_lib/schoolRecordingAccess';

type Fixture = {
  profile?: { id: string; organization_id: string | null } | null;
  directStudents?: Array<{ id: string; organization_id: string | null }>;
  parentProfile?: { id: string } | null;
  parentLinks?: Array<{ parent_id: string; student_id: string }>;
  groups?: Array<{ id: string; organization_id: string; name: string; tutor_id: string | null }>;
  members?: Array<{ student_id: string; group_id: string }>;
  organizations?: Array<{ id: string; entity_type: string; features: Record<string, unknown> }>;
};

function supabaseFixture(fixture: Fixture) {
  return {
    from(table: string) {
      const eqs = new Map<string, unknown>();
      const ins = new Map<string, unknown[]>();
      let hasOr = false;
      const result = () => {
        if (table === 'profiles') return { data: fixture.profile ?? null, error: null };
        if (table === 'organization_admins') return { data: null, error: null };
        if (table === 'parent_profiles') return { data: fixture.parentProfile ?? null, error: null };
        if (table === 'parent_students') {
          const rows = (fixture.parentLinks || [])
            .filter((row) => !eqs.has('parent_id') || row.parent_id === eqs.get('parent_id'));
          return { data: rows, error: null };
        }
        if (table === 'students') {
          let rows = fixture.directStudents || [];
          if (!hasOr && ins.has('id')) rows = rows.filter((row) => ins.get('id')!.includes(row.id));
          return { data: rows, error: null };
        }
        if (table === 'school_class_groups') {
          let rows = fixture.groups || [];
          if (eqs.has('organization_id')) rows = rows.filter((row) => row.organization_id === eqs.get('organization_id'));
          if (eqs.has('tutor_id')) rows = rows.filter((row) => row.tutor_id === eqs.get('tutor_id'));
          return { data: rows, error: null };
        }
        if (table === 'school_class_group_members') {
          const studentIds = ins.get('student_id') || [];
          const groups = new Map((fixture.groups || []).map((group) => [group.id, group]));
          return {
            data: (fixture.members || [])
              .filter((member) => studentIds.includes(member.student_id))
              .map((member) => ({ group: groups.get(member.group_id) || null })),
            error: null,
          };
        }
        if (table === 'organizations') {
          const ids = ins.get('id') || [];
          return { data: (fixture.organizations || []).filter((org) => ids.includes(org.id)), error: null };
        }
        return { data: [], error: null };
      };
      const query: any = {
        select: () => query,
        eq: (column: string, value: unknown) => { eqs.set(column, value); return query; },
        in: (column: string, values: unknown[]) => { ins.set(column, values); return query; },
        or: () => { hasOr = true; return query; },
        maybeSingle: async () => result(),
        then: (resolve: (value: unknown) => unknown) => resolve(result()),
      };
      return query;
    },
  } as any;
}

const org = (enabled = true) => ({
  id: 'org-1',
  entity_type: 'school',
  features: { school_lesson_recordings: enabled },
});
const groups = [
  { id: 'group-a', organization_id: 'org-1', name: 'A grupė', tutor_id: 'teacher-a' },
  { id: 'group-b', organization_id: 'org-1', name: 'B grupė', tutor_id: 'teacher-b' },
];

describe('school recording relationship authorization', () => {
  beforeEach(() => { state.admin = null; });

  it('gives a student only the group where that student is a member', async () => {
    const access = await resolveRecordingViewerAccess(supabaseFixture({
      directStudents: [{ id: 'student-a', organization_id: 'org-1' }],
      groups,
      members: [{ student_id: 'student-a', group_id: 'group-a' }],
      organizations: [org()],
    }), 'student-user');

    expect(access.groups.map((group) => group.id)).toEqual(['group-a']);
    expect(access.canManage).toBe(false);
  });

  it('filters a parent to the explicitly selected linked child', async () => {
    const access = await resolveRecordingViewerAccess(supabaseFixture({
      parentProfile: { id: 'parent-1' },
      parentLinks: [
        { parent_id: 'parent-1', student_id: 'student-a' },
        { parent_id: 'parent-1', student_id: 'student-b' },
      ],
      directStudents: [
        { id: 'student-a', organization_id: 'org-1' },
        { id: 'student-b', organization_id: 'org-1' },
      ],
      groups,
      members: [
        { student_id: 'student-a', group_id: 'group-a' },
        { student_id: 'student-b', group_id: 'group-b' },
      ],
      organizations: [org()],
    }), 'parent-user', 'student-b');

    expect(access.groups.map((group) => group.id)).toEqual(['group-b']);
  });

  it('gives a teacher only assigned groups and denies all groups when the feature is off', async () => {
    const fixture: Fixture = {
      profile: { id: 'teacher-a', organization_id: 'org-1' },
      groups,
      organizations: [org()],
    };
    const access = await resolveRecordingViewerAccess(supabaseFixture(fixture), 'teacher-a');
    expect(access.groups.map((group) => group.id)).toEqual(['group-a']);

    fixture.organizations = [org(false)];
    const disabled = await resolveRecordingViewerAccess(supabaseFixture(fixture), 'teacher-a');
    expect(disabled.groups).toEqual([]);
  });

  it('lets an active owner manage every group in their own organization', async () => {
    state.admin = {
      id: 'admin-seat',
      userId: 'admin-user',
      organizationId: 'org-1',
      role: 'owner',
      status: 'active',
      permissions: {},
      acceptedAt: null,
    };
    const access = await resolveRecordingViewerAccess(supabaseFixture({
      groups,
      organizations: [org()],
    }), 'admin-user');

    expect(access.groups.map((group) => group.id)).toEqual(['group-a', 'group-b']);
    expect(access.canManage).toBe(true);
  });
});
