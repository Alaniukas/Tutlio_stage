import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensurePooledMonthlyRenewal, generatePooledMonthlyPackage } from '../../api/_lib/pooledMonthlyGeneration';

const mocks = vi.hoisted(() => ({ preview: vi.fn(), email: vi.fn() }));
vi.mock('../../api/_lib/monthlyStudentPackage.js', () => ({ previewMonthlyStudentPackage: mocks.preview }));
vi.mock('../../api/_lib/sendPendingPackageEmail.js', () => ({
  pooledPackageEmailIdempotencyKey: (packageId: string) => `pooled-package/${packageId}/offer`,
  sendPendingPackagePaymentEmail: mocks.email,
}));
vi.mock('../../api/_lib/marketMoney.js', () => ({ isProKlaseOrg: (id: string) => id === 'pro' }));
vi.mock('../../src/lib/orgStudentPricing.js', () => ({ fetchOrgStudentDynamicPrice: async () => ({ price: 27, lessonsPerWeek: 2, studentIds: ['s1', 's2'] }) }));

function database() {
  const tables: Record<string, any[]> = {
    students: [{ id: 's1', tutor_id: 't1', grade: '5', organization_id: 'pro' }, { id: 's2', tutor_id: 't2', grade: '5', organization_id: 'pro' }],
    organizations: [{ id: 'pro', features: { monthly_packages: true }, stripe_account_id: 'acct', stripe_onboarding_complete: true }],
    recurring_monthly_package_plans: [], lesson_packages: [],
  };
  const rpc = vi.fn(async (_name: string, params: any) => {
    const id = 'pooled-' + params.p_period_end;
    tables.lesson_packages.push({ id, student_id: 's1', pool_organization_id: 'pro', billing_period_end: params.p_period_end,
      payment_status: 'pending', pool_email_claimed_at: null, pool_email_sent_at: null });
    return { data: id, error: null };
  });
  const db: any = { rpc, from: (table: string) => {
    const filters: Array<(row: any) => boolean> = [];
    let patch: any, insert: any, single = false;
    const q: any = new Proxy({}, { get: (_, method) => {
      if (method === 'then') return (resolve: any) => {
        if (insert) tables[table].push({ id: 'new-plan', ...insert });
        const data = tables[table].filter(row => filters.every(filter => filter(row)));
        if (patch) data.forEach(row => Object.assign(row, patch));
        return resolve({ data: single ? data[0] : data, error: null });
      };
      return (key: any, value: any) => {
        if (method === 'eq') filters.push(row => row[key] === value);
        if (method === 'neq') filters.push(row => row[key] !== value);
        if (method === 'in') filters.push(row => value.includes(row[key]));
        if (method === 'is') filters.push(row => (row[key] ?? null) === value);
        if (method === 'update') patch = key;
        if (method === 'insert') insert = key;
        if (method === 'single' || method === 'maybeSingle') single = true;
        return q;
      };
    } });
    return q;
  } };
  return { db, rpc, tables };
}

const args = { organizationId: 'pro', studentId: 's1', periodStart: '2026-10-01', createdBy: 'owner', appOrigin: 'https://local.example.test', serviceRoleKey: 'fake' };

describe('pooled monthly service renewal and retries', () => {
  beforeEach(() => {
    mocks.preview.mockReset().mockResolvedValue({ studentIds: ['s1', 's2'], items: [{ subjectId: 'math', totalLessons: 7 }],
      pricePerLesson: 27, periodStart: '2026-10-01', periodEnd: '2026-10-31', previewToken: 'calendar', sessionIds: ['actual'] });
    mocks.email.mockReset().mockResolvedValue({ ok: true });
  });

  it('reuses one legacy plan, advances it, and disables duplicate tutor renewals', async () => {
    const { db, tables } = database();
    tables.recurring_monthly_package_plans = [1, 2].map(i => ({ id: `p${i}`, student_id: `s${i}`, organization_id: 'pro', active: true, next_generation_date: '2026-10-01' }));
    await ensurePooledMonthlyRenewal(db, { ...args, studentIds: ['s1', 's2'] });
    expect(tables.recurring_monthly_package_plans.filter(row => row.active)).toEqual([
      expect.objectContaining({ id: 'p1', next_generation_date: '2026-11-01', auto_from_schedule: true, subject_id: null }),
    ]);
  });

  it('a retry reuses the package and renewal, without another creation or email', async () => {
    const { db, rpc, tables } = database();
    await generatePooledMonthlyPackage(db, args);
    await generatePooledMonthlyPackage(db, { ...args, studentId: 's2' });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mocks.preview).toHaveBeenCalledTimes(1);
    expect(mocks.email).toHaveBeenCalledTimes(1);
    expect(mocks.email).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: 'pooled-package/pooled-2026-10-31/offer',
      sendEmailUrl: 'https://local.example.test/api/send-email',
    }));
    expect(tables.recurring_monthly_package_plans).toHaveLength(1);
    expect(rpc.mock.calls[0]).toEqual(['create_org_student_package', expect.objectContaining({ p_unit_price: 27,
      p_items: [{ subjectId: 'math', totalLessons: 7 }], p_session_ids: ['actual'] })]);
  });

  it('keeps an empty future calendar retryable without generating credits or sending email', async () => {
    const { db, rpc, tables } = database();
    mocks.preview.mockRejectedValue(new Error('No scheduled lessons'));
    await expect(generatePooledMonthlyPackage(db, args)).rejects.toThrow('No scheduled lessons');
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled();
    expect(tables.recurring_monthly_package_plans).toHaveLength(0);
  });
  it('retries a failed email for the same package before advancing the renewal', async () => {
    const { db, rpc, tables } = database();
    tables.recurring_monthly_package_plans.push({ id: 'renewal', student_id: 's1', organization_id: 'pro', active: true, next_generation_date: '2026-10-01' });
    mocks.email.mockResolvedValueOnce({ ok: false, error: 'Email service unavailable' });
    await expect(generatePooledMonthlyPackage(db, args)).rejects.toThrow('Email service unavailable');
    expect(tables.lesson_packages[0].pool_email_claimed_at).toBeNull();
    expect(tables.recurring_monthly_package_plans[0].next_generation_date).toBe('2026-10-01');
    await generatePooledMonthlyPackage(db, args);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(mocks.email).toHaveBeenCalledTimes(2);
    expect(tables.recurring_monthly_package_plans[0].next_generation_date).toBe('2026-11-01');
  });
  it('leaves renewal due while another live delivery claim is in progress', async () => {
    const { db, rpc, tables } = database();
    tables.lesson_packages.push({ id: 'claimed', student_id: 's1', pool_organization_id: 'pro',
      billing_period_end: '2026-10-31', payment_status: 'pending', pool_email_claimed_at: new Date().toISOString(),
      pool_email_sent_at: null });
    tables.recurring_monthly_package_plans.push({ id: 'renewal', student_id: 's1', organization_id: 'pro', active: true,
      next_generation_date: '2026-10-01' });
    await expect(generatePooledMonthlyPackage(db, args)).resolves.toEqual(expect.objectContaining({
      packageId: 'claimed', emailSent: false, deliveryPending: true, existing: true,
    }));
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled();
    expect(tables.recurring_monthly_package_plans[0].next_generation_date).toBe('2026-10-01');
  });
  it('creates October separately from an existing September pool and advances the same renewal', async () => {
    const { db, rpc, tables } = database();
    tables.lesson_packages.push({ id: 'september-pool', student_id: 's1', pool_organization_id: 'pro', billing_period_end: '2026-09-30', payment_status: 'paid' });
    tables.recurring_monthly_package_plans.push({ id: 'renewal', student_id: 's1', organization_id: 'pro', active: true, next_generation_date: '2026-10-01' });
    const result = await generatePooledMonthlyPackage(db, args);
    expect(result.packageId).not.toBe('september-pool');
    expect(result.existing).toBe(false);
    expect(tables.lesson_packages.map(row => row.billing_period_end)).toEqual(['2026-09-30', '2026-10-31']);
    expect(tables.recurring_monthly_package_plans).toHaveLength(1);
    expect(tables.recurring_monthly_package_plans[0].next_generation_date).toBe('2026-11-01');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('does not silently switch a manual-payment organization to Stripe', async () => {
    const { db, rpc, tables } = database();
    tables.organizations[0].features.manual_payments = true;
    await expect(generatePooledMonthlyPackage(db, args)).rejects.toThrow('configured Stripe');
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.email).not.toHaveBeenCalled();
    expect(tables.recurring_monthly_package_plans).toHaveLength(0);
  });

});
