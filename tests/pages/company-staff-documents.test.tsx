import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { uploadMock } = vi.hoisted(() => ({ uploadMock: vi.fn() }));

vi.mock('@/lib/apiHelpers', () => ({ authHeaders: async () => ({ 'Content-Type': 'application/json' }) }));
vi.mock('@/lib/contractStorage', () => ({ uploadContractFile: uploadMock }));
vi.mock('@/contexts/OrgAdminAccessContext', () => ({
  useOrgAdminAccess: () => ({ can: () => true }),
}));

import CompanyStaffDocuments from '../../src/pages/company/CompanyStaffDocuments';

const ORG_ID = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';

describe('school staff document upload form', () => {
  beforeEach(() => {
    uploadMock.mockReset();
    uploadMock.mockImplementation(async (path: string) => ({ path, error: null }));
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

    await screen.findByRole('button', { name: 'Sukurti du dokumentus' });
    fireEvent.change(screen.getByLabelText('Vardas, pavardė'), { target: { value: 'Vardas Pavardė' } });
    fireEvent.change(screen.getByLabelText('El. paštas'), { target: { value: 'employee@example.com' } });
    const file = new File(['%PDF-prepared'], 'agreement-and-annex.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText(/Paruoštas konfidencialumo susitarimas su priedu viename PDF/), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByLabelText('PDF yra ir susitarimas, ir konfidencialios informacijos sąrašo priedas'));
    fireEvent.click(screen.getByRole('button', { name: 'Sukurti du dokumentus' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(posts[0].action).toBe('create-bundle');
    expect(posts[0].preparedPdfPath).toContain(`${ORG_ID}/contracts/`);
    expect(posts[0].confidentialityId).not.toBe(posts[0].consentId);
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
    await screen.findByRole('button', { name: 'Sukurti du dokumentus' });
    fireEvent.change(screen.getByLabelText('Vardas, pavardė'), { target: { value: 'Vardas Pavardė' } });
    fireEvent.change(screen.getByLabelText('El. paštas'), { target: { value: 'employee@example.com' } });
    fireEvent.change(screen.getByLabelText(/Paruoštas konfidencialumo susitarimas/), {
      target: { files: [new File(['%PDF-prepared'], 'agreement.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(screen.getByLabelText('PDF yra ir susitarimas, ir konfidencialios informacijos sąrašo priedas'));
    fireEvent.click(screen.getByRole('button', { name: 'Sukurti du dokumentus' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'Sukurti du dokumentus' }));
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1].groupId).toBe(posts[0].groupId);
    expect(posts[1].confidentialityId).toBe(posts[0].confidentialityId);
    expect(posts[1].consentId).toBe(posts[0].consentId);
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });
});
