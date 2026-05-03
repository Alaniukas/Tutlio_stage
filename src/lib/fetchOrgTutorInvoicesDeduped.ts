import { authHeaders } from '@/lib/apiHelpers';

export type OrgTutorInvoicesJson = { invoices: unknown[]; periodInvoices?: unknown[] };

export type OrgTutorInvoicesFetchResult =
  | { ok: true; data: OrgTutorInvoicesJson }
  | { ok: false; status: number; data: Record<string, unknown> };

const inflightByQuery = new Map<string, Promise<OrgTutorInvoicesFetchResult>>();

/**
 * Vienas paralelinis skrydis per tu pačią užklausą (StrictMode, keli komponentai).
 * queryString pvz. `periodStart=2026-01-01&periodEnd=2026-01-31` be pradinio `?`.
 */
export function fetchOrgTutorInvoicesDeduped(queryString: string = ''): Promise<OrgTutorInvoicesFetchResult> {
  const key = queryString.trim();
  const hit = inflightByQuery.get(key);
  if (hit) return hit;

  const promise = (async (): Promise<OrgTutorInvoicesFetchResult> => {
    const url =
      key.length > 0 ? `/api/org-tutor-invoices?${key}` : '/api/org-tutor-invoices';
    const response = await fetch(url, { method: 'GET', headers: await authHeaders() });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      return { ok: false, status: response.status, data };
    }

    const invoices = Array.isArray(data.invoices) ? data.invoices : [];
    const periodInvoices = Array.isArray(data.periodInvoices) ? data.periodInvoices : invoices;

    return {
      ok: true,
      data: { invoices, periodInvoices },
    };
  })().finally(() => {
    inflightByQuery.delete(key);
  });

  inflightByQuery.set(key, promise);
  return promise;
}
