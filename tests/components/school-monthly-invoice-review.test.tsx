import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer mock' }) }));
vi.mock('../../src/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key, locale: 'lt' }) }));
const confirm = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../src/lib/confirmSessionOutcome', () => ({ confirmSessionOutcome: confirm }));
import SchoolMonthlyInvoiceDialog from '../../src/components/school/SchoolMonthlyInvoiceDialog';

const session = { id: 'lesson1', startTime: '2026-09-14T13:00:00Z', endTime: '2026-09-14T14:00:00Z',
  status: 'completed', statusConfirmedAt: '2026-09-14T14:05:00Z', subjectName: 'Math', tutorName: 'Teacher One',
  unitPriceEur: 12, included: true, reason: 'payable', exclusionReason: null, decisionId: null, alreadyInvoiced: false, canConfirm: true };

beforeEach(() => { vi.clearAllMocks(); });

function mount(fetcher: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetcher);
  return render(<SchoolMonthlyInvoiceDialog open onOpenChange={() => {}} organizationId="org1"
    students={[{ id: 'child1', fullName: 'Child One', payerEmail: 'parent@example.com' }]} />);
}

describe('school invoice attendance review', () => {
  it('records an explicit billing exclusion reason without changing attendance or sending an invoice', async () => {
    const calls: any[] = [];
    const fetcher = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body); calls.push(body);
      return { ok: true, json: async () => ({ sessions: [{ ...session,
        ...(body.action === 'billing-decision' ? { included: false, reason: 'excluded', exclusionReason: body.reason } : {}) }],
        payerEmail: 'parent@example.com', canEditBilling: true, canEditAttendance: true }) };
    });
    mount(fetcher);
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.review.open' }));
    await screen.findByText('Math');
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.review.exclude' }));
    const save = screen.getByRole('button', { name: 'school.invoice.review.save' });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('school.invoice.review.reasonLabel'), { target: { value: 'Earlier contract termination' } });
    fireEvent.click(save);
    await screen.findByText('Earlier contract termination');
    expect(calls[1]).toMatchObject({ action: 'billing-decision', sessionId: 'lesson1', excluded: true, reason: 'Earlier contract termination' });
    expect(confirm).not.toHaveBeenCalled();
    expect(calls.some((call) => call.action === 'send')).toBe(false);
  });

  it('uses the authenticated attendance correction helper and reloads the review', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ sessions: [session], payerEmail: 'parent@example.com', canEditBilling: true, canEditAttendance: true }) }));
    mount(fetcher);
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.review.open' }));
    await screen.findByText('Math');
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.review.absent' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledWith({ sessionId: 'lesson1', currentStatus: 'completed', status: 'no_show', startTime: session.startTime, endTime: session.endTime }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it('warns about a missing payer and hides mutation controls for a read-only seat', async () => {
    mount(vi.fn(async () => ({ ok: true, json: async () => ({ sessions: [session], payerEmail: '', canEditBilling: false, canEditAttendance: false }) })));
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.review.open' }));
    await screen.findByText('school.invoice.review.noPayer');
    expect(screen.queryByRole('button', { name: 'school.invoice.review.exclude' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'school.invoice.review.absent' })).toBeNull();
  });
});
