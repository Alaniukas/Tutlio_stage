import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { InputHTMLAttributes } from 'react';
import type { ProKlaseTutorFinanceResponse } from '../../src/lib/proKlaseTutorFinance';
import { PRO_KLASE_QA_ORG_ID } from '../../src/lib/marketMoney';

const state = vi.hoisted(() => ({ orgId: 'b0a00000-7e57-4000-8000-000000000001', allowed: true,
  school: false, failList: false, failDetail: false, download: vi.fn() }));
vi.mock('@/contexts/OrgAdminAccessContext', () => {
  const access = () => ({ membership: { organizationId: state.orgId, userId: 'admin' }, can: () => state.allowed });
  return { useOrgAdminAccess: access, useOptionalOrgAdminAccess: access };
});
vi.mock('@/contexts/OrgEntityContext', () => ({ useOrgEntityType: () => state.school ? 'school' : 'company' }));
vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ Authorization: 'Bearer admin-qa' }) }));
vi.mock('@/lib/downloadInvoicesZip', () => ({ downloadInvoicePdfFile: state.download }));
vi.mock('@/components/ui/date-input', () => ({ DateInput: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} type="date" /> }));
vi.mock('@/components/ui/month-input', () => ({ MonthInput: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} type="month" /> }));
vi.mock('@/pages/company/CompanyFinance', () => ({ default: () => <p>Finance settings</p> }));
vi.mock('@/pages/company/CompanyInvoices', () => ({ default: () => null }));
vi.mock('@/pages/company/CompanyPayments', () => ({ default: () => null }));
vi.mock('@/pages/company/CompanyPlatformInvoices', () => ({ default: () => null }));
vi.mock('@/pages/company/CompanySchoolFinanceReport', () => ({ default: () => null }));

import CompanyTutorFinance from '../../src/pages/company/CompanyTutorFinance';
import CompanyFinanceHub from '../../src/pages/company/CompanyFinanceHub';

const tutorId = 'b0a00000-7e57-4000-8000-000000000003';
const otherTutorId = 'b0a00000-7e57-4000-8000-000000000004';
const tutors: ProKlaseTutorFinanceResponse['tutors'] = [{ id: tutorId, fullName: 'Jonas', email: 'jonas@example.test',
  payRateEur: 14, completedCount: 2, breakdown: { individualLessons: 1, individualEur: 14, trialLessons: 1, trialEur: 10,
    noShowLessons: 1, noShowEur: 6, adjustmentsEur: 0, totalEur: 30 },
  adjustments: [{ id: 'fine', tutor_id: tutorId, session_id: 'missed', type: 'penalty_missing_report',
    amount_eur: -10, reason: 'Ankstesnė bauda', created_at: '2026-10-04T12:00:00Z' },
    { id: 'correction', tutor_id: tutorId, session_id: null, type: 'penalty_manual', amount_eur: 10,
      reason: 'Domo korekcija', created_at: '2026-10-05T12:00:00Z' }] },
  { id: otherTutorId, fullName: 'Rasa', email: 'rasa@example.test', payRateEur: 18, completedCount: 1,
    breakdown: { individualLessons: 1, individualEur: 18, trialLessons: 0, trialEur: 0, noShowLessons: 0,
      noShowEur: 0, adjustmentsEur: 0, totalEur: 18 }, adjustments: [] }];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T12:00:00Z'));
  state.orgId = PRO_KLASE_QA_ORG_ID;
  state.allowed = true; state.school = false; state.failList = false; state.failDetail = false;
  state.download.mockReset().mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const selected = new URL(url, 'http://localhost').searchParams.get('tutorId');
    return { ok: !(selected ? state.failDetail : state.failList), json: async () => ({
      tutors: selected ? tutors.filter(tutor => tutor.id === selected) : tutors,
      invoices: selected ? [{ id: `invoice-${selected}`, invoice_number: selected === tutorId ? 'JON-1' : 'RAS-1',
        issue_date: '2026-10-06', period_start: '2026-10-01', period_end: '2026-10-05',
        total_amount: selected === tutorId ? 30 : 18, status: 'issued', organization_id: PRO_KLASE_QA_ORG_ID }] : [],
    }) };
  }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('administrator tutor finance view', () => {
  it('opens the chosen tutor’s pay, individual penalties, corrections and invoices', async () => {
    render(<CompanyTutorFinance />);
    fireEvent.click(await screen.findByRole('button', { name: /Jonas/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Jonas' });
    const detail = within(dialog);
    expect(await detail.findByText('Ankstesnė bauda')).toBeTruthy();
    expect(detail.getByText('Domo korekcija')).toBeTruthy();
    expect(detail.getByText('Rankinė korekcija')).toBeTruthy();
    expect(detail.getByText('€-10.00')).toBeTruthy();
    expect(detail.getByText('+€10.00')).toBeTruthy();
    expect(detail.getByText('Bandomosios pamokos (1)')).toBeTruthy();
    expect(detail.getByText('Neatvykę mokiniai (1)')).toBeTruthy();
    expect(detail.getByText('JON-1')).toBeTruthy();
    expect(detail.queryByText('RAS-1')).toBeNull();
    fireEvent.click(detail.getByRole('button', { name: /JON-1/ }));
    await waitFor(() => expect(state.download).toHaveBeenCalledWith(expect.objectContaining({ invoice_number: 'JON-1' }), { Authorization: 'Bearer admin-qa' }));
  });
  it('filters tutors by name or email', async () => {
    render(<CompanyTutorFinance />);
    await screen.findByRole('button', { name: /Jonas/ });
    fireEvent.change(screen.getByRole('textbox', { name: 'Ieškoti' }), { target: { value: 'rasa@' } });
    expect(screen.queryByRole('button', { name: /Jonas/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Rasa/ })).toBeTruthy();
  });
  it('hides old financial figures for an invalid period', async () => {
    render(<CompanyTutorFinance />);
    await screen.findByRole('button', { name: /Jonas/ });
    fireEvent.click(screen.getByRole('button', { name: 'Laikotarpis', exact: true }));
    fireEvent.change(screen.getByLabelText('Nuo'), { target: { value: '2026-11-01' } });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Jonas/ })).toBeNull();
  });
  it('does not show a partial or previous summary when detail access fails', async () => {
    render(<CompanyTutorFinance />);
    state.failDetail = true;
    fireEvent.click(await screen.findByRole('button', { name: /Jonas/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Jonas' });
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(within(dialog).queryByText('Ankstesnė bauda')).toBeNull();
    expect(within(dialog).queryByText('JON-1')).toBeNull();
  });
  it('reports load failures instead of showing zero earnings', async () => {
    state.failList = true;
    render(<CompanyTutorFinance />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('€0.00')).toBeNull();
  });
  it('opens the new tab from its URL for authorized Pro Klasė admins', async () => {
    render(<MemoryRouter initialEntries={['/company/finance?tab=tutor-finance']}><CompanyFinanceHub /></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Korepetitorių finansai', exact: true })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Jonas/ })).toBeTruthy();
    expect(screen.queryByText('Finance settings')).toBeNull();
  });
  it.each(['other-org', 'restricted', 'school'])('keeps the tab scoped to Pro Klasė and finance.view (%s)', context => {
    if (context === 'other-org') state.orgId = 'another-org';
    if (context === 'restricted') state.allowed = false;
    if (context === 'school') state.school = true;
    render(<MemoryRouter initialEntries={['/company/finance?tab=tutor-finance']}><CompanyFinanceHub /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Korepetitorių finansai', exact: true })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
