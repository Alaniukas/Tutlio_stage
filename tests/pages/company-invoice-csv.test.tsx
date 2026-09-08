import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CompanyInvoices from '@/pages/company/CompanyInvoices';
import { invalidateCache } from '@/lib/dataCache';
import { downloadInvoiceCsv } from '@/lib/invoiceCsv';
vi.mock('@/lib/supabase', () => import('../browser/proklase/fixture'));
vi.mock('@/lib/invoiceCsv', () => ({ downloadInvoiceCsv: vi.fn() }));

describe('company accounting exports', () => {
  beforeEach(() => { invalidateCache(); vi.clearAllMocks(); });
  afterEach(cleanup);
  it('exports client and tutor invoices separately and respects the paid filter', async () => {
    render(<CompanyInvoices />);
    fireEvent.click(await screen.findByRole('button', { name: 'Klientų SF (CSV) (1)' }));
    expect(downloadInvoiceCsv).toHaveBeenLastCalledWith([expect.objectContaining({ invoice_number: 'PK-001' })], 'clients');
    fireEvent.click(screen.getByRole('button', { name: 'Korepetitorių SF (CSV) (1)' }));
    expect(downloadInvoiceCsv).toHaveBeenLastCalledWith([expect.objectContaining({ invoice_number: 'RT-001' })], 'tutors');
    const metadataReads = () => (window as any).__qa.calls.filter((c: any) => ['organization_admins', 'profiles', 'organizations', 'invoice_profiles'].includes(c.table) && c.read).length;
    const before = metadataReads();
    fireEvent.click(screen.getByRole('button', { name: 'Apmokėta' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Korepetitorių SF (CSV) (0)' }) as HTMLButtonElement).disabled).toBe(true));
    expect(metadataReads()).toBe(before);
  });
  it('includes invoices beyond the first database page', async () => {
    const db = (window as any).__qa.db;
    const original = db.invoices;
    db.invoices = Array.from({ length: 1001 }, (_, i) => ({ ...original[0], id: `inv-${i}`, invoice_number: `PK-${i}` }));
    try {
      render(<CompanyInvoices />);
      fireEvent.click(await screen.findByRole('button', { name: 'Klientų SF (CSV) (1001)' }, { timeout: 10000 }));
      expect(vi.mocked(downloadInvoiceCsv).mock.calls[0][0]).toHaveLength(1001);
    } finally { db.invoices = original; }
  }, 30_000);
});
