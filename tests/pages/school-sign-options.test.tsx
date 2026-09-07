import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SchoolSign from '@/pages/SchoolSign';

describe('SchoolSign parent page — signing options', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows both the GoSign path and the Smart-ID (Dokobit) upload path when ready', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          studentName: 'Aivaras',
          schoolName: 'VšĮ Test mokykla',
          status: 'pending',
          alreadySigned: false,
          expired: false,
          ready: true,
          pdfUrl: 'https://storage.test/contract.pdf',
        }),
      })),
    );

    render(
      <MemoryRouter initialEntries={['/school-sign?token=tok-1']}>
        <SchoolSign />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Pasirinkite pasirašymo būdą.', { exact: false })).toBeTruthy());
    expect(screen.getByText('1. Mobiliuoju parašu, LT ID arba kortele')).toBeTruthy();
    expect(screen.getByText('2. Per Dokobit (Smart-ID ar mobilusis parašas)')).toBeTruthy();
    expect(screen.getByText('Pasirašyti el. parašu')).toBeTruthy();
    expect(screen.getByText('Įkelti pasirašytą PDF')).toBeTruthy();

    const download = screen.getByText('Atsisiųskite sutartį') as HTMLAnchorElement;
    expect(download.closest('a')?.getAttribute('href')).toBe('https://storage.test/contract.pdf');
  });
});
