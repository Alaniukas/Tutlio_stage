import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SchoolStaffConsent from '../../src/pages/SchoolStaffConsent';

afterEach(() => vi.unstubAllGlobals());

describe('employee staff-document form', () => {
  it('lets employees read the agreement, annex and full consent before choosing, and after submission', async () => {
    const posts: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      posts.push(JSON.parse(String(init?.body)));
      return { ok: true, json: async () => ({ ok: true }) };
    }));
    vi.stubGlobal('scrollTo', vi.fn());
    render(<MemoryRouter><SchoolStaffConsent previewInfo={{
      employeeName: 'Vardas Pavardė', schoolName: 'Laisvi vaikai',
      documentPreviews: [{
        documentType: 'confidentiality', pdfUrl: null, isDraft: true,
        sections: [{ kind: 'confidentiality', text: 'Visos susitarimo sąlygos.' }, { kind: 'annex', text: 'Visos priedo sąlygos.' }],
      }, {
        documentType: 'consent', pdfUrl: null, isDraft: true,
        sections: [{ kind: 'consent', text: 'Visas sutikimo tekstas.\n\n<script>untrusted()</script>' }],
      }],
    }} /></MemoryRouter>);
    const agreement = screen.getByText('Konfidencialumo susitarimas su priedu', { selector: 'summary' });
    fireEvent.click(agreement);
    expect(screen.getByText('Visos susitarimo sąlygos.')).toBeTruthy();
    expect(screen.getByText('Visos priedo sąlygos.')).toBeTruthy();
    fireEvent.click(screen.getByText('Asmens duomenų tvarkymo sutikimas', { selector: 'summary' }));
    expect(screen.getByText('Visas sutikimo tekstas.')).toBeTruthy();
    expect(screen.getByText('<script>untrusted()</script>')).toBeTruthy();
    expect(document.querySelector('script')).toBeNull();
    expect(screen.getByText('Pažymėta 0 iš 10')).toBeTruthy();
    expect(posts).toHaveLength(0);
    for (const choice of screen.getAllByLabelText('Nesutinku')) fireEvent.click(choice);
    fireEvent.click(screen.getByRole('button', { name: 'Išsaugoti pasirinkimus' }));
    expect(await screen.findByText(/Jūsų pateikta forma išsaugota/)).toBeTruthy();
    expect(screen.getByText('Visos priedo sąlygos.')).toBeTruthy();
    expect(screen.getByText('Visas sutikimo tekstas.')).toBeTruthy();
  });

  it('provides the actual PDF and a separate-window link when one is ready', () => {
    render(<MemoryRouter><SchoolStaffConsent previewInfo={{ documentPreviews: [{
      documentType: 'confidentiality', pdfUrl: 'https://storage.test/custom-agreement.pdf', isDraft: false, sections: [],
    }] }} /></MemoryRouter>);
    fireEvent.click(screen.getByText('Konfidencialumo susitarimas su priedu', { selector: 'summary' }));
    expect(screen.getByTitle('Konfidencialumo susitarimas su priedu').getAttribute('src')).toBe('https://storage.test/custom-agreement.pdf');
    expect(screen.getByRole('link', { name: 'Atidaryti PDF' }).getAttribute('href')).toBe('https://storage.test/custom-agreement.pdf');
  });

  it('submits employee details with the ten consent choices from the emailed link', async () => {
    const posts: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return {
        ok: true, json: async () => ({ employeeName: 'Vardas Pavardė', schoolName: 'Mokykla', needsPersonalDetails: true }),
      };
      posts.push(JSON.parse(String(init.body)));
      return { ok: true, json: async () => ({ ok: true }) };
    }));
    vi.stubGlobal('scrollTo', vi.fn());

    render(<MemoryRouter initialEntries={['/school-staff-consent?token=secret']}>
      <Routes><Route path="/school-staff-consent" element={<SchoolStaffConsent />} /></Routes>
    </MemoryRouter>);

    fireEvent.change(await screen.findByLabelText('Gyvenamosios vietos adresas'), {
      target: { value: 'Vilniaus g. 1, Vilnius' },
    });
    fireEvent.change(screen.getByLabelText('Asmens kodas'), { target: { value: '39001010013' } });
    for (const choice of screen.getAllByLabelText('Sutinku')) fireEvent.click(choice);
    fireEvent.click(screen.getByRole('button', { name: 'Pateikti duomenis ir pasirinkimus' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      token: 'secret', answers: Array(10).fill('yes'),
      address: 'Vilniaus g. 1, Vilnius', personalCode: '39001010013',
    });
    expect(await screen.findByText(/Jūsų pateikta forma išsaugota/)).toBeTruthy();
  });

  it('does not re-ask for address and personal code when the school already entered them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        employeeName: 'Vardas Pavardė',
        schoolName: 'Mokykla',
        needsPersonalDetails: false,
        detailsHeldBySchool: true,
      }),
    })));

    render(<MemoryRouter initialEntries={['/school-staff-consent?token=secret']}>
      <Routes><Route path="/school-staff-consent" element={<SchoolStaffConsent />} /></Routes>
    </MemoryRouter>);

    expect(await screen.findByText(/Mokykla jau įrašė gyvenamosios vietos adresą/)).toBeTruthy();
    expect(screen.queryByLabelText('Gyvenamosios vietos adresas')).toBeNull();
    expect(screen.queryByLabelText('Asmens kodas')).toBeNull();
    expect((screen.getByRole('button', { name: 'Išsaugoti pasirinkimus' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
