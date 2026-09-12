/**
 * School terminology — pure text transforms shared by the browser `t()` and
 * the serverless email renderer.
 *
 *  • staff:    "korepetitorius" → "mokytojas" (the schools platform copy layer)
 *  • activity: "pamoka"         → "užsiėmimas" (school orgs must not use the
 *              word "pamoka" — org flag `school_activity_labels`, default on
 *              for `entity_type = 'school'`)
 *
 * Lithuanian is inflected and "pamoka" (feminine) becomes "užsiėmimas"
 * (masculine), so the noun is swapped per case and then agreeing adjectives /
 * participles around it are re-inflected (up to three words before the noun,
 * one participle after it). The rules are frequency-driven from the LT
 * dictionary; `LT_ACTIVITY_KEY_OVERRIDES` wins for the rare ambiguous keys.
 * Keep this file free of React / DOM / Supabase imports.
 */
import type { Locale } from './locales.js';
import { resolvePlatformTranslation } from './platformOverrides.js';

export type SchoolTerminology = {
  /** "mokytojas" instead of "korepetitorius". */
  staff: boolean;
  /** "užsiėmimas" instead of "pamoka". */
  activity: boolean;
};

export const NO_SCHOOL_TERMINOLOGY: SchoolTerminology = Object.freeze({ staff: false, activity: false });

/** Org row → terminology mode. Schools get both unless the org switched a label off. */
export function schoolTerminologyForOrg(
  entityType: string | null | undefined,
  features: Record<string, unknown> | null | undefined,
): SchoolTerminology {
  const isSchool = String(entityType || '').trim().toLowerCase() === 'school';
  const f = features && typeof features === 'object' ? features : {};
  const staff = isSchool ? f.school_teacher_labels !== false : f.school_teacher_labels === true;
  const activity = isSchool ? f.school_activity_labels !== false : f.school_activity_labels === true;
  return { staff, activity };
}

// ─── Lithuanian: pamoka → užsiėmimas ─────────────────────────────────────────

type SuffixTable = Array<[string, string]>;
type ExplicitMap = Record<string, string>;
type CaseRule = { table: SuffixTable; explicit: ExplicitMap };

function capitalizeLike(sample: string, replacement: string): string {
  if (!sample) return replacement;
  if (sample.length > 1 && sample === sample.toUpperCase() && /\p{L}/u.test(sample)) return replacement.toUpperCase();
  if (sample[0] === sample[0].toUpperCase() && sample[0] !== sample[0].toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

// Feminine adjective / participle → masculine, per case of the noun it agrees with.
const NOM_SG: CaseRule = {
  table: [['oji', 'asis'], ['inė', 'inis'], ['usi', 'ęs'], ['anti', 'antis'], ['inti', 'intis'], ['ta', 'tas'], ['ma', 'mas']],
  explicit: {
    nauja: 'naujas', ši: 'šis', ta: 'tas', kita: 'kitas', pirma: 'pirmas', viena: 'vienas', visa: 'visas',
    kiekviena: 'kiekvienas', laisva: 'laisvas', gyva: 'gyvas', aktyvi: 'aktyvus', individuali: 'individualus',
    reguliari: 'reguliarus', artimiausia: 'artimiausias', paskutinė: 'paskutinis', tokia: 'toks', pati: 'pats',
    kuri: 'kuris', papildoma: 'papildomas', nemokama: 'nemokamas', mokama: 'mokamas', įprasta: 'įprastas',
    ankstesnė: 'ankstesnis', vėlesnė: 'vėlesnis', mėnesinė: 'mėnesinis', savaitinė: 'savaitinis', kasdienė: 'kasdienis',
    esama: 'esamas', būsima: 'būsimas', likusi: 'likęs', praėjusi: 'praėjęs', įvykusi: 'įvykęs', neįvykusi: 'neįvykęs',
    vykusi: 'vykęs', buvusi: 'buvęs', pasibaigusi: 'pasibaigęs', atitinkama: 'atitinkamas', jokia: 'joks',
    antra: 'antras', trečia: 'trečias', bandomoji: 'bandomasis', pirmoji: 'pirmasis', naujoji: 'naujasis',
  },
};
const GEN_SG: CaseRule = {
  table: [['osios', 'ojo'], ['inės', 'inio'], ['usios', 'usio'], ['ančios', 'ančio'], ['inčios', 'inčio'], ['tos', 'to'], ['mos', 'mo']],
  explicit: {
    visos: 'viso', šios: 'šio', tos: 'to', kitos: 'kito', pirmos: 'pirmo', kiekvienos: 'kiekvieno', vienos: 'vieno',
    konkrečios: 'konkretaus', individualios: 'individualaus', reguliarios: 'reguliaraus', aktyvios: 'aktyvaus',
    naujos: 'naujo', tokios: 'tokio', pačios: 'paties', kurios: 'kurio', artimiausios: 'artimiausio',
    ankstesnės: 'ankstesnio', vėlesnės: 'vėlesnio', laisvos: 'laisvo', gyvos: 'gyvo', įprastos: 'įprasto',
    paskutinės: 'paskutinio', jokios: 'jokio', antros: 'antro', trečios: 'trečio', bandomosios: 'bandomojo',
    pirmosios: 'pirmojo', naujosios: 'naujojo', papildomos: 'papildomo', nemokamos: 'nemokamo', mokamos: 'mokamo',
    esamos: 'esamo', būsimos: 'būsimo', likusios: 'likusio', praėjusios: 'praėjusio', įvykusios: 'įvykusio',
    vykusios: 'vykusio', buvusios: 'buvusio', neįvykusios: 'neįvykusio', atitinkamos: 'atitinkamo',
  },
};
const NOM_PL: CaseRule = {
  table: [['osios', 'ieji'], ['inės', 'iniai'], ['usios', 'ę'], ['ančios', 'antys'], ['inčios', 'intys'], ['tos', 'ti'], ['mos', 'mi']],
  explicit: {
    visos: 'visi', šios: 'šie', tos: 'tie', kitos: 'kiti', pirmos: 'pirmi', naujos: 'nauji', vienos: 'vieni',
    individualios: 'individualūs', reguliarios: 'reguliarūs', aktyvios: 'aktyvūs', tokios: 'tokie', pačios: 'patys',
    kurios: 'kurie', kelios: 'keli', artimiausios: 'artimiausi', ankstesnės: 'ankstesni', vėlesnės: 'vėlesni',
    laisvos: 'laisvi', gyvos: 'gyvi', įprastos: 'įprasti', paskutinės: 'paskutiniai', jokios: 'jokie',
    papildomos: 'papildomi', nemokamos: 'nemokami', mokamos: 'mokami', esamos: 'esami', būsimos: 'būsimi',
    likusios: 'likę', praėjusios: 'praėję', įvykusios: 'įvykę', vykusios: 'vykę', buvusios: 'buvę', neįvykusios: 'neįvykę',
    atitinkamos: 'atitinkami', antros: 'antri', trečios: 'treti',
  },
};
const ACC_SG: CaseRule = {
  table: [['ąją', 'ąjį'], ['inę', 'inį'], ['usią', 'usį'], ['ančią', 'antį'], ['inčią', 'intį'], ['ią', 'ų']],
  explicit: {
    šią: 'šį', kurią: 'kurį', pačią: 'patį', tokią: 'tokį', kitokią: 'kitokį', jokią: 'jokį',
    paskutinę: 'paskutinį', ankstesnę: 'ankstesnį', vėlesnę: 'vėlesnį',
  },
};
const DAT_SG: CaseRule = {
  table: [['ajai', 'ajam'], ['inei', 'iniam'], ['usiai', 'usiam'], ['ančiai', 'ančiam'], ['iai', 'iam'], ['ai', 'am']],
  explicit: { pačiai: 'pačiam', paskutinei: 'paskutiniam' },
};
const LOC_SG: CaseRule = {
  table: [['ojoje', 'ajame'], ['inėje', 'iniame'], ['usioje', 'usiame'], ['ančioje', 'ančiame'], ['ioje', 'iame'], ['oje', 'ame']],
  explicit: { pačioje: 'pačiame', paskutinėje: 'paskutiniame' },
};
const ACC_PL: CaseRule = {
  table: [['ąsias', 'uosius'], ['ines', 'inius'], ['usias', 'usius'], ['ančias', 'ančius'], ['inčias', 'inčius'], ['ias', 'ius'], ['tas', 'tus'], ['mas', 'mus']],
  explicit: {
    šias: 'šiuos', tas: 'tuos', kurias: 'kuriuos', kelias: 'kelis', naujas: 'naujus', visas: 'visus',
    laisvas: 'laisvus', gyvas: 'gyvus', paskutines: 'paskutinius', ankstesnes: 'ankstesnius', vėlesnes: 'vėlesnius',
    pačias: 'pačius', jokias: 'jokius', kitas: 'kitus', pirmas: 'pirmus', antras: 'antrus', trečias: 'trečius',
  },
};
const DAT_PL: CaseRule = {
  table: [['osioms', 'iesiems'], ['inėms', 'iniams'], ['usioms', 'usiems'], ['ančioms', 'antiems'], ['ioms', 'iems'], ['oms', 'iems'], ['ėms', 'iams']],
  explicit: { pačioms: 'patiems' },
};
const INS_PL: CaseRule = {
  table: [['osiomis', 'aisiais'], ['inėmis', 'iniais'], ['usiomis', 'usiais'], ['ančiomis', 'ančiais'], ['iomis', 'iais'], ['omis', 'ais'], ['ėmis', 'iais']],
  explicit: { pačiomis: 'pačiais' },
};
const LOC_PL: CaseRule = {
  table: [['osiose', 'uosiuose'], ['inėse', 'iniuose'], ['usiose', 'usiuose'], ['ančiose', 'ančiuose'], ['iose', 'iuose'], ['ose', 'uose']],
  explicit: { pačiose: 'pačiuose' },
};
const INS_SG: CaseRule = {
  table: [['oji', 'uoju'], ['inė', 'iniu'], ['usi', 'usiu'], ['anti', 'ančiu'], ['ta', 'tu'], ['ma', 'mu']],
  explicit: {
    kita: 'kitu', ši: 'šiuo', ta: 'tuo', viena: 'vienu', nauja: 'nauju', pirma: 'pirmu', kiekviena: 'kiekvienu',
    visa: 'visu', tokia: 'tokiu', pati: 'pačiu',
  },
};
const NO_AGREEMENT: CaseRule = { table: [], explicit: {} };
/** Possessives sit between an adjective and its noun without agreeing ("kita jūsų pamoka"). */
const TRANSPARENT = new Set(['jūsų', 'mano', 'savo', 'tavo', 'mūsų', 'jų', 'jo', 'jos', 'vaiko', 'mokinio']);

/** Participles that follow the noun and agree with it ("pamoka atšaukta", "pamokos sukurtos"). */
const POST_SG: CaseRule = {
  table: [['ta', 'tas'], ['ma', 'mas'], ['usi', 'ęs'], ['oji', 'asis'], ['inė', 'inis']],
  explicit: { bandomoji: 'bandomasis', nemokama: 'nemokamas', mokama: 'mokamas', papildoma: 'papildomas', grupinė: 'grupinis' },
};
const POST_PL: CaseRule = {
  table: [['tos', 'ti'], ['mos', 'mi'], ['usios', 'ę'], ['ančios', 'antys'], ['osios', 'ieji'], ['inės', 'iniai']],
  explicit: { nemokamos: 'nemokami', mokamos: 'mokami', papildomos: 'papildomi' },
};
/** Words that may sit between the noun and its participle. */
const LINKING = ['sėkmingai', 'jau', 'dar', 'buvo', 'yra', 'bus', 'nėra', 'tebėra', 'automatiškai', 'dabar', 'vis', 'nebuvo', 'nebus', 'tikrai', 'taip', 'pat'];

/** Suffixes an agreeing feminine adjective / participle can end with (any case). */
const ADJ_ENDINGS = /(oji|inė|usi|anti|inti|ta|ma|osios|inės|usios|ančios|inčios|tos|mos|ąją|inę|usią|ančią|inčią|ią|ajai|inei|usiai|ančiai|iai|ai|ojoje|inėje|usioje|ančioje|ioje|oje|ąsias|ines|usias|ančias|inčias|ias|tas|mas|osioms|inėms|usioms|ančioms|ioms|oms|ėms|osiomis|inėmis|usiomis|ančiomis|iomis|omis|ėmis|osiose|inėse|usiose|ančiose|iose|ose)$/u;

/** Never re-inflected even though they end like an adjective (nouns, pronouns, verbs, function words). */
const NEVER_AGREE = new Set([
  'vaiko', 'mano', 'savo', 'jūsų', 'tavo', 'jo', 'jos', 'jų', 'mūsų', 'kad', 'kai', 'ar', 'ir', 'bet', 'nes', 'jei', 'jeigu',
  'artėja', 'prasideda', 'baigiasi', 'vyksta', 'bus', 'buvo', 'yra', 'nėra', 'gali', 'turi', 'reikia', 'norite', 'galite',
  'šiandienos', 'rytojaus', 'savaitės', 'mėnesio', 'dienos', 'metų', 'grupės', 'mokyklos', 'mokinio', 'mokytojo',
  'korepetitoriaus', 'vaikams', 'tėvams', 'mokiniams', 'mokytojams', 'datos', 'vietos', 'formos', 'sumos', 'temos',
  'sistemos', 'programos', 'kortos', 'kainos', 'valandos', 'minutės', 'sąskaitos', 'sutarties', 'prašymu', 'kodėl',
  'kada', 'kur', 'kaip', 'tada', 'paskui', 'prieš', 'per', 'už', 'į', 'iš', 'po', 'su', 'be', 'iki', 'nuo', 'apie', 'dėl',
  'tarp', 'pas', 'gauta', 'gauna', 'siunčiama', 'atsiųsta', 'rodoma', 'laukia', 'prašoma', 'dienomis', 'valandomis',
  'minutėmis', 'savaitėmis', 'metais', 'kartais', 'dienose', 'rezervacijos', 'organizacijos', 'platformos', 'paskyros',
  'mokyklose', 'mokyklai', 'mokyklas', 'grupei', 'grupes', 'grupėms', 'grupėse', 'grupėmis', 'klasės', 'klasei', 'klases',
]);

function reinflect(word: string, rule: CaseRule): string | null {
  const lower = word.toLowerCase();
  if (rule.explicit[lower]) return capitalizeLike(word, rule.explicit[lower]);
  for (const [from, to] of rule.table) {
    if (lower.endsWith(from) && lower.length > from.length + 1) {
      return capitalizeLike(word, lower.slice(0, -from.length) + to);
    }
  }
  return null;
}

function agrees(word: string, rule: CaseRule): boolean {
  const lower = word.toLowerCase();
  if (rule.explicit[lower]) return true;
  if (NEVER_AGREE.has(lower)) return false;
  return lower.length >= 4 && ADJ_ENDINGS.test(lower) && reinflect(word, rule) !== null;
}

/** After "pamokos", these noun stems mean genitive singular ("pamokos laikas"). */
const GENITIVE_NEXT_STEMS = [
  'laik', 'kain', 'pradž', 'pabaig', 'duomen', 'detal', 'atšaukim', 'užklaus', 'tip', 'dat', 'rezervavim', 'viet',
  'apmokėjim', 'kredit', 'užsakym', 'mokin', 'trukm', 'tem', 'status', 'būsen', 'informacij', 'komentar', 'mokest',
  'perkėlim', 'rezervacij', 'įraš', 'form', 'sukūrim', 'redagavim', 'ištrynim', 'patvirtinim', 'pakeitim', 'plan',
  'medžiag', 'dalyv', 'nr', 'numer', 'kortel', 'lang', 'dien', 'valand', 'val', 'min', 'skaič', 'grafik', 'kalendor',
  'sąraš', 'istorij', 'primin', 'kompensacij', 'atlyg', 'baud', 'lentel', 'pavadinim', 'aprašym', 'nustatym', 'žym',
  'tvarkarašt', 'veiksm', 'mokėjim', 'sąskait', 'paket', 'nuolaid', 'vedėj', 'dalyk', 'mokytoj', 'korepetitor',
  'prisijungim', 'įvykim', 'praleidim', 'faktūr', 'sum', 'kiek', 'sek', 'vizit', 'lankomum', 'tiksl', 'rezultat',
  'vertinim', 'pažym', 'test', 'užduot', 'namų', 'kambar', 'lent', 'ekran', 'įrašym', 'kamer', 'adres', 'rūš',
  'kategorij', 'tarif', 'standart', 'pasiūlym', 'sąlyg', 'taisykl', 'vaizd', 'video', 'foto', 'nuotrauk', 'laukim',
  'žymėjim', 'metu', 'nuorod', 'pasibaigim', 'termin', 'apžvalg', 'peržiūr', 'santrauk', 'ataskait', 'statistik',
  'identifikator', 'fail', 'šablon', 'kod', 'id', 'eig', 'vidur', 'pus', 'dal', 'kopij', 'versij', 'atmintin',
  'apraš', 'pasirinkim', 'keitim', 'atnaujinim', 'pratęsim', 'nuotol', 'pobūd', 'format', 'grup', 'klas', 'vaik',
  'mokyt', 'lankytoj', 'organizator', 'skol', 'įsipareigojim', 'sutart', 'užsakov', 'partner', 'pasiūl', 'balans',
  'likut', 'įsigijim', 'pirkim', 'apskait', 'įvertinim', 'atsiliepim', 'santyk', 'temp', 'ritm', 'eiliškum', 'tvark',
];
const GENITIVE_PREV = new Set(['iki', 'po', 'nuo', 'be', 'dėl', 'iš', 'vietoj', 'metu', 'vidury', 'aplink', 'link', 'šalia', 'prie', 'virš', 'ties', 'anksčiau', 'vėliau', 'pradžioje', 'pabaigoje', 'viduryje', 'eigoje', 'pusė', 'pusei', 'dalis', 'dalį', 'kiekvienos', 'konkrečios', 'vienos', 'atitinkamos', 'nėra', 'nebus', 'nebuvo', 'neturi', 'neturite']);
const GENITIVE_NEXT_WORDS = new Set(['nėra', 'nebus', 'nebuvo', 'negalite', 'negalima', 'negaliu', 'negali', 'nepavyko', 'nerasta', 'neturite', 'neturi', 'neliko', 'nebėra', 'neįmanoma', 'nereikia', 'trūksta', 'reikia', 'metu', 'laukiama', 'laukiate']);

function genitiveContext(prev: string | undefined, next: string | undefined, linking: string): boolean {
  const p = prev?.toLowerCase();
  const n = next?.toLowerCase();
  if (p && GENITIVE_PREV.has(p)) return true;
  if (linking) return false;
  if (n) {
    if (GENITIVE_NEXT_WORDS.has(n)) return true;
    if (n.endsWith('ti') && n.length > 4) return true; // "pamokos rezervuoti negalite"
    if (GENITIVE_NEXT_STEMS.some((stem) => n.startsWith(stem))) return true;
    return false;
  }
  // "Nepavyko atšaukti pamokos." — infinitive + genitive object at the end.
  return Boolean(p && p.endsWith('ti') && p.length > 3);
}

const LINKING_GROUP = `((?:\\s+(?:${LINKING.join('|')})(?!\\p{L}))*)`;

/** "pamokos": genitive singular ("pamokos laikas") vs nominative plural ("Pamokos"). */
function replacePamokos(text: string): string {
  const re = new RegExp(
    `((?:\\p{L}+\\s+){0,2})(?<!\\p{L})pamokos(?!\\p{L})${LINKING_GROUP}(?:(\\s+)(\\p{L}+))?`,
    'giu',
  );
  return text.replace(re, (match: string, before: string, linking?: string, gap2?: string, next?: string) => {
    const words = before.match(/\p{L}+/gu) || [];
    const prev = words[words.length - 1];
    const prev2 = words.length > 1 ? words[words.length - 2] : undefined;
    const sample = match.slice(before.length, before.length + 'pamokos'.length);
    // "iš šios pamokos": the preposition sits two words back, behind an agreeing pronoun.
    const prepositionBehind = Boolean(
      prev2 && prev && GENITIVE_PREV.has(prev2.toLowerCase()) && !NEVER_AGREE.has(prev.toLowerCase()),
    );
    const genitive = genitiveContext(prev, next, linking || '') || prepositionBehind;
    const noun = capitalizeLike(sample, genitive ? 'užsiėmimo' : 'užsiėmimai');
    let tail = '';
    if (gap2 && next) {
      const swapped = !genitive && agrees(next, POST_PL) ? reinflect(next, POST_PL) : null;
      tail = `${gap2}${swapped ?? next}`;
    }
    return `${before}${noun}${linking ?? ''}${tail}`;
  });
}

/** "pamoka" (nominative singular) + optional agreeing participle after it. */
function replacePamoka(text: string): string {
  const re = new RegExp(`((?:\\p{L}+\\s+){0,3})(?<!\\p{L})pamoka(?!\\p{L})${LINKING_GROUP}(?:(\\s+)(\\p{L}+))?`, 'giu');
  return text.replace(re, (match: string, before: string, linking?: string, gap?: string, next?: string) => {
    // "su kita jūsų pamoka" → instrumental "užsiėmimu".
    const instrumental = /(?<!\p{L})su\s+(?:\p{L}+\s+){0,2}$/iu.test(before);
    const sample = match.slice(before.length, before.length + 'pamoka'.length);
    const noun = capitalizeLike(sample, instrumental ? 'užsiėmimu' : 'užsiėmimas');
    let tail = '';
    if (gap && next) {
      const swapped = !instrumental && agrees(next, POST_SG) ? reinflect(next, POST_SG) : null;
      tail = `${gap}${swapped ?? next}`;
    }
    return `${before}${noun}${linking ?? ''}${tail}`;
  });
}

const SIMPLE_FORMS: Array<[string, string]> = [
  ['pamokomis', 'užsiėmimais'],
  ['pamokoms', 'užsiėmimams'],
  ['pamokose', 'užsiėmimuose'],
  ['pamokoje', 'užsiėmime'],
  ['pamokai', 'užsiėmimui'],
  ['pamokas', 'užsiėmimus'],
  ['pamoką', 'užsiėmimą'],
  ['pamokų', 'užsiėmimų'],
];

const CASE_BY_NOUN: Array<[string, CaseRule]> = [
  ['užsiėmimuose', LOC_PL], ['užsiėmimais', INS_PL], ['užsiėmimams', DAT_PL], ['užsiėmimus', ACC_PL],
  ['užsiėmimai', NOM_PL], ['užsiėmimui', DAT_SG], ['užsiėmimą', ACC_SG], ['užsiėmime', LOC_SG],
  ['užsiėmimas', NOM_SG], ['užsiėmimo', GEN_SG], ['užsiėmimų', NO_AGREEMENT], ['užsiėmimu', INS_SG],
];
const NOUN_ALTERNATION = CASE_BY_NOUN.map(([n]) => n).join('|');

/** Re-inflect up to three agreeing words before every swapped noun ("Ši grupinė" → "Šis grupinis"). */
function reinflectPrecedingAdjectives(text: string): string {
  const re = new RegExp(`((?:\\p{L}+\\s+){1,3})(?<!\\p{L})(${NOUN_ALTERNATION})(?!\\p{L})`, 'giu');
  return text.replace(re, (_match: string, before: string, noun: string) => {
    const rule = CASE_BY_NOUN.find(([n]) => n === noun.toLowerCase())?.[1] ?? NO_AGREEMENT;
    if (!rule.table.length && !Object.keys(rule.explicit).length) return `${before}${noun}`;
    const tokens = before.match(/\p{L}+|\s+/gu) || [];
    for (let i = tokens.length - 1; i >= 0; i -= 1) {
      const token = tokens[i];
      if (/^\s+$/u.test(token)) continue;
      if (TRANSPARENT.has(token.toLowerCase())) continue;
      if (!agrees(token, rule)) break;
      tokens[i] = reinflect(token, rule) ?? token;
    }
    return `${tokens.join('')}${noun}`;
  });
}

const LT_PHRASES: Array<[RegExp, string]> = [
  // "pamokinis laikas" → "užsiėmimo laikas" (adjective derived from the noun).
  [/(?<!\p{L})pamokin(?:io|is|ė|ės|į|ę|iai|ių|iams|ius)(?!\p{L})/giu, 'užsiėmimo'],
  [/\(grupinė\)/giu, '(grupinis)'],
  [/\(grupinės\)/giu, '(grupinio)'],
];

/** Relative pronouns right after the swapped noun ("Užsiėmimai, kurios" → "kurie"). */
const LT_POST_PHRASES: Array<[RegExp, string]> = [
  [/(užsiėmimai),(\s+)kurios(?!\p{L})/giu, '$1,$2kurie'],
  [/(užsiėmimas),(\s+)kuri(?!\p{L})/giu, '$1,$2kuris'],
  [/(užsiėmimą),(\s+)kurią(?!\p{L})/giu, '$1,$2kurį'],
  [/(užsiėmimo),(\s+)kurios(?!\p{L})/giu, '$1,$2kurio'],
  [/(užsiėmimui),(\s+)kuriai(?!\p{L})/giu, '$1,$2kuriam'],
  [/(užsiėmimui),(\s+)kuri(?!\p{L})/giu, '$1,$2kuris'],
  [/(užsiėmimus),(\s+)kurias(?!\p{L})/giu, '$1,$2kuriuos'],
  [/(užsiėmimus),(\s+)kurios(?!\p{L})/giu, '$1,$2kurie'],
  [/(užsiėmimų),(\s+)kurios(?!\p{L})/giu, '$1,$2kurių'],
];

function transformPlainLt(part: string): string {
  let out = part;
  for (const [re, to] of LT_PHRASES) out = out.replace(re, (m) => capitalizeLike(m, to));
  for (const [form, replacement] of SIMPLE_FORMS) {
    out = out.replace(new RegExp(`(?<!\\p{L})${form}(?!\\p{L})`, 'giu'), (m) => capitalizeLike(m, replacement));
  }
  out = replacePamokos(out);
  out = replacePamoka(out);
  out = reinflectPrecedingAdjectives(out);
  for (const [re, to] of LT_POST_PHRASES) out = out.replace(re, to);
  return out;
}

/** Split out placeholders, tags and URLs so they are never rewritten. */
function mapPlainSegments(text: string, fn: (plain: string) => string): string {
  return text
    .split(/(\{[^}]+\}|<[^>]+>|https?:\/\/\S+)/u)
    .map((part) => (!part || part.startsWith('{') || part.startsWith('<') || /^https?:\/\//.test(part) ? part : fn(part)))
    .join('');
}

export function ltLessonToActivity(text: string): string {
  if (!text || !/pamok/iu.test(text)) return text;
  return mapPlainSegments(text, transformPlainLt);
}

// ─── English: lesson → session ───────────────────────────────────────────────

export function enLessonToActivity(text: string): string {
  if (!text || !/lesson/i.test(text)) return text;
  return mapPlainSegments(text, (part) =>
    part
      .replace(/\bLESSONS\b/g, 'SESSIONS')
      .replace(/\bLESSON\b/g, 'SESSION')
      .replace(/\blessons\b/gi, (m) => capitalizeLike(m, 'sessions'))
      .replace(/\blesson\b/gi, (m) => capitalizeLike(m, 'session')));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Per-key overrides for strings the generic rules cannot inflect well (final values). */
export const LT_ACTIVITY_KEY_OVERRIDES: Record<string, string> = {
  'common.lesson': 'Užsiėmimas',
  'parent.sessionsTitle': 'Užsiėmimai',
  'stuSess.allSessions': 'Visi Jūsų užsiėmimai',
};

export function applySchoolTerminology(
  text: string,
  locale: Locale | string,
  mode: SchoolTerminology,
  key = '',
): string {
  if (!text || (!mode.staff && !mode.activity)) return text;
  let out = text;
  if (mode.staff) {
    // Same copy layer as the /school/* platform routes (korepetitorius → mokytojas).
    out = resolvePlatformTranslation('schools', locale as Locale, key, out);
  }
  if (mode.activity) {
    if (locale === 'lt') {
      out = key && LT_ACTIVITY_KEY_OVERRIDES[key] ? LT_ACTIVITY_KEY_OVERRIDES[key] : ltLessonToActivity(out);
    } else if (locale === 'en') {
      out = enLessonToActivity(out);
    }
  }
  return out;
}
