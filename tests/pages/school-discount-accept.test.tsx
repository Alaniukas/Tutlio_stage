import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SchoolDiscountAccept, { type AgreementPreview } from '@/pages/SchoolDiscountAccept';

const preview: AgreementPreview = {
  status: 'pending',
  alreadyAccepted: false,
  agreementNumber: 'NPR-123',
  contractNumber: 'PP-123',
  contractAccepted: false,
  contractAcceptUrl: '/school-extra-lessons-accept?token=main-token',
  contractPdfUrl: 'https://example.test/main.pdf',
  pdfUrl: 'https://example.test/annex.pdf',
  schoolName: 'Testinė mokykla',
  studentName: 'Testinis mokinys',
  parentName: 'Testinis tėvas',
  activityLabel: 'Matematika',
  discountType: 'percent',
  discountValue: 25,
  validFrom: '2026-09-01',
  validUntil: '2027-06-30',
};

afterEach(() => vi.unstubAllGlobals());

describe('SchoolDiscountAccept before the main contract is accepted', () => {
  it('shows both documents before confirmation and keeps the main approval step after the annex is accepted', () => {
    render(<MemoryRouter><SchoolDiscountAccept previewFixture={preview} /></MemoryRouter>);

    expect(screen.getByRole('link', { name: 'Atidaryti užsiėmimų sutarties PDF' }).getAttribute('href')).toBe(preview.contractPdfUrl);
    expect(screen.getByRole('link', { name: 'Atidaryti nuolaidos priedo PDF' }).getAttribute('href')).toBe(preview.pdfUrl);
    expect(screen.getByRole('link', { name: 'Peržiūrėti ir patvirtinti užsiėmimų sutartį' }).getAttribute('href')).toBe(preview.contractAcceptUrl);

    fireEvent.click(screen.getByRole('button', { name: 'Sutinku' }));

    expect(screen.getByRole('heading', { name: 'Nuolaida patvirtinta' })).toBeTruthy();
    expect(screen.getByText('Nuolaidos priedas patvirtintas. Kad nuolaida būtų taikoma, taip pat patvirtinkite užsiėmimų sutartį.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Peržiūrėti ir patvirtinti užsiėmimų sutartį' })).toBeTruthy();
    expect(screen.queryByText(/nieko daugiau daryti nereikia/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sutinku' })).toBeNull();
  });

  it('uses the main contract token and agreement ID for linked preview and acceptance', async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => ({
      ok: true,
      json: async () => init?.method === 'POST'
        ? { ...preview, status: 'accepted', alreadyAccepted: true }
        : preview,
    }));
    vi.stubGlobal('fetch', fetcher);
    render(
      <MemoryRouter initialEntries={['/school-discount-accept?contractToken=main-token&agreementId=annex-id']}>
        <SchoolDiscountAccept />
      </MemoryRouter>,
    );
    await screen.findByRole('button', { name: 'Sutinku' });
    const url = new URL(fetcher.mock.calls[0][0], 'https://example.test');
    expect(url.searchParams.get('contractToken')).toBe('main-token');
    expect(url.searchParams.get('agreementId')).toBe('annex-id');
    expect(url.searchParams.has('token')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Sutinku' }));
    await screen.findByRole('heading', { name: 'Nuolaida patvirtinta' });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({ contractToken: 'main-token', agreementId: 'annex-id' });
  });

  it('preserves direct discount token authorization', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => preview }));
    vi.stubGlobal('fetch', fetcher);
    render(<MemoryRouter initialEntries={['/school-discount-accept?token=annex-token']}><SchoolDiscountAccept /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Sutinku' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(fetcher.mock.calls[0][0]).toBe('/api/school-discount-accept?token=annex-token');
    expect(JSON.parse(String((fetcher.mock.calls[1] as unknown as [string, RequestInit])[1].body))).toEqual({ token: 'annex-token' });
  });

  it('clears the previous annex when a different capability fails to load', async () => {
    const fetcher = vi.fn(async (url: string) => ({
      ok: !url.includes('invalid-token'),
      json: async () => url.includes('invalid-token') ? { error: 'Nuolaidos pasiūlymas nerastas.' } : preview,
    }));
    vi.stubGlobal('fetch', fetcher);
    function SwitchCapability() {
      const navigate = useNavigate();
      return <button onClick={() => navigate('/school-discount-accept?token=invalid-token')}>Kita nuoroda</button>;
    }
    render(<MemoryRouter initialEntries={['/school-discount-accept?token=annex-token']}>
      <SwitchCapability /><SchoolDiscountAccept />
    </MemoryRouter>);
    await screen.findByRole('button', { name: 'Sutinku' });
    fireEvent.click(screen.getByRole('button', { name: 'Kita nuoroda' }));
    await screen.findByRole('heading', { name: 'Nuolaidos patvirtinti nepavyko' });
    expect(screen.queryByText('NPR-123')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sutinku' })).toBeNull();
  });

  it('treats older fixtures as an already accepted main contract', () => {
    const { contractAccepted: _accepted, contractAcceptUrl: _url, contractPdfUrl: _pdf, ...legacy } = preview;
    render(<MemoryRouter><SchoolDiscountAccept previewFixture={{ ...legacy, status: 'accepted', alreadyAccepted: true }} /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: 'Peržiūrėti ir patvirtinti užsiėmimų sutartį' })).toBeNull();
    expect(screen.queryByText(/taip pat patvirtinkite užsiėmimų sutartį/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Atsisiųsti sutarties priedą' })).toBeTruthy();
  });
});
