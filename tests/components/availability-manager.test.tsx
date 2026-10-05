import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AvailabilityManager from '@/components/AvailabilityManager';

const supabaseMock = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  sessionRange: vi.fn(),
}));

const day = '2026-11-11';
const at = (time: string) => `${day}T${time}:00`;
const slot = {
  id: 'one-time', day_of_week: null, is_recurring: false, specific_date: day,
  start_time: '18:00:00', end_time: '19:00:00', end_date: null,
  subject_ids: [], public_bookable: true,
};
let availability: Record<string, unknown>[];
let sessions: Record<string, unknown>[];
let sessionsError: { message: string } | null;
let breakMinutes: number;

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: supabaseMock.getUser },
    from: supabaseMock.from,
  },
}));

describe('AvailabilityManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    availability = [];
    sessions = [];
    sessionsError = null;
    breakMinutes = 0;
    supabaseMock.sessionRange.mockImplementation(async (from: number, to: number) => ({
      data: sessions.slice(from, to + 1), error: sessionsError,
    }));
    supabaseMock.getUser.mockResolvedValue({ data: { user: { id: 'tutor-1' } } });
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  stripe_account_id: 'acct_test',
                  organization_id: null,
                  subscription_plan: 'pro',
                  manual_subscription_exempt: false,
                  enable_manual_student_payments: false,
                  break_between_lessons: breakMinutes,
                },
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === 'availability') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: availability, error: null }),
            }),
          }),
        };
      }

      if (table === 'sessions') {
        const query = {
          select: () => query, eq: () => query, neq: () => query,
          lt: () => query, gt: () => query, order: () => query,
          range: supabaseMock.sessionRange,
        };
        return query;
      }

      throw new Error(`Unexpected table: ${table}`);
    });
  });

  afterEach(cleanup);

  it('keeps free-time settings independent from subjects', async () => {
    render(<AvailabilityManager />);

    await waitFor(() => {
      expect(screen.getByText('Pridėti pasikartojantį laiką')).toBeTruthy();
    });

    expect(screen.queryByText('Kuriems dalykams galioja šis laikas? (neprivaloma)')).toBeNull();
    expect(supabaseMock.from).not.toHaveBeenCalledWith('subjects');
  });

  it('hides a booked one-time interval without removing its source availability', async () => {
    availability = [slot];
    sessions = [{ id: 'lesson', start_time: at('18:00'), end_time: at('19:00'), status: 'active' }];
    render(<AvailabilityManager prefill={{ specificDate: day }} />);

    expect(await screen.findByText('Nėra nustatytų dienų.')).toBeTruthy();
    expect(screen.queryByText('18:00 – 19:00')).toBeNull();
    expect(availability).toEqual([slot]);
  });

  it('shows the two remaining free intervals around a booking', async () => {
    availability = [{ ...slot, start_time: '17:00:00', end_time: '20:00:00' }];
    sessions = [{ id: 'lesson', start_time: at('18:00'), end_time: at('19:00'), status: 'active' }];
    render(<AvailabilityManager prefill={{ specificDate: day }} />);

    expect(await screen.findByText('17:00 – 18:00')).toBeTruthy();
    expect(screen.getByText('19:00 – 20:00')).toBeTruthy();
    expect(screen.queryByText('17:00 – 20:00')).toBeNull();
  });

  it('shows availability again after the lesson is cancelled', async () => {
    availability = [slot];
    sessions = [{ id: 'lesson', start_time: at('18:00'), end_time: at('19:00'), status: 'cancelled' }];
    render(<AvailabilityManager prefill={{ specificDate: day }} />);

    expect(await screen.findByText('18:00 – 19:00')).toBeTruthy();
  });

  it('excludes the tutor break before and after booked lessons', async () => {
    availability = [{ ...slot, start_time: '17:00:00', end_time: '20:00:00' }];
    breakMinutes = 15;
    sessions = [{ id: 'lesson', start_time: at('18:00'), end_time: at('19:00'), status: 'active' }];
    render(<AvailabilityManager prefill={{ specificDate: day }} />);

    expect(await screen.findByText('17:00 – 17:45')).toBeTruthy();
    expect(screen.getByText('19:15 – 20:00')).toBeTruthy();
  });

  it('loads every page of bookings before advertising free time', async () => {
    availability = [slot];
    sessions = Array.from({ length: 500 }, (_, i) => ({
      id: `earlier-${i}`, start_time: at('10:00'), end_time: at('11:00'), status: 'active',
    }));
    sessions.push({ id: 'booking-on-next-page', start_time: at('18:00'), end_time: at('19:00'), status: 'active' });
    render(<AvailabilityManager prefill={{ specificDate: day }} />);

    expect(await screen.findByText('Nėra nustatytų dienų.')).toBeTruthy();
    expect(supabaseMock.sessionRange.mock.calls).toEqual([[0, 499], [500, 999]]);
  });

  it('does not advertise free time when bookings cannot be loaded', async () => {
    availability = [slot];
    sessionsError = { message: 'Booking lookup failed' };
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AvailabilityManager prefill={{ specificDate: day }} />);

    expect(await screen.findByText('Klaida.')).toBeTruthy();
    expect(screen.queryByText('18:00 – 19:00')).toBeNull();
    errorLog.mockRestore();
  });
});
