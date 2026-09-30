import { describe, expect, it } from 'vitest';
import {
  buildRecurringSessionCounts,
  getCalendarSessionEventStyle,
  isMvRecurringScheduledLesson,
  MOKSLO_VAISIAI_CALENDAR_COLORS,
} from '@/lib/calendarSessionEventStyle';
import { effectiveSessionOutcome } from '@/lib/sessionStatusConfirmation';

describe('calendar colors for manually confirmed organization outcomes', () => {
  const past = new Date(Date.now() - 60 * 60 * 1000);
  const styleFor = (status: string, confirmedAt: string | null) => getCalendarSessionEventStyle({
    status: effectiveSessionOutcome({ status, status_confirmed_at: confirmedAt }, true),
    endAt: past, paid: true, isOrgTutor: true,
  });

  it('keeps an ended paid lesson pending until a teacher or administrator confirms it', () => {
    expect(styleFor('completed', null).backgroundColor).toBe('#ca8a04');
    expect(styleFor('completed', past.toISOString()).backgroundColor).toBe('#10b981');
  });

  it('shows an unstamped no-show as pending and retains the confirmed no-show color', () => {
    expect(styleFor('no_show', null).backgroundColor).toBe('#ca8a04');
    expect(styleFor('no_show', past.toISOString()).backgroundColor).toBe('#fda4af');
  });
});

describe('getCalendarSessionEventStyle (Mokslo vaisiai)', () => {
  const future = new Date(Date.now() + 60 * 60 * 1000);
  const past = new Date(Date.now() - 60 * 60 * 1000);

  it('uses gray for trial lessons', () => {
    const style = getCalendarSessionEventStyle({
      status: 'active',
      endAt: future,
      isTrial: true,
      useMoksloVaisiaiPalette: true,
    });
    expect(style.backgroundColor).toBe(MOKSLO_VAISIAI_CALENDAR_COLORS.trialBackground);
  });

  it('uses yellow for active recurring scheduled lessons (3+ in series)', () => {
    const recurringId = 'rec-1';
    const counts = buildRecurringSessionCounts([
      { recurring_session_id: recurringId },
      { recurring_session_id: recurringId },
      { recurring_session_id: recurringId },
    ]);
    const isRecurringScheduled = isMvRecurringScheduledLesson({
      recurringSessionId: recurringId,
      status: 'active',
      endAt: future,
      recurringCounts: counts,
    });
    const style = getCalendarSessionEventStyle({
      status: 'active',
      endAt: future,
      isRecurringScheduled,
      useMoksloVaisiaiPalette: true,
      isOrgTutor: true,
    });
    expect(style.backgroundColor).toBe(MOKSLO_VAISIAI_CALENDAR_COLORS.recurringBackground);
  });

  it('does not treat two-lesson series as recurring scheduled', () => {
    const recurringId = 'rec-2';
    const counts = buildRecurringSessionCounts([
      { recurring_session_id: recurringId },
      { recurring_session_id: recurringId },
    ]);
    expect(
      isMvRecurringScheduledLesson({
        recurringSessionId: recurringId,
        status: 'active',
        endAt: future,
        recurringCounts: counts,
      }),
    ).toBe(false);
  });

  it('uses default green for completed lessons (not yellow)', () => {
    const style = getCalendarSessionEventStyle({
      status: 'completed',
      endAt: past,
      paid: true,
      useMoksloVaisiaiPalette: true,
      isOrgTutor: true,
    });
    expect(style.backgroundColor).toBe('#10b981');
  });

  it('does not color an unpaid confirmed monthly lesson as paid', () => {
    const style = getCalendarSessionEventStyle({
      status: 'completed',
      endAt: past,
      paid: false,
      payment_status: 'confirmed',
    });
    expect(style.backgroundColor).toBe('#ca8a04');
  });

  it('uses blue vs orange for MV admin planned paid vs unpaid', () => {
    const paid = getCalendarSessionEventStyle({
      status: 'active',
      endAt: future,
      paid: true,
      useMoksloVaisiaiPalette: true,
      mvDistinguishPlannedPayment: true,
    });
    const unpaid = getCalendarSessionEventStyle({
      status: 'active',
      endAt: future,
      paid: false,
      useMoksloVaisiaiPalette: true,
      mvDistinguishPlannedPayment: true,
    });
    expect(paid.backgroundColor).toBe(MOKSLO_VAISIAI_CALENDAR_COLORS.plannedPaidBackground);
    expect(unpaid.backgroundColor).toBe(MOKSLO_VAISIAI_CALENDAR_COLORS.plannedUnpaidBackground);
  });

  it('keeps cancelled lessons red', () => {
    const style = getCalendarSessionEventStyle({
      status: 'cancelled',
      endAt: future,
      useMoksloVaisiaiPalette: true,
    });
    expect(style.backgroundColor).toBe('#ef4444');
  });
});
