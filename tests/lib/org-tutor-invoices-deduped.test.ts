import { afterEach, describe, expect, it, vi } from 'vitest';
const state=vi.hoisted(() => ({ token:'A' }));
vi.mock('@/lib/apiHelpers',() => ({ authHeaders:async () => ({ Authorization:`Bearer ${state.token}` }) }));
import { fetchOrgTutorInvoicesDeduped } from '@/lib/fetchOrgTutorInvoicesDeduped';
afterEach(() => vi.unstubAllGlobals());
describe('private invoice request deduplication',() => {
  it('never shares an in-flight invoice response across account changes',async () => {
    const pending: Array<(v: unknown) => void>=[];
    const fetch=vi.fn(() => new Promise(resolve => pending.push(resolve)));
    vi.stubGlobal('fetch',fetch);
    state.token='A'; const first=fetchOrgTutorInvoicesDeduped(); await Promise.resolve();
    state.token='B'; const second=fetchOrgTutorInvoicesDeduped(); await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map((call: any) => call[1].headers.Authorization)).toEqual(['Bearer A','Bearer B']);
    pending[0]({ ok:true,json:async () => ({ invoices:['A-invoice'] }) });
    pending[1]({ ok:true,json:async () => ({ invoices:['B-invoice'] }) });
    expect(await first).toMatchObject({ data:{ invoices:['A-invoice'] } });
    expect(await second).toMatchObject({ data:{ invoices:['B-invoice'] } });
  });
  it('still deduplicates concurrent requests for the same session and query',async () => {
    let complete!: (v: unknown) => void;
    const fetch=vi.fn(() => new Promise(resolve => { complete=resolve; }));
    vi.stubGlobal('fetch',fetch); state.token='same';
    const a=fetchOrgTutorInvoicesDeduped('periodStart=2026-09-01');
    const b=fetchOrgTutorInvoicesDeduped('periodStart=2026-09-01');
    await Promise.resolve();
    expect(fetch).toHaveBeenCalledOnce();
    complete({ ok:true,json:async () => ({ invoices:[] }) });
    expect(await a).toEqual(await b);
  });
});
