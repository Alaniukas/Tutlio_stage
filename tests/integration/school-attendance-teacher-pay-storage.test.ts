// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const organizationId = '10000000-0000-4000-8000-000000000001';
const groupId = '20000000-0000-4000-8000-000000000001';
const teacherId = '30000000-0000-4000-8000-000000000001';
const students = [1, 2, 3].map(n => `40000000-0000-4000-8000-00000000000${n}`);
const sessionIds = [1, 2].map(n => `50000000-0000-4000-8000-00000000000${n}`);
const start = '2026-09-30T06:00:00Z', end = '2026-09-30T07:00:00Z';
const record = (studentId = students[0], extra: any = {}) => ({
  organization_id: organizationId, group_id: groupId, student_id: studentId, tutor_id: teacherId,
  anchor_session_id: null, start_time: start, end_time: end, status: 'completed', contract_confirmed: false,
  confirmed_by: teacherId, confirmed_at: '2026-09-30T08:00:00Z',
  student_name: 'Isolated child', tutor_name: 'Isolated teacher', group_name: 'Isolated group', ...extra,
});

describe('school attendance common teacher pay storage', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create table public.organizations(id uuid primary key,features jsonb not null default '{}');
      create table public.students(id uuid primary key);
      create table public.profiles(id uuid primary key,organization_id uuid,company_commission_percent numeric);
      create table public.sessions(id uuid primary key,student_id uuid,class_group_id uuid,tutor_id uuid,
        start_time timestamptz,end_time timestamptz,status text,status_confirmed_at timestamptz,
        status_confirmed_by uuid,tutor_pay_eur_snapshot numeric,no_show_reason text);
      create table public.invoice_line_items(id uuid primary key default gen_random_uuid());
      grant select,insert,update,delete on public.organizations,public.profiles,public.sessions,public.invoice_line_items to service_role;
      insert into public.organizations values('${organizationId}','{"tutor_lesson_status_confirmation":true}');
      insert into public.profiles values('${teacherId}','${organizationId}',45);
      insert into auth.users values('${teacherId}');
      insert into public.students values('${students[0]}'),('${students[1]}'),('${students[2]}');`);
    for (const file of ['20260930105900_school_group_attendance_attestations.sql',
      '20260930193000_school_attendance_teacher_pay.sql']) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    }
  }, 30_000);
  afterAll(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec(`reset role; truncate public.school_group_attendance_attestations,public.sessions,public.invoice_line_items;
      update public.profiles set company_commission_percent=45;
      update public.organizations set features='{"tutor_lesson_status_confirmation":true}'; set role service_role;`);
  });
  async function save(data = record()) {
    return (await db.query<{ saved: any }>('select to_jsonb(public.save_school_group_attendance($1::jsonb)) as saved',
      [JSON.stringify(data)])).rows[0].saved;
  }
  async function realSession(id = sessionIds[0], studentId = students[0], rate: number | null = 45, confirmed = true, status = 'completed') {
    await db.query(`insert into public.sessions(id,student_id,class_group_id,tutor_id,start_time,end_time,status,
      status_confirmed_at,status_confirmed_by,tutor_pay_eur_snapshot) values($1,$2,$3,$4,$5,$6,$7,$8,$4,$9)`,
    [id, studentId, groupId, teacherId, start, end, status, confirmed ? '2026-09-30T08:00:00Z' : null, rate]);
  }
  async function rows(table: 'sessions' | 'school_group_attendance_attestations') {
    return (await db.query<{ row: any }>(`select to_jsonb(r) as row from public.${table} r order by id`)).rows.map(row => row.row);
  }

  it('captures one common historical rate across concurrent sibling saves and ignores injected prices', async () => {
    const saved = await Promise.all([save(record(students[0], { tutor_pay_eur_snapshot: 999 })), save(record(students[1]))]);
    expect(saved.map(row => row.tutor_pay_eur_snapshot)).toEqual([45, 45]);
    await db.query('update public.profiles set company_commission_percent=90 where id=$1', [teacherId]);
    expect((await save(record(students[2]))).tutor_pay_eur_snapshot).toBe(45);
    expect((await rows('school_group_attendance_attestations')).map(row => row.tutor_pay_eur_snapshot)).toEqual([45, 45, 45]);
    expect(await rows('sessions')).toEqual([]);
  });

  it('keeps the first known rate on replay and correction without accepting a contract or creating sessions', async () => {
    const first = await save();
    await db.query('update public.profiles set company_commission_percent=90 where id=$1', [teacherId]);
    const retry = await save(record(students[0], { tutor_pay_eur_snapshot: 999, contract_confirmed: true }));
    expect(retry.id).toBe(first.id);
    expect(retry.tutor_pay_eur_snapshot).toBe(45);
    expect(retry.contract_confirmed).toBe(false);
    const corrected = await save(record(students[0], { status: 'no_show', confirmed_at: '2026-09-30T09:00:00Z' }));
    expect(corrected.tutor_pay_eur_snapshot).toBe(45);
    expect(corrected.status).toBe('no_show');
    expect((await save(record(students[0]))).tutor_pay_eur_snapshot).toBe(45);
    expect(await rows('sessions')).toEqual([]);
  });

  it.each([0, 35])('inherits the unique manually confirmed real rate %s instead of today’s base', async rate => {
    await realSession(sessionIds[0], students[0], rate);
    const before = await rows('sessions');
    const saved = await save(record(students[1], { anchor_session_id: sessionIds[0] }));
    expect(saved.tutor_pay_eur_snapshot).toBe(rate);
    expect(await rows('sessions')).toEqual(before);
  });

  it('ignores unconfirmed and cancelled real snapshots while preserving conflicts among confirmed ones', async () => {
    await realSession(sessionIds[0], students[0], 90, false);
    await realSession(sessionIds[1], students[1], 90, true, 'cancelled');
    expect((await save(record(students[2]))).tutor_pay_eur_snapshot).toBe(45);
    await db.exec('delete from public.school_group_attendance_attestations');
    await db.query("update public.sessions set status='completed',status_confirmed_at=$1,tutor_pay_eur_snapshot=35 where id=$2",
      ['2026-09-30T08:00:00Z', sessionIds[0]]);
    await db.query("update public.sessions set status='no_show',tutor_pay_eur_snapshot=60 where id=$1", [sessionIds[1]]);
    expect((await save(record(students[2]))).tutor_pay_eur_snapshot).toBeNull();
  });

  it('inherits eligible unstamped legacy outcomes without borrowing an automatic missed-join absence', async () => {
    await db.query("update public.organizations set features='{}' where id=$1", [organizationId]);
    await realSession(sessionIds[0], students[0], 35, false);
    expect((await save(record(students[2]))).tutor_pay_eur_snapshot).toBe(35);
    await db.exec('delete from public.school_group_attendance_attestations');
    await db.query("update public.sessions set status='no_show' where id=$1", [sessionIds[0]]);
    expect((await save(record(students[2]))).tutor_pay_eur_snapshot).toBe(35);
    await db.exec('delete from public.school_group_attendance_attestations');
    await db.query("update public.sessions set status='no_show',no_show_reason='missed_join' where id=$1", [sessionIds[0]]);
    expect((await save(record(students[2]))).tutor_pay_eur_snapshot).toBe(45);
  });

  it('leaves an unconfigured rate unknown and captures it once when a positive common rate becomes available', async () => {
    await db.query('update public.profiles set company_commission_percent=0 where id=$1', [teacherId]);
    expect((await save()).tutor_pay_eur_snapshot).toBeNull();
    await db.query('update public.profiles set company_commission_percent=60 where id=$1', [teacherId]);
    expect((await save()).tutor_pay_eur_snapshot).toBe(60);
    await db.query('update public.profiles set company_commission_percent=90 where id=$1', [teacherId]);
    expect((await save()).tutor_pay_eur_snapshot).toBe(60);
  });

  it('preserves the real-session authoritative correction guard and does not mutate child history', async () => {
    await realSession();
    await save(record(students[0], { anchor_session_id: sessionIds[0] }));
    await db.query("update public.sessions set status='no_show',status_confirmed_at='2026-09-30T09:00:00Z' where id=$1", [sessionIds[0]]);
    const before = await rows('sessions');
    const delayed = await save(record(students[0], { anchor_session_id: sessionIds[0] }));
    expect(delayed.status).toBe('no_show');
    expect(Date.parse(delayed.confirmed_at)).toBe(Date.parse('2026-09-30T09:00:00Z'));
    expect(delayed.tutor_pay_eur_snapshot).toBe(45);
    expect(await rows('sessions')).toEqual(before);
  });

  it('keeps the updated save RPC service-only and adds an indexed independent invoice evidence array', async () => {
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`reset role; set role ${role}`);
      await expect(save()).rejects.toThrow(/permission denied/i);
    }
    await db.exec('reset role; set role service_role');
    const line = (await db.query<{ ids: string[] }>('insert into public.invoice_line_items default values returning school_attendance_ids as ids')).rows[0];
    expect(line.ids).toEqual([]);
    await db.exec('reset role');
    const index = await db.query<{ type: string }>(`select a.amname as type from pg_class c join pg_am a on a.oid=c.relam
      where c.oid='public.invoice_line_items_school_attendance_ids'::regclass`);
    expect(index.rows[0].type).toBe('gin');
  });
});
