const VILNIUS_TZ = 'Europe/Vilnius';

type Ymd = { year: number; month: number; day: number };

function ymdInTz(date: Date, timeZone = VILNIUS_TZ): Ymd {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

/** Mokslo metai konsultacijoms: IX.1 – VI.30 (Vilnius). */
export function consultationSchoolYear(date: Date = new Date(), timeZone = VILNIUS_TZ): string | null {
  const { year, month } = ymdInTz(date, timeZone);
  if (month === 7 || month === 8) return null;
  if (month >= 9) return `${year}/${year + 1}`;
  return `${year - 1}/${year}`;
}

export function isConsultationSeason(date: Date = new Date(), timeZone = VILNIUS_TZ): boolean {
  const { month } = ymdInTz(date, timeZone);
  return month !== 7 && month !== 8;
}

export function consultationYearBounds(schoolYear: string): { start: string; end: string } | null {
  const m = /^(\d{4})\/(\d{4})$/.exec(String(schoolYear || '').trim());
  if (!m) return null;
  const startY = Number(m[1]);
  const endY = Number(m[2]);
  if (!Number.isFinite(startY) || endY !== startY + 1) return null;
  return {
    start: `${startY}-09-01`,
    end: `${endY}-06-30`,
  };
}
