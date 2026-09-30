// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const org = '10000000-0000-4000-8000-000000000001';
const otherOrg = '10000000-0000-4000-8000-000000000002';
const owner = '20000000-0000-4000-8000-000000000001';
const tutor = '20000000-0000-4000-8000-000000000002';
const child = '20000000-0000-4000-8000-000000000003';
const parent = '20000000-0000-4000-8000-000000000004';
const reader = '20000000-0000-4000-8000-000000000005';
const otherOwner = '20000000-0000-4000-8000-000000000006';
const editor = '20000000-0000-4000-8000-000000000007';
const suspended = '20000000-0000-4000-8000-000000000008';
const revoked = '20000000-0000-4000-8000-000000000009';
const student = '30000000-0000-4000-8000-000000000001';
const pairing = '30000000-0000-4000-8000-000000000002';
const legacy = '30000000-0000-4000-8000-000000000003';
const outside = '30000000-0000-4000-8000-000000000004';
const movedTutorStudent = '30000000-0000-4000-8000-000000000005';
const missing = '30000000-0000-4000-8000-000000000099';

describe('student administration notes storage and privacy', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create schema private;
      grant usage on schema public, auth, private to authenticated;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$;
      create function public.write_blocked_by_org_suspension() returns boolean language sql stable as $$
        select coalesce(current_setting('test.org_suspended', true) = 'true', false);
      $$;
      create table public.profiles (id uuid primary key, organization_id uuid);
      create table public.organization_admins (user_id uuid primary key, organization_id uuid,
        role text, status text, permissions jsonb);
      create table private.revoked_org_admin_users (user_id uuid primary key);
      create table public.students (id uuid primary key, tutor_id uuid, organization_id uuid,
        linked_user_id uuid, parent_user_id uuid, admin_comment text,
        admin_comment_visible_to_tutor boolean not null default false);
      grant select on public.profiles, public.organization_admins to authenticated;
      grant select, insert, update, delete on public.students to authenticated;
      alter table public.organization_admins enable row level security;
      create policy own_seat on public.organization_admins for select to authenticated
        using (user_id=auth.uid());
      alter table public.students enable row level security;
      create policy student_portal_select on public.students for select to authenticated using (
        tutor_id=auth.uid() or linked_user_id=auth.uid() or parent_user_id=auth.uid()
        or exists (select 1 from public.organization_admins oa where oa.user_id=auth.uid()
          and (oa.organization_id=students.organization_id or oa.organization_id in
            (select p.organization_id from public.profiles p where p.id=students.tutor_id)))
      );
      create policy student_portal_update on public.students for update to authenticated
        using (true) with check (true);
      create policy student_portal_insert on public.students for insert to authenticated with check (true);
      insert into public.profiles values ('${tutor}','${org}');
      insert into public.organization_admins values
        ('${owner}','${org}','owner','active','{}'),
        ('${reader}','${org}','custom','active','{"students.view":true}'),
        ('${editor}','${org}','custom','active','{"students.edit":true}'),
        ('${suspended}','${org}','owner','suspended','{}'),
        ('${revoked}','${org}','owner','active','{}'),
        ('${otherOwner}','${otherOrg}','owner','active','{}');
      insert into private.revoked_org_admin_users values ('${revoked}');
      insert into public.students values
        ('${student}','${tutor}','${org}','${child}','${parent}','Private legacy note',false),
        ('${pairing}','${tutor}','${org}','${child}','${parent}','Visible historical comment',true),
        ('${legacy}','${tutor}',null,'${child}','${parent}','Older private note',false),
        ('${outside}',null,'${otherOrg}',null,null,'Other organization private note',false),
        ('${movedTutorStudent}','${tutor}','${otherOrg}',null,null,'Private note owned by the original organization',false);
    `);
    const seatsMigration = readFileSync('supabase/migrations/20260814105327_org_admin_seats_permissions.sql', 'utf8');
    const permissionGate = seatsMigration.match(/CREATE OR REPLACE FUNCTION private\.org_admin_permission_gate[\s\S]*?\$\$;/)?.[0];
    if (!permissionGate) throw new Error('The real organization permission gate is required');
    await db.exec(permissionGate);
    await db.exec(`revoke all on function private.org_admin_permission_gate(text[]) from public;
      grant execute on function private.org_admin_permission_gate(text[]) to authenticated;`);
    // Use the real current profiles permission policy, including its deliberate
    // non-admin allowance, to verify legacy tutor-derived org access under RLS.
    const profilePermissionPolicy = seatsMigration.match(/CREATE POLICY org_admin_permission_select ON public\.profiles[\s\S]*?;/)?.[0];
    if (!profilePermissionPolicy) throw new Error('The real profiles permission policy is required');
    await db.exec(`alter table public.profiles enable row level security;
      create policy profiles_select on public.profiles for select using (true);`);
    await db.exec(profilePermissionPolicy);
    await db.exec(readFileSync('supabase/migrations/20260930130513_student_private_admin_notes.sql', 'utf8'));
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  async function asUser<T>(userId: string, action: () => Promise<T>): Promise<T> {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
    await db.exec('set role authenticated');
    try { return await action(); } finally { await db.exec('reset role'); }
  }
  function save(ids: string[], comment: string | null, date: string | null, tutorComment: string | null) {
    return db.query('select public.save_student_notes($1::uuid[],$2,$3::date,$4)', [ids, comment, date, tutorComment]);
  }

  it('moves hidden historical text off publicly selected student rows and preserves tutor-visible text', async () => {
    const rows = (await db.query<{ id: string; admin_comment: string | null }>(
      'select id,admin_comment from public.students order by id',
    )).rows;
    expect(rows.find((row) => row.id === student)?.admin_comment).toBeNull();
    expect(rows.find((row) => row.id === legacy)?.admin_comment).toBeNull();
    expect(rows.find((row) => row.id === pairing)?.admin_comment).toBe('Visible historical comment');
    const notes = (await db.query<{ student_id: string; admin_comment: string }>('select * from public.student_admin_notes')).rows;
    expect(notes.find((row) => row.student_id === student)?.admin_comment).toBe('Private legacy note');
    expect(notes.find((row) => row.student_id === legacy)?.admin_comment).toBe('Older private note');
    expect(notes.some((row) => row.student_id === pairing)).toBe(false);
  });

  it('uses row security and invoker functions, with no anonymous note or RPC access', async () => {
    const security = await db.query<{ enabled: boolean }>(
      "select relrowsecurity as enabled from pg_class where oid='public.student_admin_notes'::regclass",
    );
    expect(security.rows[0].enabled).toBe(true);
    const functions = (await db.query<{ prosecdef: boolean }>(
      "select prosecdef from pg_proc where proname in ('save_student_notes','can_access_student_admin_notes','guard_student_tutor_comment')",
    )).rows;
    expect(functions).toHaveLength(3);
    expect(functions.every((row) => row.prosecdef === false)).toBe(true);
    await db.exec('set role anon');
    try {
      for (const sql of [
        'select * from public.student_admin_notes',
        `insert into public.student_admin_notes(student_id) values('${pairing}')`,
        "update public.student_admin_notes set admin_comment='Attempted write'",
        'delete from public.student_admin_notes',
      ]) await expect(db.query(sql)).rejects.toThrow(/permission denied/i);
      await expect(save([student], 'Private', null, 'Tutor')).rejects.toThrow(/permission denied/i);
    } finally { await db.exec('reset role'); }
  });

  it('hides private notes from tutors, children, parents, other organizations, suspended and revoked seats', async () => {
    for (const actor of [tutor, child, parent, otherOwner, suspended, revoked]) {
      await asUser(actor, async () => {
        const notes = (await db.query('select * from public.student_admin_notes where student_id=$1', [student])).rows;
        expect(notes).toHaveLength(0);
        await expect(save([student], 'Attempted secret overwrite', '2026-09-30', 'Attempted public overwrite'))
          .rejects.toThrow(/permission|unavailable/i);
        await expect(db.query('insert into public.student_admin_notes(student_id,admin_comment) values($1,$2)',
          [pairing, 'Attempted secret insert'])).rejects.toThrow(/row-level security/i);
        expect((await db.query('update public.student_admin_notes set admin_comment=$1 where student_id=$2 returning *',
          ['Attempted secret update', student])).rows).toHaveLength(0);
        expect((await db.query('delete from public.student_admin_notes where student_id=$1 returning *', [student])).rows)
          .toHaveLength(0);
      });
    }
  });

  it('allows students.view to read without granting edit and retains legacy tutor-only organization access', async () => {
    await asUser(reader, async () => {
      const notes = (await db.query('select * from public.student_admin_notes order by student_id')).rows;
      expect(notes).toHaveLength(2);
      await expect(save([student], 'Unauthorized', null, null)).rejects.toThrow(/permission/i);
      await expect(db.query('insert into public.student_admin_notes(student_id) values($1)', [pairing]))
        .rejects.toThrow(/row-level security/i);
      expect((await db.query('update public.student_admin_notes set admin_comment=$1 returning *', ['Unauthorized'])).rows)
        .toHaveLength(0);
      expect((await db.query('delete from public.student_admin_notes returning *')).rows).toHaveLength(0);
    });
  });

  it('uses the explicit student organization when the assigned tutor belongs to another organization', async () => {
    await asUser(owner, async () => {
      // The existing legacy students SELECT policy permits tutor-derived reads.
      expect((await db.query('select * from public.students where id=$1', [movedTutorStudent])).rows).toHaveLength(1);
      expect((await db.query('select * from public.student_admin_notes where student_id=$1', [movedTutorStudent])).rows).toHaveLength(0);
      await expect(save([movedTutorStudent], 'Unauthorized organization', null, 'Unauthorized organization'))
        .rejects.toThrow(/permission/i);
      await expect(db.query('update public.students set admin_comment=$1,admin_comment_visible_to_tutor=true where id=$2',
        ['Unauthorized organization', movedTutorStudent])).rejects.toThrow(/administrators/i);
    });
    await asUser(otherOwner, async () => {
      const note = (await db.query<{ admin_comment: string }>('select * from public.student_admin_notes where student_id=$1', [movedTutorStudent])).rows[0];
      expect(note.admin_comment).toBe('Private note owned by the original organization');
    });
  });

  it('persists private text, contact date and tutor text independently across pairings in one save', async () => {
    await asUser(editor, () => save([student, pairing, student], '  Admin-only text  ', '2026-09-30', '  Tutor-facing text  '));
    await asUser(owner, async () => {
      const notes = (await db.query<{ admin_comment: string; last_contacted_at: string }>(
        'select admin_comment,last_contacted_at::text from public.student_admin_notes where student_id=any($1::uuid[])',
        [[student, pairing]],
      )).rows;
      expect(notes).toHaveLength(2);
      expect(notes.every((row) => row.admin_comment === 'Admin-only text' && row.last_contacted_at === '2026-09-30')).toBe(true);
    });
    await asUser(tutor, async () => {
      const rows = (await db.query<{ admin_comment: string; admin_comment_visible_to_tutor: boolean }>(
        'select * from public.students where id=any($1::uuid[])', [[student, pairing]],
      )).rows;
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.admin_comment === 'Tutor-facing text' && row.admin_comment_visible_to_tutor)).toBe(true);
      expect(JSON.stringify(rows)).not.toContain('Admin-only text');
      expect((await db.query('select * from public.student_admin_notes')).rows).toHaveLength(0);
    });
  });

  it('rejects mixed organizations and missing IDs before changing any part of the save', async () => {
    for (const invalidIds of [[student, outside], [student, missing]]) {
      await asUser(owner, () => expect(save(invalidIds, 'Must not save', '2020-01-01', 'Must not save')).rejects.toThrow(/permission|unavailable/i));
    }
    const note = (await db.query<{ admin_comment: string }>('select admin_comment from public.student_admin_notes where student_id=$1', [student])).rows[0];
    const visible = (await db.query<{ admin_comment: string }>('select admin_comment from public.students where id=$1', [student])).rows[0];
    expect(note.admin_comment).toBe('Admin-only text');
    expect(visible.admin_comment).toBe('Tutor-facing text');
    await asUser(owner, () => expect(save([], null, null, null)).rejects.toThrow(/selection/i));
  });

  it('keeps every field unchanged if existing students UPDATE row security rejects a pairing', async () => {
    await db.exec(`create policy test_blocked_update on public.students as restrictive
      for update to authenticated using(id<>'${pairing}') with check(id<>'${pairing}');`);
    try {
      await asUser(owner, () => expect(save([student, pairing], 'Must roll back', null, 'Must roll back'))
        .rejects.toThrow(/cannot be updated|unavailable/i));
    } finally { await db.exec('drop policy test_blocked_update on public.students'); }
    const privateRows = (await db.query<{ admin_comment: string }>(
      'select admin_comment from public.student_admin_notes where student_id=any($1::uuid[])', [[student, pairing]],
    )).rows;
    expect(privateRows.every((row) => row.admin_comment === 'Admin-only text')).toBe(true);
    const publicRows = (await db.query<{ admin_comment: string }>(
      'select admin_comment from public.students where id=any($1::uuid[])', [[student, pairing]],
    )).rows;
    expect(publicRows.every((row) => row.admin_comment === 'Tutor-facing text')).toBe(true);
  });

  it('rolls private upserts back when the later tutor comment update fails', async () => {
    await db.exec(`alter table public.students add constraint test_notes_rollback
      check(id<>'${pairing}' or admin_comment is distinct from 'Must roll back');`);
    try {
      await asUser(owner, () => expect(save([student, pairing], 'Must roll back', null, 'Must roll back'))
        .rejects.toThrow(/check constraint/i));
    } finally { await db.exec('alter table public.students drop constraint test_notes_rollback'); }
    const privateRows = (await db.query<{ admin_comment: string }>(
      'select admin_comment from public.student_admin_notes where student_id=any($1::uuid[])', [[student, pairing]],
    )).rows;
    expect(privateRows.every((row) => row.admin_comment === 'Admin-only text')).toBe(true);
    const publicRows = (await db.query<{ admin_comment: string }>(
      'select admin_comment from public.students where id=any($1::uuid[])', [[student, pairing]],
    )).rows;
    expect(publicRows.every((row) => row.admin_comment === 'Tutor-facing text')).toBe(true);
  });

  it('prevents old checkbox clients from putting hidden notes back on students', async () => {
    await asUser(owner, async () => {
      await expect(db.query('update public.students set admin_comment=$1,admin_comment_visible_to_tutor=false where id=$2',
        ['Private text on a shared row', student])).rejects.toThrow(/student_admin_notes/i);
      await expect(db.query(`insert into public.students(id,organization_id,admin_comment) values($1,$2,$3)`,
        [missing, org, 'Private text in a new shared row'])).rejects.toThrow(/student_admin_notes/i);
    });
  });

  it('does not let tutors, children or parents edit administration-authored tutor comments', async () => {
    for (const actor of [tutor, child, parent]) {
      await asUser(actor, () => expect(db.query('update public.students set admin_comment=$1 where id=$2',
        ['Attempted tutor comment overwrite', student])).rejects.toThrow(/administrators/i));
    }
  });

  it('blocks writes for a suspended organization and allows clearing each independent field', async () => {
    await db.exec("set test.org_suspended='true'");
    try {
      await asUser(owner, () => expect(save([student], 'Blocked', null, 'Blocked')).rejects.toThrow(/permission/i));
    } finally { await db.exec("set test.org_suspended='false'"); }
    await asUser(owner, () => save([student], '   ', null, '\n'));
    const note = (await db.query<{ admin_comment: string | null; last_contacted_at: string | null }>(
      'select * from public.student_admin_notes where student_id=$1', [student],
    )).rows[0];
    expect(note.admin_comment).toBeNull();
    expect(note.last_contacted_at).toBeNull();
    const visible = (await db.query<{ admin_comment: string | null }>('select * from public.students where id=$1', [student])).rows[0];
    expect(visible.admin_comment).toBeNull();
  });
});
