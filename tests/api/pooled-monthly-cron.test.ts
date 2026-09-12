import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import generate from '../../api/generate-monthly-packages';
import postTrial from '../../api/send-post-trial-packages';

const state = vi.hoisted(() => ({ tables: {} as Record<string, any[]>, reads: [] as string[], pooled: vi.fn(), pricing: vi.fn() }));
vi.mock('../../api/_lib/pooledMonthlyGeneration.js', () => ({ generatePooledMonthlyPackage: state.pooled }));
vi.mock('../../src/lib/orgStudentPricing.js', () => ({ fetchOrgStudentDynamicPrice: state.pricing }));
vi.mock('../../api/_lib/marketMoney.js', () => ({ isProKlaseOrg: (id: string) => id === 'pro' }));
vi.mock('../../api/_lib/cronAuth.js', () => ({ requireCronAuth: () => true }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ getOrgOwnerUserId: async () => 'owner' }));
vi.mock('../../src/lib/orgIntakeMode.js', () => ({ proKlaseFeatureEnabledForOrgRecord: () => true }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: (table: string) => {
  state.reads.push(table);
  const filters: Array<(row: any) => boolean> = [];
  const q: any = new Proxy({}, { get: (_, method) => {
    if (method === 'then') return (resolve: any) => resolve({ data: (state.tables[table] || []).filter(row => filters.every(f => f(row))), error: null });
    return (key: string, value: any) => {
      if (method === 'eq' && !key.includes('.')) filters.push(row => row[key] === value);
      if (method === 'in') filters.push(row => value.includes(row[key]));
      return q;
    };
  } });
  return q;
} }) }));

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}

describe('Pro Klase automatic pooled package routing', () => {
  beforeEach(() => {
    state.reads = [];
    state.tables = {};
    state.pooled.mockReset().mockResolvedValue({ packageId: 'one-package', emailSent: true, existing: false });
    state.pricing.mockReset().mockResolvedValue({ studentIds: ['s1', 's2'], price: 27, lessonsPerWeek: 2 });
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.test');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
    vi.stubEnv('APP_URL', 'https://trusted.example.test');
    vi.stubEnv('VERCEL_URL', '');
    vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Legacy package send must not run'); }));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('routes manual and template-derived sibling plans into one pooled renewal', async () => {
    state.tables.recurring_monthly_package_plans = [false, true].map((auto, i) => ({
      id: `plan-${i}`, student_id: `s${i + 1}`, tutor_id: `t${i + 1}`, organization_id: 'pro', created_by: 'owner',
      active: true, next_generation_date: '2026-10-01', auto_from_schedule: auto, lessons_per_week: 2,
    }));
    const res = response();
    await generate({ method: 'GET', headers: { origin: 'https://untrusted.test' } } as any, res as any);
    expect(state.pooled).toHaveBeenCalledTimes(1);
    expect(state.pooled.mock.calls[0][1]).toMatchObject({ periodStart: '2026-10-01', appOrigin: 'https://trusted.example.test', organizationId: 'pro' });
    expect(state.reads).not.toContain('recurring_individual_sessions');
    expect(fetch).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ generated: 1, failures: [] }));
  });

  it('does not fall back to rounded legacy generation when the actual calendar service fails', async () => {
    state.tables.recurring_monthly_package_plans = [{ id: 'p', student_id: 's1', organization_id: 'pro', active: true, next_generation_date: '2026-10-01', created_by: 'owner' }];
    state.pooled.mockRejectedValue(new Error('No scheduled lessons'));
    const res = response();
    await generate({ method: 'GET', headers: {} } as any, res as any);
    expect(res.status).toHaveBeenCalledWith(207);
    expect(fetch).not.toHaveBeenCalled();
    expect(state.reads).not.toContain('recurring_individual_sessions');
  });

  function trials() {
    state.tables.sessions = [1, 2].map(i => ({ id: `trial-${i}`, student_id: `s${i}`, tutor_id: `t${i}`, status: 'completed', end_time: '2026-09-08T10:00:00Z' }));
    state.tables.profiles = [1, 2].map(i => ({ id: `t${i}`, organization_id: 'pro' }));
    state.tables.organizations = [{ id: 'pro', features: { monthly_packages: true, post_trial_auto_package: true }, entity_type: 'company' }];
  }

  it('consolidates trials with two tutors into one initial package and renewal service call', async () => {
    trials();
    const res = response();
    await postTrial({ method: 'GET', headers: {} } as any, res as any);
    expect(state.pooled).toHaveBeenCalledTimes(1);
    expect(state.pooled.mock.calls[0][1].periodStart).toMatch(/^\d{4}-\d{2}-01$/);
    expect(fetch).not.toHaveBeenCalled();
    expect(state.reads).not.toContain('recurring_individual_sessions');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sent: 1, skipped: 1 }));
  });

  it('leaves an existing sibling renewal to the monthly cron instead of starting another automation', async () => {
    trials();
    state.tables.recurring_monthly_package_plans = [{ id: 'existing', organization_id: 'pro', student_id: 's2', active: true }];
    const res = response();
    await postTrial({ method: 'GET', headers: {} } as any, res as any);
    expect(state.pooled).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sent: 0, skipped: 2 }));
  });
});
