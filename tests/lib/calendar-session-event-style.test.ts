import { describe, expect, it } from 'vitest';
import {
  getCalendarSessionEventStyle,
  MOKSLO_VAISIAI_CALENDAR_COLORS,
} from '@/lib/calendarSessionEventStyle';

const ENDED_AT = new Date('2020-01-01T10:00:00.000Z');

describe('Mokslo vaisiai calendar session colors', () => {
  it('renders trial lessons light gray with dark text', () => {
    const style = getCalendarSessionEventStyle({
      status: 'active',
      endAt: ENDED_AT,
      isTrial: true,
      isOrgTutor: true,
      useMoksloVaisiaiPalette: true,
    });

    expect(style.backgroundColor).toBe(MOKSLO_VAISIAI_CALENDAR_COLORS.trialBackground);
    expect(style.borderColor).toBe(MOKSLO_VAISIAI_CALENDAR_COLORS.trialBorder);
    expect(style.color).toBe(MOKSLO_VAISIAI_CALENDAR_COLORS.trialText);
  });

  it.each(['completed', 'active'])('renders an ended %s lesson bright yellow', (status) => {
    const style = getCalendarSessionEventStyle({
      status,
      endAt: ENDED_AT,
      isOrgTutor: true,
      useMoksloVaisiaiPalette: true,
    });

    expect(style.backgroundColor).toBe(MOKSLO_VAISIAI_CALENDAR_COLORS.completedBackground);
    expect(style.color).toBe(MOKSLO_VAISIAI_CALENDAR_COLORS.completedText);
  });

  it('keeps the existing palette for other organizations', () => {
    const trial = getCalendarSessionEventStyle({
      status: 'active',
      endAt: ENDED_AT,
      isTrial: true,
      isOrgTutor: true,
    });
    const completed = getCalendarSessionEventStyle({
      status: 'completed',
      paid: true,
      endAt: ENDED_AT,
      isOrgTutor: true,
    });

    expect(trial.backgroundColor).toBe('#a855f7');
    expect(completed.backgroundColor).toBe('#10b981');
  });
});
