// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('preserves old memberships and snapshots while enforcing valid recording-plan modes', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE public.school_class_group_members(group_id text, student_id text, enrolled_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.school_contracts(id text, organization_id text, class_group_id text, student_id text, kind text, signing_status text, order_snapshot jsonb);
      INSERT INTO public.school_class_group_members(group_id,student_id,enrolled_at) VALUES ('old-group','old-child','2026-09-01T08:00:00Z');
      INSERT INTO public.school_contracts VALUES ('old','school','old-group','old-child','extra_lessons','signed','{"unit_price_eur":6}');`);
    const migration = readFileSync('supabase/migrations/20260928190100_school_recording_plan_entitlements.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    await db.exec(`SET TIME ZONE 'UTC';`);
    expect((await db.query(`SELECT recording_access, enrolled_at::text FROM public.school_class_group_members`)).rows[0])
      .toEqual({ recording_access: 'schedule', enrolled_at: '2026-09-01 08:00:00+00' });
    expect((await db.query(`SELECT order_snapshot FROM public.school_contracts`)).rows[0]).toEqual({ order_snapshot: { unit_price_eur: 6 } });
    await db.exec(`INSERT INTO public.school_class_group_members(group_id,student_id,recording_access) VALUES ('g','a','group'),('g','b','none');`);
    await expect(db.exec(`INSERT INTO public.school_class_group_members(group_id,student_id,recording_access) VALUES ('g','c',NULL);`)).rejects.toThrow();
    await expect(db.exec(`UPDATE public.school_class_group_members SET recording_access='unknown';`)).rejects.toThrow();
    await expect(db.exec(`UPDATE public.school_class_group_members SET legacy_recording_scope='{}';`)).rejects.toThrow();
    await db.exec(`UPDATE public.school_class_group_members SET legacy_recording_scope='{"schedule_slots":null}';`);
    await expect(db.exec(`UPDATE public.school_contracts SET order_snapshot='{"recording_access":null}';`)).rejects.toThrow();
    await expect(db.exec(`UPDATE public.school_contracts SET order_snapshot='{"recording_access":"unknown"}';`)).rejects.toThrow();
    await db.exec(`UPDATE public.school_contracts SET order_snapshot='{"recording_access":"none"}';`);
  } finally { await db.close(); }
}, 30_000);
