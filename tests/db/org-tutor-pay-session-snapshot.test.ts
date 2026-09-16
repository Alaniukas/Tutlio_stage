import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260916183000_org_tutor_pay_session_snapshot.sql',
  'utf8',
);

describe('org tutor pay session snapshot migration', () => {
  it('adds the immutable lesson-level tutor pay column', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS tutor_pay_eur_snapshot numeric(10,2)');
    expect(sql).toContain('NULL means the historical rate is not known yet');
  });

  it('records every real tutor pay change with old and new values', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.org_tutor_pay_audit');
    expect(sql).toContain('old_base_pay_eur');
    expect(sql).toContain('new_base_pay_eur');
    expect(sql).toContain('old_subject_pay');
    expect(sql).toContain('new_subject_pay');
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('profiles_audit_org_tutor_pay');
  });

  it('captures completed and no-show lesson pay, including subject overrides', () => {
    expect(sql).toContain("NEW.status IN ('completed', 'no_show')");
    expect(sql).toContain('sessions_capture_org_tutor_pay');
    expect(sql).toContain('v_subject_pay ->> p_subject_id::text');
    expect(sql).toContain("'2c4e4c2a-4e12-44ca-b327-d605bbb0d50b'::uuid");
  });

  it('does not freeze ambiguous legacy zeroes and fills them after a rate repair', () => {
    expect(sql).toContain('IF v_pay > 0 THEN');
    expect(sql).toContain('profiles_backfill_org_tutor_pay');
    expect(sql).toContain('s.tutor_pay_eur_snapshot IS NULL');
    expect(sql).toContain('private.resolve_org_tutor_session_pay(s.tutor_id, s.subject_id) > 0');
  });

  it('backfills existing conducted lessons with currently configured positive rates', () => {
    expect(sql).toMatch(/UPDATE public\.sessions s[\s\S]*s\.status IN \('completed', 'no_show'\)/);
  });
});
