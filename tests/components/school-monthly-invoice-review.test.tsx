import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer mock' }) }));
vi.mock('../../src/lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key, locale: 'lt' }) }));
vi.mock('../../src/components/ui/month-filter-input', () => ({
  MonthFilterInput: ({ value, onChange, disabled }: any) => <input aria-label="Invoice month" type="month" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />,
}));
vi.mock('../../src/components/ui/date-input', () => ({
  DateInput: (props: any) => <input {...props} aria-label="Invoice due date" type="date" />,
}));
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
  it.each(['payable', 'outside_contract', 'unconfirmed'])('shows the attendance warning only for the unconfirmed billing reason (%s)', async (reason) => {
    mount(vi.fn(async () => ({ ok: true, json: async () => ({
      sessions: [{ ...session, statusConfirmedAt: null, reason, included: reason === 'payable' }],
      payerEmail: 'parent@example.com', canEditBilling: false, canEditAttendance: false,
    }) })));
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.review.open' }));
    await screen.findByText(`school.invoice.review.reason.${reason}`);
    expect(Boolean(screen.queryByText('school.invoice.review.unconfirmed'))).toBe(reason === 'unconfirmed');
  });

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

  it('groups payers in batch mode and can send one family or everyone', async () => {
    const calls: any[] = [];
    const payers = [
      {
        payerKey: 'akvile@example.com',
        payerName: 'Akvilė Adomaitytė',
        payerEmail: 'akvile@example.com',
        totalEur: 12,
        sendableStudentIds: ['kajus', 'etme'],
        students: [
          { studentId: 'kajus', fullName: 'Adomaitis Kajus', lessonCount: 1, totalEur: 6, reviewSessionIds: [], alreadyIssued: false, payerEmail: 'akvile@example.com', payerName: 'Akvilė', previewToken: 't1' },
          { studentId: 'etme', fullName: 'Vitkutė Etmė', lessonCount: 1, totalEur: 6, reviewSessionIds: [], alreadyIssued: false, payerEmail: 'akvile@example.com', payerName: 'Akvilė', previewToken: 't2' },
        ],
      },
      {
        payerKey: 'raimonda@example.com',
        payerName: 'Raimonda Širvytė',
        payerEmail: 'raimonda@example.com',
        totalEur: 6,
        sendableStudentIds: ['palaima'],
        students: [
          { studentId: 'palaima', fullName: 'Palaima Jokūbas', lessonCount: 1, totalEur: 6, reviewSessionIds: [], alreadyIssued: false, payerEmail: 'raimonda@example.com', payerName: 'Raimonda', previewToken: 't3' },
        ],
      },
    ];
    const fetcher = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      if (body.action === 'batch-preview') return { ok: true, json: async () => ({ payers }) };
      return { ok: true, json: async () => ({ sentCount: body.payerKey ? 2 : 3, skipped: [] }) };
    });
    vi.stubGlobal('fetch', fetcher);
    render(<SchoolMonthlyInvoiceDialog batch open onOpenChange={() => {}} organizationId="org1"
      students={[{ id: 'kajus', fullName: 'Adomaitis Kajus' }, { id: 'palaima', fullName: 'Palaima Jokūbas' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.preview' }));
    await screen.findByText('Raimonda Širvytė');
    expect(screen.getByText('Akvilė Adomaitytė')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'school.invoice.batch.sendPayer' })[0]);
    await waitFor(() => expect(calls.some((call) => call.action === 'send-batch' && call.payerKey === 'akvile@example.com')).toBe(true));
    expect(calls.find((call) => call.action === 'send-batch').studentIds).toEqual(['kajus', 'etme']);
  });
});

const batchGroup = {
  payerKey: 'parent@example.com', payerName: 'Parent One', payerEmail: 'parent@example.com', totalEur: 12,
  sendableStudentIds: ['child1'],
  students: [{ studentId: 'child1', fullName: 'Child One', lessonCount: 1, totalEur: 12,
    reviewSessionIds: [], alreadyIssued: false, payerEmail: 'parent@example.com', payerName: 'Parent One', previewToken: 'token-before' }],
};
const invoiceReview = { sessions: [session], payerEmail: 'parent@example.com', canEditBilling: true, canEditAttendance: true };
const invoicePreview = { ...invoiceReview, previewToken: 'child-preview', student: { id: 'child1', fullName: 'Child One' },
  periodLabel: 'August 2026', dueDate: '2026-10-12', lines: [], subtotalEur: 12, discountAmountEur: 0, totalEur: 12 };

function mountBatch(fetcher: ReturnType<typeof vi.fn>, onOpenChange = vi.fn()) {
  vi.stubGlobal('fetch', fetcher);
  render(<SchoolMonthlyInvoiceDialog batch open onOpenChange={onOpenChange} organizationId="org1"
    students={[{ id: 'child1', fullName: 'Child One', payerEmail: 'parent@example.com' }]} />);
  return onOpenChange;
}

describe('school invoice batch review navigation', () => {
  it('allows the accessible close action after scrolling a reviewed child without sending', async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body); calls.push(body.action);
      return { ok: true, json: async () => body.action === 'batch-preview' ? { payers: [batchGroup] } : invoiceReview };
    });
    const onOpenChange = mountBatch(fetcher);
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.preview' }));
    await screen.findByText('Parent One');
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.reviewChild' }));
    await screen.findByText('Math');
    screen.getByRole('dialog').scrollTop = 240;
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(calls).toEqual(['batch-preview', 'review']);
  });

  it('explains contract blockers accurately in a prepared preview and keeps sending disabled', async () => {
    const blockedReview = { ...invoiceReview, sessions: [{ ...session, included: false, reason: 'contract_review' }] };
    const fetcher = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      return { ok: true, json: async () => body.action === 'batch-preview' ? { payers: [batchGroup] }
        : body.action === 'preview' ? { ...invoicePreview, ...blockedReview, reviewSessionIds: ['lesson1'] } : blockedReview };
    });
    mountBatch(fetcher);
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.preview' }));
    await screen.findByText('Parent One');
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.reviewChild' }));
    await screen.findByText('school.invoice.review.reason.contract_review');
    fireEvent.click(screen.getByRole('button', { name: 'Formuoti peržiūrai' }));
    await screen.findByText('Peržiūra paruošta');
    expect(screen.getAllByText('school.invoice.review.reason.contract_review')).toHaveLength(2);
    expect(screen.queryByText(/neįtraukti, nes dar nėra patvirtinto įvykimo/)).toBeNull();
    expect((screen.getByRole('button', { name: 'Išsiųsti sąskaitą' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows contract review separately from attendance and explains already-issued and nonbillable children', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => ({ payers: [{ ...batchGroup, sendableStudentIds: [],
      students: [
        { ...batchGroup.students[0], reviewSessionIds: ['lesson1'], reviewReasons: ['contract_review'] },
        { ...batchGroup.students[0], studentId: 'issued', alreadyIssued: true, lessonCount: 0 },
        { ...batchGroup.students[0], studentId: 'free', lessonCount: 0 },
      ] }] }) }));
    mountBatch(fetcher);
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.preview' }));
    await screen.findByText('school.invoice.review.reason.contract_review');
    expect(screen.queryByText('school.invoice.batch.blocked')).toBeNull();
    expect(screen.getByText('school.invoice.review.reason.already_invoiced')).toBeTruthy();
    expect(screen.getByText('school.invoice.batch.empty')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'school.invoice.batch.sendAll' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('returns from child PDF preview to the same payer list, month, deadline and scroll position without sending', async () => {
    const calls: any[] = [];
    const fetcher = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body); calls.push(body);
      return { ok: true, json: async () => body.action === 'batch-preview' ? { payers: [batchGroup] }
        : body.action === 'preview' ? invoicePreview : invoiceReview };
    });
    const onOpenChange = mountBatch(fetcher);
    fireEvent.change(screen.getByLabelText('Invoice month'), { target: { value: '2026-08' } });
    fireEvent.change(screen.getByLabelText('Invoice due date'), { target: { value: '2026-10-12' } });
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.preview' }));
    await screen.findByText('Parent One');
    const dialog = screen.getByRole('dialog');
    dialog.scrollTop = 240;
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.reviewChild' }));
    await screen.findByText('Math');
    expect(dialog.scrollTop).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Formuoti peržiūrai' }));
    await screen.findByText('Peržiūra paruošta');
    fireEvent.click(screen.getByRole('button', { name: 'common.back: school.invoice.batch.title' }));
    await screen.findByText('Parent One');
    expect(dialog.scrollTop).toBe(240);
    expect((screen.getByLabelText('Invoice month') as HTMLInputElement).value).toBe('2026-08');
    expect((screen.getByLabelText('Invoice due date') as HTMLInputElement).value).toBe('2026-10-12');
    expect(calls.map((call) => call.action)).toEqual(['batch-preview', 'review', 'preview']);
    expect(calls.every((call) => call.periodStart === '2026-08-01' && call.periodEnd === '2026-08-31' && call.dueDate === '2026-10-12')).toBe(true);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('refreshes batch totals and tokens after attendance correction before allowing sends', async () => {
    const calls: any[] = [];
    let batchLoads = 0;
    const fetcher = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body); calls.push(body);
      if (body.action === 'batch-preview') {
        batchLoads += 1;
        return { ok: true, json: async () => ({ payers: [{ ...batchGroup,
          students: [{ ...batchGroup.students[0], previewToken: batchLoads > 1 ? 'token-after' : 'token-before' }] }] }) };
      }
      return { ok: true, json: async () => body.action === 'send-batch' ? { sentCount: 1, skippedCount: 0 } : invoiceReview };
    });
    mountBatch(fetcher);
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.preview' }));
    await screen.findByText('Parent One');
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.reviewChild' }));
    await screen.findByText('Math');
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.review.absent' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    await waitFor(() => expect((screen.getByRole('button', { name: 'common.back: school.invoice.batch.title' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'common.back: school.invoice.batch.title' }));
    await screen.findByText('Parent One');
    expect(batchLoads).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.sendAll' }));
    await waitFor(() => expect(calls.find((call) => call.action === 'send-batch')).toMatchObject({
      studentIds: ['child1'], previewTokens: { child1: 'token-after' },
    }));
  });

  it('keeps the review open and shows failures when sending all only succeeds partly', async () => {
    const fetcher = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      return { ok: true, json: async () => body.action === 'batch-preview' ? { payers: [batchGroup] }
        : { sentCount: 0, skippedCount: 1, skipped: [{ error: 'Attendance changed. Review again.' }] } };
    });
    const onOpenChange = mountBatch(fetcher);
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.preview' }));
    await screen.findByText('Parent One');
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.sendAll' }));
    await screen.findByRole('alert');
    expect(screen.getByText('Attendance changed. Review again.')).toBeTruthy();
    expect(screen.getByText('Parent One')).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('returns to the refreshed payer list after sending a reviewed child without closing the dialog', async () => {
    const calls: any[] = [];
    const fetcher = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body); calls.push(body);
      return { ok: true, json: async () => body.action === 'batch-preview' ? { payers: [batchGroup] }
        : body.action === 'review' ? invoiceReview : body.action === 'preview' ? invoicePreview
          : { invoiceNumber: 'INV-1', emailSent: true } };
    });
    const onOpenChange = mountBatch(fetcher);
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.preview' }));
    await screen.findByText('Parent One');
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.reviewChild' }));
    await screen.findByText('Math');
    fireEvent.click(screen.getByRole('button', { name: 'Formuoti peržiūrai' }));
    await screen.findByText('Peržiūra paruošta');
    fireEvent.click(screen.getByRole('button', { name: 'Išsiųsti sąskaitą' }));
    await screen.findByText('Parent One');
    expect(calls.map((call) => call.action)).toEqual(['batch-preview', 'review', 'preview', 'send', 'batch-preview']);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('requires a fresh batch after a billing decision response fails because the change may have persisted', async () => {
    let batchLoads = 0;
    const fetcher = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      if (body.action === 'billing-decision') return { ok: false, json: async () => ({ error: 'Review reload failed' }) };
      if (body.action === 'batch-preview') { batchLoads += 1; return { ok: true, json: async () => ({ payers: [batchGroup] }) }; }
      return { ok: true, json: async () => invoiceReview };
    });
    mountBatch(fetcher);
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.preview' }));
    await screen.findByText('Parent One');
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.reviewChild' }));
    await screen.findByText('Math');
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.review.exclude' }));
    fireEvent.change(screen.getByLabelText('school.invoice.review.reasonLabel'), { target: { value: 'Do not charge this lesson' } });
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.review.save' }));
    await screen.findByText('Review reload failed');
    fireEvent.click(screen.getByRole('button', { name: 'common.back: school.invoice.batch.title' }));
    await screen.findByText('Parent One');
    expect(batchLoads).toBe(2);
  });

  it('removes old sendable rows when a post-send refresh fails', async () => {
    let batchLoads = 0;
    const fetcher = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      if (body.action === 'batch-preview') {
        batchLoads += 1;
        return batchLoads === 1 ? { ok: true, json: async () => ({ payers: [batchGroup] }) }
          : { ok: false, json: async () => ({ error: 'Refresh unavailable' }) };
      }
      return { ok: true, json: async () => ({ sentCount: 1, skippedCount: 0 }) };
    });
    mountBatch(fetcher);
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.preview' }));
    await screen.findByText('Parent One');
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.sendPayer' }));
    await screen.findByText('Refresh unavailable');
    expect(screen.queryByText('Parent One')).toBeNull();
    expect((screen.getByRole('button', { name: 'school.invoice.batch.sendAll' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the skipped reason when every selected invoice becomes blocked and the API returns an error status', async () => {
    const fetcher = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      return body.action === 'batch-preview' ? { ok: true, json: async () => ({ payers: [batchGroup] }) }
        : { ok: false, json: async () => ({ sentCount: 0, skippedCount: 1, skipped: [{ studentId: 'child1', error: 'Contract details changed' }] }) };
    });
    const onOpenChange = mountBatch(fetcher);
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.preview' }));
    await screen.findByText('Parent One');
    fireEvent.click(screen.getByRole('button', { name: 'school.invoice.batch.sendAll' }));
    await screen.findByText('Contract details changed');
    expect((screen.getByRole('button', { name: 'school.invoice.batch.sendAll' }) as HTMLButtonElement).disabled).toBe(true);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
