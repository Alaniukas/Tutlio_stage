import type { Locale, LocaleDayPeriod, LocalizeFn, MatchFn, FormatDistanceToken, FormatLongFn } from 'date-fns';
import { enUS } from 'date-fns/locale';

// date-fns 4.1 has no Filipino locale. Keep calendar names and parsing together
// so a formatted Filipino date can be read back without an English fallback.
const months = {
  wide: ['Enero', 'Pebrero', 'Marso', 'Abril', 'Mayo', 'Hunyo', 'Hulyo', 'Agosto', 'Setyembre', 'Oktubre', 'Nobyembre', 'Disyembre'],
  abbreviated: ['Ene', 'Peb', 'Mar', 'Abr', 'May', 'Hun', 'Hul', 'Ago', 'Set', 'Okt', 'Nob', 'Dis'],
  narrow: ['E', 'P', 'M', 'A', 'M', 'H', 'H', 'A', 'S', 'O', 'N', 'D'],
};
const days = {
  wide: ['Linggo', 'Lunes', 'Martes', 'Miyerkules', 'Huwebes', 'Biyernes', 'Sabado'],
  abbreviated: ['Lin', 'Lun', 'Mar', 'Miy', 'Huw', 'Biy', 'Sab'],
  short: ['Li', 'Lu', 'Ma', 'Mi', 'Hu', 'Bi', 'Sa'],
  narrow: ['L', 'L', 'M', 'M', 'H', 'B', 'S'],
};
const eras = { wide: ['Bago si Kristo', 'Anno Domini'], abbreviated: ['BC', 'AD'], narrow: ['B', 'A'] };
const quarters = { wide: ['ika-1 quarter', 'ika-2 quarter', 'ika-3 quarter', 'ika-4 quarter'], abbreviated: ['Q1', 'Q2', 'Q3', 'Q4'], narrow: ['1', '2', '3', '4'] };
type Names = { wide: string[] } & Record<string, string[]>;

function localizeNames<T extends number>(names: Names, offset = 0): LocalizeFn<T> {
  return (value, options) => (names[options?.width ?? 'wide'] ?? names.wide)[value - offset];
}

function matchNames<T extends number>(names: Names, offset = 0): MatchFn<T> {
  return (input, options) => {
    const choices = names[options?.width ?? 'wide'] ?? names.wide;
    const found = choices.map((text, i) => ({ text, i })).sort((a, b) => b.text.length - a.text.length)
      .find(({ text }) => input.toLocaleLowerCase('fil-PH').startsWith(text.toLocaleLowerCase('fil-PH')));
    if (!found) return null;
    const value = (found.i + offset) as T;
    return { value: options?.valueCallback ? options.valueCallback(String(value)) : value, rest: input.slice(found.text.length) };
  };
}

const periods: Record<LocaleDayPeriod, string> = {
  am: 'AM', pm: 'PM', midnight: 'hatinggabi', noon: 'tanghali',
  morning: 'umaga', afternoon: 'hapon', evening: 'gabi', night: 'madaling-araw',
};
const matchPeriod: MatchFn<LocaleDayPeriod> = (input, options) => {
  const found = (Object.entries(periods) as [LocaleDayPeriod, string][])
    .find(([, text]) => input.toLowerCase().startsWith(text.toLowerCase()));
  if (!found) return null;
  return { value: options?.valueCallback ? options.valueCallback(found[0]) : found[0], rest: input.slice(found[1].length) };
};
const distances: Record<FormatDistanceToken, string> = {
  lessThanXSeconds: 'wala pang {count} segundo', xSeconds: '{count} segundo', halfAMinute: 'kalahating minuto',
  lessThanXMinutes: 'wala pang {count} minuto', xMinutes: '{count} minuto', aboutXHours: 'humigit-kumulang {count} oras',
  xHours: '{count} oras', xDays: '{count} araw', aboutXWeeks: 'humigit-kumulang {count} linggo', xWeeks: '{count} linggo',
  aboutXMonths: 'humigit-kumulang {count} buwan', xMonths: '{count} buwan', aboutXYears: 'humigit-kumulang {count} taon',
  xYears: '{count} taon', overXYears: 'higit sa {count} taon', almostXYears: 'halos {count} taon',
};
const longFormat = (formats: Record<string, string>): FormatLongFn => (options) => formats[options.width ?? 'full'] ?? formats.full;

export const filDateFns: Locale = {
  code: 'fil-PH',
  options: { weekStartsOn: 0, firstWeekContainsDate: 1 },
  localize: {
    ordinalNumber: (value) => `ika-${value}`,
    era: localizeNames(eras), quarter: localizeNames(quarters, 1), month: localizeNames(months), day: localizeNames(days),
    dayPeriod: (value) => periods[value],
  },
  match: {
    ordinalNumber: (input, options) => {
      const found = /^(?:ika-)?(\d+)/i.exec(input);
      if (!found) return null;
      const value = Number(found[1]);
      return { value: options?.valueCallback ? options.valueCallback(String(value)) : value, rest: input.slice(found[0].length) };
    },
    era: matchNames(eras), quarter: matchNames(quarters, 1), month: matchNames(months), day: matchNames(days), dayPeriod: matchPeriod,
  },
  formatLong: {
    date: longFormat({ full: 'EEEE, MMMM d, y', long: 'MMMM d, y', medium: 'MMM d, y', short: 'MM/dd/yyyy' }),
    time: enUS.formatLong.time,
    dateTime: longFormat({ full: "{{date}} 'nang' {{time}}", long: "{{date}} 'nang' {{time}}", medium: '{{date}}, {{time}}', short: '{{date}}, {{time}}' }),
  },
  formatDistance: (token, count, options) => {
    const value = distances[token].replace('{count}', String(count));
    return options?.addSuffix ? options.comparison && options.comparison > 0 ? `sa loob ng ${value}` : `${value} ang nakalipas` : value;
  },
  formatRelative: (token) => ({ lastWeek: "'noong' eeee 'nang' p", yesterday: "'kahapon nang' p", today: "'ngayon nang' p", tomorrow: "'bukas nang' p", nextWeek: "eeee 'nang' p", other: 'P' })[token],
};
