import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionList } from '@/components/SessionList';
import type { Session } from '@/lib/session-stats';

const session: Session = {
  id: 'history',
  student_id: 'child',
  tutor_id: 'old-tutor',
  tutor: { full_name: 'Vakarė' },
  start_time: '2026-09-25T14:00:00.000Z',
  end_time: '2026-09-25T15:00:00.000Z',
  status: 'completed',
  price: 10,
};

describe('SessionList optional payment status', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each([
    [{ paid: true, payment_status: 'pending' }, 'Apmokėta'],
    [{ paid: false, payment_status: 'paid' }, 'Apmokėta'],
    [{ paid: false, payment_status: 'pending' }, 'Neapmokėta'],
    [{ paid: false, payment_status: 'confirmed' }, 'Rezervuota'],
    [{ paid: false, payment_status: 'pending', is_complimentary: true }, 'Nemokama'],
  ])('shows payment accurately for %j without replacing the lesson outcome', (payment, label) => {
    render(<SessionList sessions={[{ ...session, ...payment }]} groupBy="none" showPaymentStatus showTutor />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText('Įvyko')).toBeTruthy();
    expect(screen.getByText('Vakarė')).toBeTruthy();
    if (label !== 'Apmokėta') expect(screen.queryByText('Apmokėta')).toBeNull();
  });

  it('keeps payment badges hidden by default for other SessionList callers', () => {
    render(<SessionList sessions={[{ ...session, paid: true, payment_status: 'paid' }]} groupBy="none" />);
    expect(screen.getByText('Įvyko')).toBeTruthy();
    expect(screen.queryByText('Apmokėta')).toBeNull();
  });
});
