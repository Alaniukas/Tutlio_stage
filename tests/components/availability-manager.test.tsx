import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AvailabilityManager from '@/components/AvailabilityManager';

const supabaseMock = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: supabaseMock.getUser },
    from: supabaseMock.from,
  },
}));

describe('AvailabilityManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
              order: async () => ({ data: [], error: null }),
            }),
          }),
        };
      }

      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it('keeps free-time settings independent from subjects', async () => {
    render(<AvailabilityManager />);

    await waitFor(() => {
      expect(screen.getByText('Pridėti pasikartojantį laiką')).toBeTruthy();
    });

    expect(screen.queryByText('Kuriems dalykams galioja šis laikas? (neprivaloma)')).toBeNull();
    expect(supabaseMock.from).not.toHaveBeenCalledWith('subjects');
  });
});
