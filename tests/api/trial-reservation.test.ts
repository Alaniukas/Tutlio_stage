import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isTrialReservationFlowEnabled,
  getTrialReservationDeadlineHours,
  trialReservationExpiryIso,
  TRIAL_RESERVATION_DEFAULT_DEADLINE_HOURS,
  sendTrialReservationConfirmedNotifications,
  type ReservedTrialHold,
} from '../../api/_lib/trialReservation';

describe('isTrialReservationFlowEnabled', () => {
  it('is true only when the flag is exactly true', () => {
    expect(isTrialReservationFlowEnabled({ trial_reservation_flow: true })).toBe(true);
  });

  it('is false for missing, falsy, or non-object features', () => {
    expect(isTrialReservationFlowEnabled(null)).toBe(false);
    expect(isTrialReservationFlowEnabled(undefined)).toBe(false);
    expect(isTrialReservationFlowEnabled({})).toBe(false);
    expect(isTrialReservationFlowEnabled({ trial_reservation_flow: false })).toBe(false);
    expect(isTrialReservationFlowEnabled({ trial_reservation_flow: 'true' })).toBe(false);
    expect(isTrialReservationFlowEnabled([] as unknown as Record<string, unknown>)).toBe(false);
  });
});

describe('getTrialReservationDeadlineHours', () => {
  it('returns the configured number of hours when valid', () => {
    expect(getTrialReservationDeadlineHours({ trial_reservation_deadline_hours: 48 })).toBe(48);
    expect(getTrialReservationDeadlineHours({ trial_reservation_deadline_hours: '12' })).toBe(12);
  });

  it('falls back to the default for missing/invalid/out-of-range values', () => {
    expect(getTrialReservationDeadlineHours({})).toBe(TRIAL_RESERVATION_DEFAULT_DEADLINE_HOURS);
    expect(getTrialReservationDeadlineHours({ trial_reservation_deadline_hours: 0 })).toBe(TRIAL_RESERVATION_DEFAULT_DEADLINE_HOURS);
    expect(getTrialReservationDeadlineHours({ trial_reservation_deadline_hours: -5 })).toBe(TRIAL_RESERVATION_DEFAULT_DEADLINE_HOURS);
    expect(getTrialReservationDeadlineHours({ trial_reservation_deadline_hours: 99999 })).toBe(TRIAL_RESERVATION_DEFAULT_DEADLINE_HOURS);
    expect(getTrialReservationDeadlineHours({ trial_reservation_deadline_hours: 'abc' })).toBe(TRIAL_RESERVATION_DEFAULT_DEADLINE_HOURS);
  });
});

describe('trialReservationExpiryIso', () => {
  it('adds the given hours to the provided now', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(trialReservationExpiryIso(24, now)).toBe('2026-01-02T00:00:00.000Z');
    expect(trialReservationExpiryIso(1.5, now)).toBe('2026-01-01T01:30:00.000Z');
  });
});

// ── sendTrialReservationConfirmedNotifications ────────────────────────────────

function makeSupabase(tutorRows: any[], studentRows: any[]) {
  const calls: { table: string }[] = [];
  const from = vi.fn((table: string) => {
    calls.push({ table });
    const result = table === 'profiles' ? { data: tutorRows, error: null } : { data: studentRows, error: null };
    const builder: any = {
      select: () => builder,
      in: () => Promise.resolve(result),
    };
    return builder;
  });
  return { client: { from } as any, from };
}

describe('sendTrialReservationConfirmedNotifications', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const baseHold: ReservedTrialHold = {
    id: 'sess-1',
    tutor_id: 'tutor-1',
    student_id: 'student-1',
    start_time: '2026-02-01T10:00:00.000Z',
    topic: 'Bandomoji pamoka',
    meeting_link: 'https://meet.example/abc',
  };

  it('does nothing when there are no holds', async () => {
    const { client } = makeSupabase([], []);
    await sendTrialReservationConfirmedNotifications(client, { appUrl: 'https://app.test', holds: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('emails the org tutor and sends the student invite after payment', async () => {
    const { client } = makeSupabase(
      [{ id: 'tutor-1', full_name: 'Alice', email: 'alice@example.com', organization_id: 'org-1' }],
      [{ id: 'student-1', full_name: 'Sam', email: 'sam@example.com', invite_code: 'INV123', organization_id: 'org-1', payment_payer: 'student' }],
    );

    await sendTrialReservationConfirmedNotifications(client, {
      appUrl: 'https://app.test/',
      holds: [baseHold],
    });

    const types = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as any).body).type);
    expect(types).toContain('lesson_confirmed_tutor');
    expect(types).toContain('invite_email');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The send-email endpoint is called with the internal service key.
    const headers = (fetchMock.mock.calls[0][1] as any).headers;
    expect(headers['x-internal-key']).toBe('svc-key');

    // Trailing slash on appUrl is normalized in the invite booking URL.
    const inviteCall = fetchMock.mock.calls.find((c) => JSON.parse((c[1] as any).body).type === 'invite_email');
    const invitePayload = JSON.parse((inviteCall![1] as any).body);
    expect(invitePayload.data.bookingUrl).toBe('https://app.test/book/INV123');
  });

  it('skips the tutor email for a non-org (private) tutor but still invites the student', async () => {
    const { client } = makeSupabase(
      [{ id: 'tutor-1', full_name: 'Alice', email: 'alice@example.com', organization_id: null }],
      [{ id: 'student-1', full_name: 'Sam', email: 'sam@example.com', invite_code: 'INV123', payment_payer: 'student' }],
    );

    await sendTrialReservationConfirmedNotifications(client, { appUrl: 'https://app.test', holds: [baseHold] });

    const types = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as any).body).type);
    expect(types).not.toContain('lesson_confirmed_tutor');
    expect(types).toContain('invite_email');
  });
});
