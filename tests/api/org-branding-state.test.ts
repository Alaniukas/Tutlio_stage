import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ org: null as any, error: null as any }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => {
  const chain: any = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: state.org, error: state.error }) };
  return chain;
} }) }));
import handler from '../../api/org-branding';
beforeEach(() => { state.org = { id: 'org', name: 'School', slug: 'test', features: {} }; state.error = null; });
async function request(query: any) {
  const res: any = { statusCode: 200, setHeader: vi.fn(), status(code: number) { this.statusCode = code; return this; }, json: vi.fn() };
  await handler({ method: 'GET', query } as any, res);
  return res;
}
describe('branding states', () => {
  it('returns a bounded cacheable disabled state for an existing organization', async () => {
    const res = await request({ id: 'org' });
    expect(res.statusCode).toBe(200);
    expect(res.json).toHaveBeenCalledWith({ enabled: false });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, s-maxage=60');
  });
  it('preserves a 404 for missing organizations and unbranded public login slugs', async () => {
    expect((await request({ slug: 'test' })).statusCode).toBe(404);
    state.org = null;
    expect((await request({ id: 'missing' })).statusCode).toBe(404);
  });
  it('still returns branded organization details and does not disguise database failures', async () => {
    state.org.features = { custom_branding: true };
    expect((await request({ id: 'org' })).json).toHaveBeenCalledWith(expect.objectContaining({ name: 'School' }));
    state.error = { message: 'Unavailable' };
    expect((await request({ id: 'org' })).statusCode).toBe(500);
  });
});
