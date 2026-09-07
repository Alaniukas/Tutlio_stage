import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PackagePaymentSuccess from '../../src/pages/PackagePaymentSuccess';

const fetchMock = vi.fn();

vi.mock('@/lib/i18n', () => ({
  useTranslation: () => ({
    locale: 'lt',
    t: (key: string, vars?: Record<string, string | number>) => {
      if (key === 'payment.lessonsRemaining') {
        return `Liko ${vars?.available} iš ${vars?.total} pamokų.`;
      }
      const map: Record<string, string> = {
        'payment.packageActivated': 'Paketas aktyvuotas!',
        'payment.paymentSuccess': 'Mokėjimas sėkmingas!',
        'payment.goToMyLessons': 'Eiti į mano pamokas',
        'common.login': 'Prisijungti',
        'payment.checkingPayment': 'Tikrinama…',
        'payment.waitingConfirmation': 'Laukiama',
        'payment.confirmFailed': 'Nepavyko',
        'payment.missingSessionId': 'Nėra session',
      };
      return map[key] || key;
    },
  }),
}));

vi.mock('@/lib/apiHelpers', () => ({
  authHeaders: async () => ({ 'Content-Type': 'application/json' }),
}));

describe('PackagePaymentSuccess', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('does not show remaining lesson count after a 1-lesson package', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        availableLessons: 0,
        totalLessons: 1,
        subjectName: 'MATEMATIKA',
      }),
    });

    render(
      <MemoryRouter initialEntries={['/package-success?session_id=cs_test']}>
        <PackagePaymentSuccess />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Paketas aktyvuotas! \(MATEMATIKA\)\./)).toBeTruthy();
    });
    expect(screen.queryByText(/Liko 0 iš 1/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Prisijungti' }).getAttribute('href')).toBe('/login');
  });
});
