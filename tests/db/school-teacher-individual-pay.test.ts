import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20261001100000_school_teacher_individual_pay.sql',
  'utf8',
);

describe('school teacher individual pay migration', () => {
  it('adds a separate individual-meeting rate without rewriting historical snapshots', () => {
    expect(sql).toContain('add column if not exists company_individual_commission_percent');
    expect(sql).toContain('p_class_group_id uuid default null');
    expect(sql.indexOf('execute function private.backfill_org_tutor_pay_after_profile_change()'))
      .toBeLessThan(sql.indexOf('drop function if exists private.resolve_org_tutor_session_pay(uuid, uuid)'));
    expect(sql).toContain('private.resolve_org_tutor_session_pay(new.tutor_id, new.subject_id, new.class_group_id)');
    expect(sql).toContain('and s.tutor_pay_eur_snapshot is null');
  });
});
