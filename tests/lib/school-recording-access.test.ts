import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  admin: null as Record<string, unknown> | null,
  strictGuardian: vi.fn(),
}));

vi.mock('../../api/_lib/orgAdminAccess.js', () => ({
  getOrgAdminAccessByUserId: vi.fn(async () => state.admin),
}));
vi.mock('../../api/_lib/schoolFamilyGuardianAccess.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../api/_lib/schoolFamilyGuardianAccess')>(),
  loadSchoolFamilyGuardianAccess: state.strictGuardian,
}));

import { resolveHomeworkRecordingGroup, resolveRecordingViewerAccess } from '../../api/_lib/schoolRecordingAccess';

type Fixture = {
  profile?: { id: string; organization_id: string | null } | null;
  directStudents?: Array<{ id: string; organization_id: string | null; linked_user_id?: string | null; parent_user_id?: string | null }>;
  payerStudents?: Array<{ id: string; organization_id: string | null; payer_email?: string; parent_secondary_email?: string }>;
  parentProfile?: { id: string; email?: string | null } | null;
  parentLinks?: Array<{ parent_id: string; student_id: string }>;
  groups?: Array<{ id: string; organization_id: string; name: string; tutor_id: string | null }>;
  members?: Array<{ student_id: string; group_id: string; recording_access?: string; schedule_slots?: Array<{ weekday: number; start_time: string }> | null }>;
  guardianBindings?: Array<{ guardian_user_id: string; organization_id: string; student_id: string }>;
  contracts?: Array<Record<string, unknown>>;
  profiles?: Array<{ id: string; organization_id: string | null }>;
  subjects?: Array<{ id: string; name: string; tutor_id: string }>;
  recurring?: Array<{ subject_id: string; tutor_id: string; student_id: string; active: boolean }>;
  organizations?: Array<{ id: string; entity_type: string; features: Record<string, unknown> }>;
  authEmail?: string;
  denials?: Array<{ organization_id: string; email: string; user_id?: string | null }>;
  denialError?: { code: string; message: string };
};

function supabaseFixture(fixture: Fixture) {
  return {
    auth: { admin: { getUserById: async () => ({ data: { user: { email: fixture.authEmail } } }) } },
    from(table: string) {
      const eqs = new Map<string, unknown>();
      const ins = new Map<string, unknown[]>();
      const likes = new Map<string, string>();
      let hasOr = false;
      let orExpr = '';
      let selection = '';
      const result = () => {
        if (table === 'profiles') {
          let rows = [...(fixture.profiles || [])];
          if (fixture.profile && !rows.some((row) => row.id === fixture.profile!.id)) rows.push(fixture.profile);
          if (eqs.has('id')) rows = rows.filter((row) => row.id === eqs.get('id'));
          if (eqs.has('organization_id')) rows = rows.filter((row) => row.organization_id === eqs.get('organization_id'));
          if (ins.has('id')) rows = rows.filter((row) => ins.get('id')!.includes(row.id));
          return { data: rows, error: null };
        }
        if (table === 'organization_admins') return { data: null, error: null };
        if (table === 'school_family_guardians') return { data: (fixture.guardianBindings || [])
          .filter((row) => row.guardian_user_id === eqs.get('guardian_user_id')), error: null };
        if (table === 'school_contracts') return { data: fixture.contracts || [], error: null };
        if (table === 'parent_profiles') return { data: fixture.parentProfile ?? null, error: null };
        if (table === 'parent_students') {
          const rows = (fixture.parentLinks || [])
            .filter((row) => !eqs.has('parent_id') || row.parent_id === eqs.get('parent_id'));
          return { data: rows, error: null };
        }
        if (table === 'students') {
          if (likes.size) {
            // Emulate SQL ILIKE: underscores and percentages are wildcards
            // unless the query escapes them, including a literal backslash.
            const matching = (pattern: string, value: string) => {
              let regex = '^';
              for (let index = 0; index < pattern.length; index += 1) {
                let char = pattern[index];
                if (char === '\\' && index + 1 < pattern.length) char = pattern[++index];
                else if (char === '%') { regex += '.*'; continue; }
                else if (char === '_') { regex += '.'; continue; }
                regex += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              }
              return new RegExp(`${regex}$`, 'i').test(value);
            };
            return { data: (fixture.payerStudents || []).filter((row) => [...likes].every(([column, pattern]) => {
              const value = row[column as 'payer_email' | 'parent_secondary_email'];
              return value === undefined || matching(pattern, value);
            })), error: null };
          }
          if (orExpr.includes('payer_email')) return { data: fixture.payerStudents || [], error: null };
          let rows = hasOr ? fixture.directStudents || [] : [...new Map([
            ...(fixture.directStudents || []), ...(fixture.payerStudents || []),
          ].map((row) => [row.id, row])).values()];
          if (!hasOr && ins.has('id')) rows = rows.filter((row) => ins.get('id')!.includes(row.id));
          return { data: rows, error: null };
        }
        if (table === 'school_recording_access_denials') {
          return { data: (fixture.denials || []).filter((row) =>
            (!ins.has('organization_id') || ins.get('organization_id')!.includes(row.organization_id))
            && (!eqs.has('user_id') || row.user_id === eqs.get('user_id'))
            && (!ins.has('email') || ins.get('email')!.includes(row.email))).slice(0, 1000),
            error: fixture.denialError || null };
        }
        if (table === 'school_class_groups') {
          let rows = fixture.groups || [];
          if (eqs.has('organization_id')) rows = rows.filter((row) => row.organization_id === eqs.get('organization_id'));
          if (eqs.has('tutor_id')) rows = rows.filter((row) => row.tutor_id === eqs.get('tutor_id'));
          if (eqs.has('id')) rows = rows.filter((row) => row.id === eqs.get('id'));
          return { data: rows, error: null };
        }
        if (table === 'school_class_group_members') {
          const studentIds = ins.get('student_id') || [];
          const groups = new Map((fixture.groups || []).map((group) => [group.id, group]));
          return {
            data: (fixture.members || [])
              .filter((member) => studentIds.includes(member.student_id))
              .filter((member) => !eqs.has('group_id') || eqs.get('group_id') === member.group_id)
              .map((member) => selection.includes('group:') ? ({ group: groups.get(member.group_id) || null }) : member),
            error: null,
          };
        }
        if (table === 'recurring_individual_sessions') {
          let rows = fixture.recurring || [];
          if (ins.has('tutor_id')) rows = rows.filter((row) => ins.get('tutor_id')!.includes(row.tutor_id));
          if (ins.has('student_id')) rows = rows.filter((row) => ins.get('student_id')!.includes(row.student_id));
          if (eqs.has('student_id')) rows = rows.filter((row) => row.student_id === eqs.get('student_id'));
          if (eqs.has('subject_id')) rows = rows.filter((row) => row.subject_id === eqs.get('subject_id'));
          if (eqs.has('active')) rows = rows.filter((row) => row.active === eqs.get('active'));
          return { data: rows, error: null };
        }
        if (table === 'subjects') {
          let rows = fixture.subjects || [];
          if (ins.has('id')) rows = rows.filter((row) => ins.get('id')!.includes(row.id));
          if (eqs.has('id')) rows = rows.filter((row) => row.id === eqs.get('id'));
          return { data: rows, error: null };
        }
        if (table === 'organizations') {
          return { data: (fixture.organizations || []).filter((org) =>
            (!ins.has('id') || ins.get('id')!.includes(org.id)) && (!eqs.has('id') || eqs.get('id') === org.id)), error: null };
        }
        return { data: [], error: null };
      };
      const query: any = {
        select: (value: string) => { selection = value; return query; },
        eq: (column: string, value: unknown) => { eqs.set(column, value); return query; },
        in: (column: string, values: unknown[]) => { ins.set(column, values); return query; },
        ilike: (column: string, pattern: string) => { likes.set(column, pattern); return query; },
        or: (expr?: string) => { hasOr = true; orExpr = String(expr || ''); return query; },
        limit: () => query,
        range: () => query,
        order: () => query,
        maybeSingle: async () => {
          const value = result();
          if (!['profiles', 'subjects', 'organizations', 'school_class_groups'].includes(table)) return value;
          const rows = value.data as unknown[];
          return { ...value, data: rows[0] || null };
        },
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
  beforeEach(() => {
    state.admin = null;
    state.strictGuardian.mockReset().mockResolvedValue({ studentIds: [], distinctParent: true });
  });

  it('removes stale parent-link and payer-email grants when the strict family portal is enabled', async () => {
    const access = await resolveRecordingViewerAccess(supabaseFixture({
      authEmail: 'parent@school.lt', parentProfile: { id: 'parent-1' },
      parentLinks: [{ parent_id: 'parent-1', student_id: 'student-a' }],
      payerStudents: [{ id: 'student-a', organization_id: 'org-1' }],
      groups, members: [{ student_id: 'student-a', group_id: 'group-a' }],
      organizations: [{ ...org(), features: { school_lesson_recordings: true, school_family_portal: true } }],
    }), 'parent-user');
    expect(access.studentIds).toEqual([]);
    expect(access.groups).toEqual([]);
    expect(state.strictGuardian).toHaveBeenCalledWith(expect.anything(), 'parent-user', 'org-1');
  });

  it('discovers a verified annual guardian without requiring old email or parent links', async () => {
    state.strictGuardian.mockResolvedValue({ studentIds: ['student-a'], distinctParent: true });
    const access = await resolveRecordingViewerAccess(supabaseFixture({
      payerStudents: [{ id: 'student-a', organization_id: 'org-1' }],
      guardianBindings: [{ guardian_user_id: 'parent-user', student_id: 'student-a', organization_id: 'org-1' }],
      groups, members: [{ student_id: 'student-a', group_id: 'group-a', recording_access: 'group' }],
      organizations: [{ ...org(), features: { school_lesson_recordings: true, school_family_portal: true } }],
    }), 'parent-user');
    expect(access.studentIds).toEqual(['student-a']);
    expect(access.groups.map((group) => group.id)).toEqual(['group-a']);
  });

  it('limits a shared student identity to its own child and hides a no-recording membership', async () => {
    state.strictGuardian.mockResolvedValue({ studentIds: [], distinctParent: false });
    const fixture: Fixture = {
      directStudents: [
        { id: 'student-a', organization_id: 'org-1', linked_user_id: 'shared-user' },
        { id: 'student-b', organization_id: 'org-1', parent_user_id: 'shared-user' },
      ],
      groups, members: [
        { student_id: 'student-a', group_id: 'group-a', recording_access: 'none' },
        { student_id: 'student-b', group_id: 'group-b', recording_access: 'group' },
      ],
      organizations: [{ ...org(), features: { school_lesson_recordings: true, school_family_portal: true } }],
    };
    const denied = await resolveRecordingViewerAccess(supabaseFixture(fixture), 'shared-user');
    expect(denied.studentIds).toEqual(['student-a']);
    expect(denied.groups).toEqual([]);
    fixture.members![0].recording_access = 'group';
    const own = await resolveRecordingViewerAccess(supabaseFixture(fixture), 'shared-user');
    expect(own.groups.map((group) => group.id)).toEqual(['group-a']);
  });

  it('does not let a sessions-only admin view recordings', async () => {
    state.admin = { organizationId: 'org-1', role: 'custom', permissions: { 'sessions.view': true } };
    const denied = await resolveRecordingViewerAccess(supabaseFixture({ groups, organizations: [org()] }), 'qa-admin');
    expect(denied.groups).toEqual([]);

    state.admin = { organizationId: 'org-1', role: 'admin', permissions: {} };
    const allowed = await resolveRecordingViewerAccess(supabaseFixture({ groups, organizations: [org()] }), 'school-admin');
    expect(allowed.groups.map((group) => group.id)).toEqual(['group-a', 'group-b']);
  });

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

  it('lets a parent whose payer email matches the student row watch that child\'s groups', async () => {
    const access = await resolveRecordingViewerAccess(supabaseFixture({
      parentProfile: { id: 'parent-1', email: 'parent@school.lt' },
      payerStudents: [{ id: 'student-a', organization_id: 'org-1' }],
      groups,
      members: [{ student_id: 'student-a', group_id: 'group-a' }],
      organizations: [org()],
    }), 'parent-user');

    expect(access.groups.map((group) => group.id)).toEqual(['group-a']);
    expect(access.isStudentOrParent).toBe(true);
  });

  it('matches literal email characters instead of granting another family through SQL wildcards', async () => {
    const access = await resolveRecordingViewerAccess(supabaseFixture({
      authEmail: 'parent_10%+tag@school.lt',
      payerStudents: [
        { id: 'student-a', organization_id: 'org-1', payer_email: 'PARENT_10%+tag@school.lt', parent_secondary_email: '' },
        { id: 'student-b', organization_id: 'org-1', payer_email: 'parentX100+tag@school.lt', parent_secondary_email: '' },
      ],
      groups,
      members: [{ student_id: 'student-a', group_id: 'group-a' }, { student_id: 'student-b', group_id: 'group-b' }],
      organizations: [org()],
    }), 'parent-user');
    expect(access.studentIds).toEqual(['student-a']);
    expect(access.groups.map((group) => group.id)).toEqual(['group-a']);
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

  it('denies every direct, parent-link and payer-email grant in that school and restores them without changing links', async () => {
    const fixture: Fixture = {
      authEmail: 'Parent@school.lt',
      parentProfile: { id: 'parent-1', email: 'parent@school.lt' },
      parentLinks: [{ parent_id: 'parent-1', student_id: 'student-link' }],
      directStudents: [
        { id: 'student-direct', organization_id: 'org-1' },
        { id: 'student-link', organization_id: 'org-1' },
      ],
      payerStudents: [{ id: 'student-payer', organization_id: 'org-1' }],
      members: ['student-direct', 'student-link', 'student-payer'].map((student_id) => ({ student_id, group_id: 'group-a' })),
      groups,
      organizations: [org()],
      denials: [{ organization_id: 'org-1', email: 'parent@school.lt' }],
    };
    const client = supabaseFixture(fixture);
    const denied = await resolveRecordingViewerAccess(client, 'parent-user');
    expect(denied.groups).toEqual([]);
    expect(denied.studentIds).toEqual([]);
    expect(fixture.parentLinks).toHaveLength(1);
    expect(fixture.directStudents).toHaveLength(2);
    fixture.denials = [];
    const restored = await resolveRecordingViewerAccess(client, 'parent-user');
    expect(restored.studentIds).toEqual(['student-direct', 'student-link', 'student-payer']);
    expect(restored.groups.map((group) => group.id)).toEqual(['group-a']);
  });

  it('keeps another school accessible and denies by stable Auth ID after the email changes', async () => {
    const access = await resolveRecordingViewerAccess(supabaseFixture({
      authEmail: 'changed@school.lt',
      directStudents: [{ id: 'student-a', organization_id: 'org-1' }, { id: 'student-other', organization_id: 'org-2' }],
      groups: [...groups, { id: 'group-other', organization_id: 'org-2', name: 'Other', tutor_id: 'teacher-other' }],
      members: [{ student_id: 'student-a', group_id: 'group-a' }, { student_id: 'student-other', group_id: 'group-other' }],
      organizations: [org(), { ...org(), id: 'org-2' }],
      denials: [{ organization_id: 'org-1', email: 'old@school.lt', user_id: 'parent-user' }],
    }), 'parent-user');
    expect(access.studentIds).toEqual(['student-other']);
    expect(access.groups.map((group) => group.id)).toEqual(['group-other']);
  });

  it('finds a viewer denial beyond a school’s first 1000 revoked viewers', async () => {
    const access = await resolveRecordingViewerAccess(supabaseFixture({
      authEmail: 'parent@school.lt',
      directStudents: [{ id: 'student-a', organization_id: 'org-1' }],
      groups, members: [{ student_id: 'student-a', group_id: 'group-a' }], organizations: [org()],
      denials: [
        ...Array.from({ length: 1200 }, (_, index) => ({ organization_id: 'org-1', email: `other-${index}@school.lt` })),
        { organization_id: 'org-1', email: 'parent@school.lt' },
      ],
    }), 'parent-user');
    expect(access.groups).toEqual([]);
    expect(access.studentIds).toEqual([]);
  });

  it('denies individual recordings through the child relationship', async () => {
    const access = await resolveRecordingViewerAccess(supabaseFixture({
      authEmail: 'student@school.lt',
      directStudents: [{ id: 'student-a', organization_id: 'org-1' }],
      profiles: [{ id: 'teacher-a', organization_id: 'org-1' }],
      subjects: [{ id: 'subject-a', name: 'Solo', tutor_id: 'teacher-a' }],
      recurring: [{ subject_id: 'subject-a', tutor_id: 'teacher-a', student_id: 'student-a', active: true }],
      organizations: [org()],
      denials: [{ organization_id: 'org-1', email: 'student@school.lt' }],
    }), 'student-user');
    expect(access.groups).toEqual([]);
  });

  it('preserves independent teacher and organization admin permissions', async () => {
    const fixture: Fixture = {
      authEmail: 'staff@school.lt',
      profile: { id: 'teacher-a', organization_id: 'org-1' },
      directStudents: [{ id: 'student-a', organization_id: 'org-1' }],
      groups, members: [{ student_id: 'student-a', group_id: 'group-b' }], organizations: [org()],
      denials: [{ organization_id: 'org-1', email: 'staff@school.lt', user_id: 'teacher-a' }],
    };
    const teacher = await resolveRecordingViewerAccess(supabaseFixture(fixture), 'teacher-a');
    expect(teacher.studentIds).toEqual([]);
    expect(teacher.groups.map((group) => group.id)).toEqual(['group-a']);
    state.admin = { organizationId: 'org-1', role: 'owner', permissions: {} };
    const admin = await resolveRecordingViewerAccess(supabaseFixture(fixture), 'teacher-a');
    expect(admin.canManage).toBe(true);
    expect(admin.groups.map((group) => group.id)).toEqual(['group-a', 'group-b']);
  });

  it('fails closed when denials cannot be read', async () => {
    await expect(resolveRecordingViewerAccess(supabaseFixture({
      directStudents: [{ id: 'student-a', organization_id: 'org-1' }],
      denialError: { code: '42P01', message: 'missing denial table' },
    }), 'parent-user')).rejects.toMatchObject({ code: '42P01' });
  });

  it('shows an individual recurring subject only to its teacher and enrolled student', async () => {
    const fixture: Fixture = {
      directStudents: [{ id: 'student-a', organization_id: 'org-1' }],
      profiles: [{ id: 'teacher-a', organization_id: 'org-1' }],
      subjects: [{ id: 'subject-a', name: 'Solo muzika', tutor_id: 'teacher-a' }],
      recurring: [{ subject_id: 'subject-a', tutor_id: 'teacher-a', student_id: 'student-a', active: true }],
      organizations: [org()],
    };
    const studentAccess = await resolveRecordingViewerAccess(
      supabaseFixture(fixture),
      'student-user',
    );
    expect(studentAccess.groups).toEqual([expect.objectContaining({
      id: 'subject:subject-a',
      sourceId: 'subject-a',
      kind: 'individual',
      name: 'Solo muzika',
    })]);

    fixture.profile = { id: 'teacher-a', organization_id: 'org-1' };
    fixture.directStudents = [];
    const teacherAccess = await resolveRecordingViewerAccess(
      supabaseFixture(fixture),
      'teacher-a',
    );
    expect(teacherAccess.groups.map((group) => group.id)).toEqual(['subject:subject-a']);
  });

  it('lets an email homework link authorize only a live group member when recordings are on', async () => {
    const student = { id: 'student-a', organization_id: 'org-1', detached_at: null };
    const org = { id: 'org-1', entity_type: 'school', features: { school_lesson_recordings: true } };
    const group = { id: 'group-a', organization_id: 'org-1' };
    const client = {
      from(table: string) {
        const query: any = {
          select: () => query,
          eq: () => query,
          maybeSingle: async () => {
            if (table === 'students') return { data: student, error: null };
            if (table === 'organizations') return { data: org, error: null };
            if (table === 'school_class_group_members') return { data: { group_id: 'group-a' }, error: null };
            if (table === 'school_class_groups') return { data: group, error: null };
            return { data: null, error: null };
          },
        };
        return query;
      },
    } as any;

    await expect(resolveHomeworkRecordingGroup(client, 'student-a', 'group-a'))
      .resolves.toEqual(expect.objectContaining({
        id: 'group-a',
        sourceId: 'group-a',
        kind: 'class_group',
        organizationId: 'org-1',
      }));

    org.features = {};
    await expect(resolveHomeworkRecordingGroup(client, 'student-a', 'group-a')).resolves.toBeNull();
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
