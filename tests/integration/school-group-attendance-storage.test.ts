// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const orgId = '10000000-0000-4000-8000-000000000001';
const groupId = '20000000-0000-4000-8000-000000000001';
const studentId = '30000000-0000-4000-8000-000000000001';
const teacherId = '40000000-0000-4000-8000-000000000001';
const secondActorId = '40000000-0000-4000-8000-000000000002';
const initialRecord = {
  organization_id: orgId,
  group_id: groupId,
  student_id: studentId,
  tutor_id: teacherId,
  anchor_session_id: null,
  start_time: '2026-09-30T06:00:00Z',
  end_time: '2026-09-30T07:00:00Z',
  status: 'completed',
  contract_confirmed: false,
  confirmed_by: teacherId,
  confirmed_at: '2026-09-30T08:00:00Z',
  student_name: 'Demo Student',
  tutor_name: 'Demo Teacher',
  group_name: 'Demo Group',
};

describe('school group attendance storage', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create table public.organizations (id uuid primary key);
      create table public.students (id uuid primary key);
      create table public.profiles (id uuid primary key);
      create table public.sessions (id uuid primary key, student_id uuid, class_group_id uuid,
        start_time timestamptz, end_time timestamptz, status text,
        status_confirmed_at timestamptz, status_confirmed_by uuid);
      grant select, update on public.sessions to service_role;
      insert into public.organizations values ('${orgId}');
      insert into public.students values ('${studentId}');
      insert into public.profiles values ('${teacherId}');
      insert into auth.users values ('${teacherId}'), ('${secondActorId}');
    `);
    await db.exec(readFileSync('supabase/migrations/20260930105900_school_group_attendance_attestations.sql', 'utf8'));
  }, 30_000);
  afterAll(async () => { await db?.close(); });

  async function save(record: Record<string, unknown>) {
    return (await db.query<Record<string, unknown>>(
      'select (public.save_school_group_attendance($1::jsonb)).*', [JSON.stringify(record)],
    )).rows[0];
  }

  it('denies browser roles direct access and reserves the RPC for the backend', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      try {
        await expect(db.query('select * from public.school_group_attendance_attestations')).rejects.toThrow(/permission denied/i);
        await expect(save(initialRecord)).rejects.toThrow(/permission denied/i);
      } finally {
        await db.exec('reset role');
      }
    }
    const security = await db.query<{ enabled: boolean }>(
      "select relrowsecurity as enabled from pg_class where oid='public.school_group_attendance_attestations'::regclass",
    );
    expect(security.rows[0].enabled).toBe(true);
  });

  it('keeps one historical record on retries and replaces the outcome on correction', async () => {
    await db.exec('set role service_role');
    try {
      const first = await save(initialRecord);
      const retry = await save({ ...initialRecord, contract_confirmed: true, confirmed_by: secondActorId,
        confirmed_at: '2026-09-30T09:00:00Z' });
      expect(retry.id).toBe(first.id);
      expect(retry.contract_confirmed).toBe(false);
      expect(retry.confirmed_by).toBe(teacherId);
      expect(retry.confirmed_at).toEqual(first.confirmed_at);
      expect((await db.query('select * from public.school_group_attendance_attestations')).rows).toHaveLength(1);

      await db.query('update public.school_group_attendance_attestations set reviewed_at=now() where id=$1', [first.id]);
      const correction = await save({ ...initialRecord, status: 'no_show', confirmed_by: secondActorId,
        confirmed_at: '2026-09-30T09:00:00Z' });
      expect(correction.id).toBe(first.id);
      expect(correction.status).toBe('no_show');
      expect(correction.confirmed_by).toBe(secondActorId);
      expect(correction.reviewed_at).toBeNull();
      const alerts = await db.query("select id from public.school_group_attendance_attestations where status='completed' and not contract_confirmed and reviewed_at is null");
      expect(alerts.rows).toHaveLength(0);
    } finally {
      await db.exec('reset role');
    }
  });

  it('rejects invalid outcomes and reversed occurrence times in PostgreSQL', async () => {
    await db.exec('set role service_role');
    try {
      await expect(save({ ...initialRecord, status: 'signed' })).rejects.toThrow(/check constraint/i);
      await expect(save({ ...initialRecord, end_time: initialRecord.start_time })).rejects.toThrow(/check constraint/i);
    } finally {
      await db.exec('reset role');
    }
  });

  it('uses the current real-session outcome when a stale confirmation arrives after a correction', async () => {
    const anchorId = '50000000-0000-4000-8000-000000000001';
    await db.query(`insert into public.sessions values ($1,$2,$3,$4,$5,'no_show',$6,$7)`,
      [anchorId, studentId, groupId, initialRecord.start_time, initialRecord.end_time, '2026-09-30T10:00:00Z', secondActorId]);
    await db.exec('set role service_role');
    try {
      const saved = await save({ ...initialRecord, anchor_session_id: anchorId });
      expect(saved.status).toBe('no_show');
      expect(saved.confirmed_by).toBe(secondActorId);
      // Replaying the earlier completed attestation cannot recreate an unsigned attendance alert.
      const replay = await save({ ...initialRecord, anchor_session_id: anchorId });
      expect(replay.status).toBe('no_show');
      expect(replay.confirmed_at).toEqual(saved.confirmed_at);
      const alerts = await db.query("select id from public.school_group_attendance_attestations where status='completed' and not contract_confirmed");
      expect(alerts.rows).toHaveLength(0);
    } finally {
      await db.exec('reset role');
    }
  });

  it('keeps standalone attendance independent of the sibling session used as the occurrence anchor', async () => {
    const anchorId = '50000000-0000-4000-8000-000000000002';
    const siblingId = '30000000-0000-4000-8000-000000000002';
    await db.query(`insert into public.sessions values ($1,$2,$3,$4,$5,'no_show',$6,$7)`,
      [anchorId, siblingId, groupId, initialRecord.start_time, initialRecord.end_time, '2026-09-30T10:00:00Z', secondActorId]);
    await db.exec('set role service_role');
    try {
      const saved = await save({ ...initialRecord, anchor_session_id: anchorId });
      expect(saved.status).toBe('completed');
      expect(saved.confirmed_by).toBe(teacherId);
    } finally {
      await db.exec('reset role');
    }
  });
});
