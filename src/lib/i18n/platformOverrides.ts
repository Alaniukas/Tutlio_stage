import type { Platform } from '@/lib/platform';
import type { Locale } from './core';

type TermReplacement = [string, string] | [string, string, 'stem'];

interface PlatformLocaleConfig {
  replacements: TermReplacement[];
  overrides?: Record<string, string>;
}

interface PlatformConfig {
  locales: Partial<Record<Locale, PlatformLocaleConfig>>;
}

// ── Schools platform (same term replacements as teachers) ─────────────
const schoolsEn: PlatformLocaleConfig = {
  replacements: [
    ['tutoring', 'teaching'],
    ['tutors', 'teachers'],
    ['tutor', 'teacher'],
    ['korep', 'teach'],
  ],
};

const schoolsLt: PlatformLocaleConfig = {
  replacements: [
    ['pas korepetitorių', 'pas mokytoją'],
    ['į korepetitorių', 'į mokytoją'],
    ['kaip korepetitorių', 'kaip mokytoją'],
    ['pagal korepetitorių', 'pagal mokytoją'],
    ['naują korepetitorių', 'naują mokytoją'],
    ['šį korepetitorių', 'šį mokytoją'],
    ['aktyvų korepetitorių', 'aktyvų mokytoją'],
    ['vieną korepetitorių', 'vieną mokytoją'],
    ['pasirinkite korepetitorių', 'pasirinkite mokytoją'],
    ['pašalinti korepetitorių', 'pašalinti mokytoją'],
    ['pridėti korepetitorių', 'pridėti mokytoją'],
    ['pridėjus korepetitorių', 'pridėjus mokytoją'],
    ['informuokite korepetitorių', 'informuokite mokytoją'],
    ['redaguoti korepetitorius', 'redaguoti mokytojus'],
    ['priskirti korepetitorius', 'priskirti mokytojus'],
    ['kelis korepetitorius', 'kelis mokytojus'],
    ['valdyti korepetitorius', 'valdyti mokytojus'],
    ['korepetitoriais', 'mokytojais'],
    ['korepetitoriaus', 'mokytojo'],
    ['korepetitoriams', 'mokytojams'],
    ['korepetitoriumi', 'mokytoju'],
    ['korepetitoriui', 'mokytojui'],
    ['korepetitoriai', 'mokytojai'],
    ['korepetitorių', 'mokytojų'],
    ['korepetitorius', 'mokytojas'],
    ['korep', 'mokyt'],
  ],
};

const schoolsPl: PlatformLocaleConfig = {
  replacements: [
    ['korepetytorzy', 'nauczyciele'],
    ['korepetytorów', 'nauczycieli'],
    ['korepetytor', 'nauczyciel', 'stem'],
  ],
};

const schoolsLv: PlatformLocaleConfig = {
  replacements: [
    ['privātskolotāj', 'skolotāj', 'stem'],
  ],
};

const schoolsEe: PlatformLocaleConfig = {
  replacements: [
    ['eraõpetaja', 'õpetaja', 'stem'],
  ],
};

// ── Teachers platform ─────────────────────────────────────────────────
const teachersEn: PlatformLocaleConfig = {
  replacements: [
    ['tutoring', 'teaching'],
    ['tutors', 'teachers'],
    ['tutor', 'teacher'],
    ['korep', 'teach'],
  ],
};

const teachersLt: PlatformLocaleConfig = {
  replacements: [
    // Multi-word accusative patterns (preposition/verb + acc sg) — must come first
    ['pas korepetitorių', 'pas mokytoją'],
    ['į korepetitorių', 'į mokytoją'],
    ['kaip korepetitorių', 'kaip mokytoją'],
    ['pagal korepetitorių', 'pagal mokytoją'],
    ['naują korepetitorių', 'naują mokytoją'],
    ['šį korepetitorių', 'šį mokytoją'],
    ['aktyvų korepetitorių', 'aktyvų mokytoją'],
    ['vieną korepetitorių', 'vieną mokytoją'],
    ['pasirinkite korepetitorių', 'pasirinkite mokytoją'],
    ['pašalinti korepetitorių', 'pašalinti mokytoją'],
    ['pridėti korepetitorių', 'pridėti mokytoją'],
    ['pridėjus korepetitorių', 'pridėjus mokytoją'],
    ['informuokite korepetitorių', 'informuokite mokytoją'],
    // Multi-word accusative plural (verb + acc pl)
    ['redaguoti korepetitorius', 'redaguoti mokytojus'],
    ['priskirti korepetitorius', 'priskirti mokytojus'],
    ['kelis korepetitorius', 'kelis mokytojus'],
    ['valdyti korepetitorius', 'valdyti mokytojus'],
    // Single-word forms (longest first) — all unambiguous cases
    ['korepetitoriais', 'mokytojais'],
    ['korepetitoriaus', 'mokytojo'],
    ['korepetitoriams', 'mokytojams'],
    ['korepetitoriumi', 'mokytoju'],
    ['korepetitoriui', 'mokytojui'],
    ['korepetitoriai', 'mokytojai'],
    // Ambiguous forms — default to most common usage
    ['korepetitorių', 'mokytojų'],
    ['korepetitorius', 'mokytojas'],
    // Abbreviation (e.g. "korep." in admin labels)
    ['korep', 'mokyt'],
  ],
};

const teachersPl: PlatformLocaleConfig = {
  replacements: [
    // Irregular plural forms — must precede stem replacement
    ['korepetytorzy', 'nauczyciele'],
    ['korepetytorów', 'nauczycieli'],
    // Stem replacement handles regular forms (nom, gen, acc, instr, adj)
    ['korepetytor', 'nauczyciel', 'stem'],
  ],
};

const teachersLv: PlatformLocaleConfig = {
  replacements: [
    ['privātskolotāj', 'skolotāj', 'stem'],
  ],
};

const teachersEe: PlatformLocaleConfig = {
  replacements: [
    ['eraõpetaja', 'õpetaja', 'stem'],
  ],
};

// ── Registry ──────────────────────────────────────────────────────────
const platformConfigs: Partial<Record<Platform, PlatformConfig>> = {
  schools: {
    locales: {
      en: schoolsEn,
      lt: schoolsLt,
      pl: schoolsPl,
      lv: schoolsLv,
      ee: schoolsEe,
    },
  },
  teachers: {
    locales: {
      en: teachersEn,
      lt: teachersLt,
      pl: teachersPl,
      lv: teachersLv,
      ee: teachersEe,
    },
  },
};

// ── Replacement engine ────────────────────────────────────────────────
function preserveCase(match: string, replacement: string): string {
  if (match === match.toUpperCase()) return replacement.toUpperCase();
  if (match[0] === match[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function applyReplacements(text: string, replacements: TermReplacement[]): string {
  const parts = text.split(/(\{[^}]+\})/);
  return parts
    .map((part) => {
      if (part.startsWith('{') && part.endsWith('}')) return part;
      let result = part;
      for (const entry of replacements) {
        const [search, replace] = entry;
        const start = '(?<!\\p{L})';
        const end = entry[2] === 'stem' ? '' : '(?!\\p{L})';
        const regex = new RegExp(`${start}${search}${end}`, 'giu');
        result = result.replace(regex, (m) => preserveCase(m, replace));
      }
      return result;
    })
    .join('');
}

export function resolvePlatformTranslation(
  platform: Platform,
  locale: Locale,
  key: string,
  baseText: string,
): string {
  const config = platformConfigs[platform]?.locales[locale];
  if (!config) return baseText;

  const explicit = config.overrides?.[key];
  if (explicit !== undefined) return explicit;

  if (config.replacements.length > 0) {
    return applyReplacements(baseText, config.replacements);
  }

  return baseText;
}
