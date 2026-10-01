import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), fetch: vi.fn(), filters: [] as any[] }));
vi.mock('@/lib/supabase', () => ({ supabase: {
  from: mocks.from, auth: { getUser: async () => ({ data: { user: { id: 'tutor-1' } } }) },
} }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({}) }));
vi.mock('@/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/useMarketMoney', () => ({ useMarketMoney: () => ({ fmt: (n: number) => `€${n}` }) }));

import SendInvoiceModal from '../../src/components/SendInvoiceModal';

describe('monthly send modal delivery failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.filters.length = 0;
    mocks.from.mockImplementation((table: string) => {
      const q: any = {
        select() { return q; }, eq() { return q; }, is() { return q; }, gte() { return q; }, order() { return q; },
        in(column: string, value: any) { mocks.filters.push([column, value]); return q; },
        lte(column: string) { mocks.filters.push([column]); return q; },
        then(resolve: any) { return Promise.resolve({ data: table === 'sessions' ? [{
          id: 'lesson-1', price: 30, start_time: '2026-09-15T10:00:00Z',
          students: { full_name: 'Vaikas', payer_name: 'Tėvas', payer_email: 'parent@example.test' }, subjects: { name: 'Matematika' },
        }] : [], error: null }).then(resolve); },
      };
      return q;
    });
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.fetch.mockResolvedValue({ ok: true, status: 207, json: async () => ({
      success: false, totalBatches: 1, error: 'Sąskaita sukurta, bet laiškas neišsiųstas. Siųskite dar kartą sąskaitų sąraše.',
    }) });
  });

  it('keeps the modal open on partial delivery and requires a fresh preview for retry', async () => {
    const onClose = vi.fn(), onSuccess = vi.fn();
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<SendInvoiceModal isOpen onClose={onClose} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole('button', { name: 'invoice.previewLessons' }));
    fireEvent.click(await screen.findByRole('button', { name: 'invoice.sendInvoiceCount' }));
    await screen.findByText('Sąskaita sukurta, bet laiškas neišsiųstas. Siųskite dar kartą sąskaitų sąraše.');
    expect(onClose).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'invoice.previewLessons' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'invoice.sendInvoiceCount' })).toBeNull();
    expect(mocks.filters).toContainEqual(['status', ['completed', 'no_show']]);
    expect(mocks.filters).toContainEqual(['end_time']);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(1));
  });
});
