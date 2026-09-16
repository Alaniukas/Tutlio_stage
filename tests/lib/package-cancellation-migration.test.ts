import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260916170000_atomic_package_cancellation.sql',
  'utf8',
);

describe('atomic package cancellation migration', () => {
  it('locks the package and releases lessons in the same transaction', () => {
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain("payment_status = 'cancelled'");
    expect(sql).toContain('lesson_package_id = NULL');
    expect(sql).toContain('reservation_expires_at = NULL');
  });

  it('limits the RPC to the service role and verifies organization ownership', () => {
    expect(sql).toContain('coalesce(v_package.pool_organization_id, v_tutor_org)');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.cancel_pending_lesson_package');
    expect(sql).toContain('TO service_role');
  });

  it('prevents any cancelled package from becoming payable again', () => {
    expect(sql).toContain("OLD.payment_status = 'cancelled'");
    expect(sql).toContain("NEW.payment_status IS DISTINCT FROM 'cancelled'");
    expect(sql).toContain('Cancelled package cannot be reactivated');
  });

  it('safely remediates only the audited Benas package', () => {
    expect(sql).toContain("'88966778-d9db-4fe7-ae53-1b3e8411b3cf'::uuid");
    expect(sql).toContain("'3422031d-6e21-424d-980b-35a9c6d7b8f1'::uuid");
    expect(sql).toContain("v_payer_email IS DISTINCT FROM 'asta321654@gmail.com'");
    expect(sql).toContain('v_checkout_session_id IS NOT NULL');
    expect(sql).toContain("v_status <> 'pending'");
    expect(sql).toContain("set_config('request.jwt.claim.role', 'service_role', true)");
  });
});
