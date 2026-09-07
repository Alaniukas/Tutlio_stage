export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly';

export type RecurringTemplateWindow = {
  start_date: string;
  end_date?: string | null;
  start_time: string;
  end_time: string;
  frequency?: RecurringFrequency | null;
};

const DAY_MS = 86_400_000;

function parseYmd(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatYmd(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function addUtcDays(value: Date, amount: number): Date {
  return new Date(value.getTime() + amount * DAY_MS);
}

function addUtcMonthsClamped(anchor: Date, amount: number): Date {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + amount;
  const day = anchor.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

/** Date-only occurrences inside an inclusive rolling window. */
export function buildRollingOccurrenceDates(
  template: RecurringTemplateWindow,
  windowStartYmd: string,
  windowEndYmd: string,
): string[] {
  const anchor = parseYmd(template.start_date);
  const windowStart = parseYmd(windowStartYmd);
  const requestedEnd = parseYmd(windowEndYmd);
  const templateEnd = template.end_date ? parseYmd(template.end_date) : null;
  const windowEnd = templateEnd && templateEnd < requestedEnd ? templateEnd : requestedEnd;
  if (anchor > windowEnd) return [];

  const frequency = template.frequency || 'weekly';
  const out: string[] = [];

  if (frequency === 'monthly') {
    let index = 0;
    let current = addUtcMonthsClamped(anchor, index);
    while (current < windowStart) {
      index += 1;
      current = addUtcMonthsClamped(anchor, index);
    }
    while (current <= windowEnd) {
      out.push(formatYmd(current));
      index += 1;
      current = addUtcMonthsClamped(anchor, index);
    }
    return out;
  }

  const stepDays = frequency === 'biweekly' ? 14 : 7;
  const elapsedDays = Math.floor((windowStart.getTime() - anchor.getTime()) / DAY_MS);
  const firstStep = elapsedDays > 0 ? Math.ceil(elapsedDays / stepDays) : 0;
  for (let current = addUtcDays(anchor, firstStep * stepDays); current <= windowEnd; current = addUtcDays(current, stepDays)) {
    out.push(formatYmd(current));
  }
  return out;
}

function partsInTimeZone(value: Date, timeZone: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  return Object.fromEntries(
    parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]),
  );
}

/** Convert an organization wall-clock date/time to a UTC instant, including DST. */
export function wallClockToUtc(
  dateYmd: string,
  timeValue: string,
  timeZone = 'Europe/Vilnius',
): Date {
  const [year, month, day] = dateYmd.split('-').map(Number);
  const [hour, minute, second = 0] = timeValue.split(':').map(Number);
  const targetUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = new Date(targetUtcMs);

  // Two passes handle offsets on either side of daylight-saving transitions.
  for (let pass = 0; pass < 2; pass += 1) {
    const observed = partsInTimeZone(guess, timeZone);
    const observedUtcMs = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    guess = new Date(guess.getTime() + (targetUtcMs - observedUtcMs));
  }
  return guess;
}

export function recurringDurationMs(startTime: string, endTime: string): number {
  const toSeconds = (value: string) => {
    const [hour, minute, second = 0] = value.split(':').map(Number);
    return hour * 3600 + minute * 60 + second;
  };
  return Math.max(0, (toSeconds(endTime) - toSeconds(startTime)) * 1000);
}
