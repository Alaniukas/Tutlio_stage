import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SchoolStaffConsent from '../../src/pages/SchoolStaffConsent';

afterEach(() => vi.unstubAllGlobals());

describe('employee staff-document form', () => {
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
    expect(screen.queryByLabelText('Asmens kodas')).toBeNull();
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
