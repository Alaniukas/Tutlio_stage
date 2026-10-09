import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { uploadMock } = vi.hoisted(() => ({ uploadMock: vi.fn() }));

vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ 'Content-Type': 'application/json' }) }));
vi.mock('@/lib/contractStorage', () => ({ uploadContractFile: uploadMock }));
vi.mock('@/contexts/OrgAdminAccessContext', () => ({
  useOrgAdminAccess: () => ({ can: () => true }),
}));
vi.mock('@/components/ui/date-input', () => ({
  DateInput: ({ id, value, onChange }: { id?: string; value?: string; onChange?: (e: { target: { value: string } }) => void }) => (
    <input id={id} type="date" aria-label="Darbo sutarties data" value={value} onChange={onChange} />
  ),
}));

import CompanyStaffDocuments, { CompanyStaffDocumentsContent, type StaffDocument } from '../../src/pages/company/CompanyStaffDocuments';

const ORG_ID = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';

async function openNewEmployeeForm() {
  fireEvent.click(await screen.findByRole('button', { name: /Naujo darbuotojo dokumentai/i }));
}

describe('school staff document upload form', () => {
  beforeEach(() => {
    uploadMock.mockReset();
    uploadMock.mockImplementation(async (path: string) => ({ path, error: null }));
  });

  it('offers previews for preparing and sent documents with viewing permission alone', async () => {
    const base = {
      organization_id: ORG_ID, counterparty_name: 'Bandomasis Darbuotojas', counterparty_email: 'employee@example.com',
      staff_document_group_id: 'group-1', staff_employment_contract_number: 'DS-42', staff_employment_contract_date: '2026-09-22',
      staff_consent_answers: null, staff_revoked_at: null, signing_status: 'draft',
      sent_at: null, signed_at: null, pdf_url: null, signed_contract_url: null, staff_files_deleted_at: null,
    };
    const documents: StaffDocument[] = [
      { ...base, id: 'one', status: 'draft', staff_document_type: 'confidentiality' },
      { ...base, id: 'two', status: 'sent', staff_document_type: 'consent' },
    ];
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('action=preview')
      ? { preview: {
        documentType: url.includes('id=one') ? 'confidentiality' : 'consent', pdfUrl: null, isDraft: true,
        sections: url.includes('id=one')
          ? [{ kind: 'confidentiality', text: 'Visos susitarimo sąlygos.' }, { kind: 'annex', text: 'Visos priedo sąlygos.' }]
          : [{ kind: 'consent', text: 'Visas sutikimo tekstas.' }],
      } }
      : { organizationId: ORG_ID, documents },
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<CompanyStaffDocumentsContent canEdit={false} />);
    const previews = await screen.findAllByRole('button', { name: 'Peržiūrėti dokumentą' });
    expect(previews).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Atšaukti' })).toBeNull();
    fireEvent.click(previews[0]);
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Visos priedo sąlygos.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    fireEvent.click(previews[1]);
    expect(await screen.findByText('Visas sutikimo tekstas.')).toBeTruthy();
    expect(screen.queryByText('Visos priedo sąlygos.')).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/school-staff-documents',
      '/api/school-staff-documents?action=preview&id=one',
      '/api/school-staff-documents?action=preview&id=two',
    ]);
  });

  it('uploads one combined agreement/annex PDF and creates a separate consent record', async () => {
    const posts: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) {
        return { ok: true, json: async () => ({ organizationId: ORG_ID, documents: [] }) };
      }
      const body = JSON.parse(String(init.body));
      posts.push(body);
      return { ok: true, json: async () => ({ emailed: true }) };
    }));
    render(<CompanyStaffDocuments />);

    await openNewEmployeeForm();
    fireEvent.change(screen.getByLabelText('Vardas, pavardė'), { target: { value: 'Vardas Pavardė' } });
    fireEvent.change(screen.getByLabelText('El. paštas'), { target: { value: 'employee@example.com' } });
    const file = new File(['%PDF-prepared'], 'agreement-and-annex.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Savitas PDF vietoj Tutlio šablono/), {
      target: { files: [file] },
    });
    expect(screen.getByLabelText('Darbo sutarties Nr. (nebūtina)')).toBeTruthy();
    expect(screen.getByLabelText('Darbo sutarties data (nebūtina)')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('PDF yra ir susitarimas, ir konfidencialios informacijos sąrašo priedas'));
    fireEvent.click(screen.getByLabelText(/Įkeltame PDF jau įrašyti darbuotojo adresas ir asmens kodas/));
    fireEvent.click(screen.getByRole('button', { name: 'Sukurti du dokumentus' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(posts[0].action).toBe('create-bundle');
    expect(posts[0].preparedPdfPath).toContain(`${ORG_ID}/contracts/`);
    expect(posts[0].preparedDetailsConfirmed).toBe(true);
    expect(posts[0].confidentialityId).not.toBe(posts[0].consentId);
  });

  it('explains that bulk reminders include hidden records and uses correct count labels', () => {
    const base = {
      organization_id: ORG_ID,
      counterparty_name: 'Bandomasis Darbuotojas',
      counterparty_email: 'employee@example.com',
      staff_document_group_id: 'group-1',
      staff_employment_contract_number: null,
      staff_employment_contract_date: null,
      staff_consent_answers: null,
      staff_revoked_at: null,
      signing_status: 'draft',
      status: 'draft' as const,
      sent_at: null,
      signed_at: null,
      pdf_url: null,
      signed_contract_url: null,
      staff_files_deleted_at: null,
    };
    const documents: StaffDocument[] = [
      { ...base, id: 'one', staff_document_type: 'confidentiality' },
      { ...base, id: 'two', staff_document_type: 'consent' },
    ];
    render(<CompanyStaffDocumentsContent canEdit previewData={{ organizationId: ORG_ID, documents }} />);
    expect(screen.getByText(/1 darbuotojas · 2 dokumentai\./)).toBeTruthy();
    expect(screen.getByText(/nepriklausomai nuo paieškos ar filtro/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Priminti visiems nepasirašiusiems' })).toBeTruthy();
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    fireEvent.click(screen.getByRole('button', { name: 'Priminti visiems nepasirašiusiems' }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Paieška ir filtras šio veiksmo neriboja'));
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: 'Atšaukti' })[0]);
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('Kito dokumento būsena nesikeis'));
    expect(screen.queryByText('Atšaukta')).toBeNull();

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getAllByRole('button', { name: 'Atšaukti' })[0]);
    expect(screen.getByText('Atšaukta')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Atšaukti' })).toHaveLength(1);
  });

  it('retries the same pair without uploading the PDF a second time after a server error', async () => {
    const posts: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return { ok: true, json: async () => ({ organizationId: ORG_ID, documents: [] }) };
      posts.push(JSON.parse(String(init.body)));
      return posts.length === 1
        ? { ok: false, status: 500, json: async () => ({ error: 'Laikina klaida.' }) }
        : { ok: true, json: async () => ({ emailed: true }) };
    }));
    render(<CompanyStaffDocuments />);
    await openNewEmployeeForm();
    fireEvent.change(screen.getByLabelText('Vardas, pavardė'), { target: { value: 'Vardas Pavardė' } });
    fireEvent.change(screen.getByLabelText('El. paštas'), { target: { value: 'employee@example.com' } });
    fireEvent.change(screen.getByLabelText(/Savitas PDF vietoj Tutlio šablono/), {
      target: { files: [new File(['%PDF-prepared'], 'agreement.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByLabelText('PDF yra ir susitarimas, ir konfidencialios informacijos sąrašo priedas'));
    fireEvent.click(screen.getByLabelText(/Įkeltame PDF jau įrašyti darbuotojo adresas ir asmens kodas/));
    fireEvent.click(screen.getByRole('button', { name: 'Sukurti du dokumentus' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Sukurti du dokumentus' }));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1].groupId).toBe(posts[0].groupId);
    expect(posts[1].confidentialityId).toBe(posts[0].confidentialityId);
    expect(posts[1].consentId).toBe(posts[0].consentId);
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it('creates documents without address or personal code when the employee will fill them', async () => {
    const posts: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return { ok: true, json: async () => ({ organizationId: ORG_ID, documents: [] }) };
      posts.push(JSON.parse(String(init.body)));
      return { ok: true, json: async () => ({ emailed: true }) };
    }));
    render(<CompanyStaffDocuments />);
    await openNewEmployeeForm();
    fireEvent.change(screen.getByLabelText('Vardas, pavardė'), { target: { value: 'Alina Armonienė' } });
    fireEvent.change(screen.getByLabelText('El. paštas'), { target: { value: 'alina@example.com' } });
    fireEvent.change(screen.getByLabelText(/Darbo sutarties Nr/), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/Darbo sutarties data/), { target: { value: '2024-11-04' } });
    expect(screen.queryByLabelText(/Gyvenamosios vietos adresas/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sukurti du dokumentus' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      action: 'create-bundle',
      address: '',
      personalCode: '',
      employmentContractNumber: '10',
      employmentContractDate: '2024-11-04',
    });
  });

  it('sends administrator-entered address and personal code so they are filled into the generated agreement', async () => {
    const posts: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return { ok: true, json: async () => ({ organizationId: ORG_ID, documents: [] }) };
      posts.push(JSON.parse(String(init.body)));
      return { ok: true, json: async () => ({ emailed: true }) };
    }));
    render(<CompanyStaffDocuments />);
    await openNewEmployeeForm();
    fireEvent.change(screen.getByLabelText('Vardas, pavardė'), { target: { value: 'Vardas Pavardė' } });
    fireEvent.change(screen.getByLabelText('El. paštas'), { target: { value: 'employee@example.com' } });
    fireEvent.change(screen.getByLabelText(/Darbo sutarties Nr/), { target: { value: 'DS-42' } });
    fireEvent.change(screen.getByLabelText(/Darbo sutarties data/), { target: { value: '2026-09-22' } });
    fireEvent.click(screen.getByLabelText(/Įrašysiu dabar/));
    fireEvent.change(screen.getByLabelText(/Gyvenamosios vietos adresas/), { target: { value: 'Vilniaus g. 1, Vilnius' } });
    fireEvent.change(screen.getByLabelText(/Asmens kodas/), { target: { value: '39001010013' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sukurti du dokumentus' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      action: 'create-bundle',
      address: 'Vilniaus g. 1, Vilnius',
      personalCode: '39001010013',
      employmentContractNumber: 'DS-42',
    });
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
