import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260916160000_booking_block_inherit_billing_owner.sql',
  'utf8',
);

describe('booking block billing-owner migration', () => {
  it('loads live organization billing and restriction settings', () => {
    expect(sql).toContain('FROM public.organizations o');
    expect(sql).toContain('COALESCE(o.enable_per_lesson, false)');
    expect(sql).toContain('COALESCE(o.enable_monthly_billing, false)');
    expect(sql).toContain('COALESCE(o.restrict_booking_on_overdue, false)');
  });

  it('lets monthly billing win for an empty legacy payment model', () => {
    expect(sql).toContain('AND v_enable_per_lesson');
    expect(sql).toContain('AND NOT v_enable_monthly_billing');
    expect(sql).toContain("position('per_lesson' in coalesce(v_payment_model, '')) > 0");
  });

  it('does not treat confirmed reservation state as actual payment', () => {
    expect(sql).toContain("NOT IN ('paid', 'paid_by_student')");
    expect(sql).not.toContain("NOT IN ('paid', 'confirmed', 'paid_by_student')");
  });
});
