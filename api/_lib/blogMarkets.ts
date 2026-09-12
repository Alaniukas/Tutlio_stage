import { BLOG_SCHEMA_LOCALES, type BlogSchemaLocale } from '../../src/lib/i18n/localeRelease.js';

/** Local school-system + search-intent notes. Not a translation glossary. */
export const BLOG_MARKET_NOTES: Record<BlogSchemaLocale, string> = {
  th: 'Thailand: Prathom/Matthayom, school and university entrance exams, private tutors and tutorial schools, THB. Write in natural Thai for parents and students; avoid importing Western school terminology.',
  tr: 'Türkiye: ortaokul/lise, LGS/YKS, özel ders, TRY. Write for Turkish families and tutors using current local school and exam vocabulary.',
  'zh-hk': 'Hong Kong: primary/secondary school, HKDSE, private tutors and tutorial centres, HKD. Write in Traditional Chinese as used in Hong Kong, not Simplified Chinese or Mainland-only school terminology.',
  lt: 'Lithuania: gimnazija, brandos egzaminai, korepetitoriai, savivaldybių mokyklos, EUR. Write for Lithuanian parents and tutors; use Lithuanian exam and school vocabulary.',
  en: 'English (tutlio.com): international / UK-adjacent tutoring (GCSEs, A-levels, IB) and EU families who read English. Do not write as if the only market is the United States. Currency examples in EUR unless a UK example is clearly labelled.',
  pl: 'Poland: szkoła podstawowa/liceum, matura, korepetycje, PLN. Polish school calendar and parent expectations.',
  lv: 'Latvia: vispārējā izglītība, centralizētie eksāmeni, privātskolotāji, EUR. Latvian school terminology.',
  ee: 'Estonia: gümnaasium, riigieksamid, eraõpetajad, EUR. Estonian school terminology.',
  fr: 'France: collège/lycée, baccalauréat, soutien scolaire, EUR. French National Education vocabulary; avoid copying Lithuanian exam names.',
  es: 'Spain: ESO/Bachillerato, selectividad/EBAU, clases particulares, EUR. Spanish school vocabulary.',
  de: 'Germany/Austria/Switzerland as relevant: Gymnasium, Abitur/Matura, Nachhilfe, EUR. German school vocabulary; do not mix with Lithuanian brandos.',
  se: 'Sweden: grundskola/gymnasium, nationella prov, läxhjälp, SEK. Swedish school vocabulary.',
  dk: 'Denmark: folkeskole/gymnasium, afgangsprøver, lektiehjælp, DKK. Danish school vocabulary.',
  fi: 'Finland: peruskoulu/lukio, ylioppilastutkinto, tukiopetus, EUR. Finnish school vocabulary.',
  no: 'Norway: ungdomsskole/vgs, eksamen, leksehjelp, NOK. Norwegian school vocabulary.',
  nl: 'Netherlands: vmbo/havo/vwo, eindexamen, bijles, EUR. Dutch school vocabulary.',
  it: 'Italy: scuola secondaria di primo/secondo grado, maturità, ripetizioni, EUR. Use Italian school stages and parent vocabulary rather than literal English translations.',
  pt: 'Portugal: ensino básico/secundário, exames nacionais, explicações, EUR. Write European Portuguese, not Brazilian Portuguese.',
  ro: 'Romania: gimnaziu/liceu, Evaluarea Națională/Bacalaureat, meditații, RON. Use Romanian school and family terminology.',
  cs: 'Czechia: základní/střední škola, maturita, doučování, CZK. Write natural Czech and use local school stages.',
  el: 'Greece: gymnasio/lykeio, Panhellenic exams when relevant, ιδιαίτερα μαθήματα, EUR. Write natural Greek for families and tutors.',
  hu: 'Hungary: általános iskola/gimnázium, érettségi, korrepetálás, HUF. Use Hungarian education terminology and realistic family decisions.',
  bg: 'Bulgaria: основно/средно училище, матура, частни уроци. Use current Bulgarian school vocabulary and avoid assuming another country’s exam system.',
  hr: 'Croatia: osnovna/srednja škola, državna matura, instrukcije, EUR. Write natural Croatian for parents, students and tutors.',
  sk: 'Slovakia: základná/stredná škola, maturita, doučovanie, EUR. Use Slovak rather than Czech wording.',
  sl: 'Slovenia: osnovna/srednja šola, matura, inštrukcije, EUR. Use Slovenian school terminology.',
  hi: 'India: CBSE/ICSE/state boards as relevant, board and entrance exams, tuition/coaching, INR. Write natural Hindi while retaining familiar English education terms where Indian families normally use them; do not treat one board as universal.',
  ko: 'South Korea: middle/high school, school exams and Suneung when relevant, hagwon/private tutoring, KRW. Write natural Korean and distinguish school support from exam-cram culture.',
  ja: 'Japan: junior/senior high school, school and entrance exams, juku/private tutors, JPY. Write natural Japanese and use local family and study-routine vocabulary.',
  id: 'Indonesia: SD/SMP/SMA, school and entrance assessments, les privat/bimbel, IDR. Write natural Indonesian and avoid Malaysian wording.',
  ar: 'Arabic-speaking families across MENA: school systems differ by country. Write Modern Standard Arabic, keep guidance broadly useful, and label any country-specific exam or currency example instead of presenting it as universal.',
  'pt-br': 'Brazil: ensino fundamental/médio, ENEM/vestibular when relevant, reforço escolar/aulas particulares, BRL. Write Brazilian Portuguese, not European Portuguese.',
  'es-mx': 'Mexico: primaria/secundaria/preparatoria, school and university entrance exams, clases particulares, MXN. Write Mexican Spanish, not Spain-specific school vocabulary.',
  fil: 'Philippines: elementary/junior/senior high school, DepEd/K-12 context, school and entrance exams, tutoring, PHP. Write natural Filipino with familiar English education terms where locally normal.',
  he: 'Israel: elementary/middle/high school, Bagrut when relevant, private lessons, ILS. Write natural Hebrew for parents and students.',
  uk: 'Ukraine: початкова/середня/старша школа, НМТ when relevant, репетитори, UAH. Write natural Ukrainian and do not use Russian school terminology.',
};

export const BLOG_LOCALE_LANGUAGE: Record<BlogSchemaLocale, string> = {
  th: 'Thai',
  tr: 'Turkish',
  'zh-hk': 'Traditional Chinese (Hong Kong)',
  lt: 'Lithuanian',
  en: 'English',
  pl: 'Polish',
  lv: 'Latvian',
  ee: 'Estonian',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  se: 'Swedish',
  dk: 'Danish',
  fi: 'Finnish',
  no: 'Norwegian',
  nl: 'Dutch',
  it: 'Italian',
  pt: 'European Portuguese',
  ro: 'Romanian',
  cs: 'Czech',
  el: 'Greek',
  hu: 'Hungarian',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sk: 'Slovak',
  sl: 'Slovenian',
  hi: 'Hindi',
  ko: 'Korean',
  ja: 'Japanese',
  id: 'Indonesian',
  ar: 'Modern Standard Arabic',
  'pt-br': 'Brazilian Portuguese',
  'es-mx': 'Mexican Spanish',
  fil: 'Filipino',
  he: 'Hebrew',
  uk: 'Ukrainian',
};

/** Exact native heading requested from the model and recognized by FAQ JSON-LD. */
export const BLOG_FAQ_LABEL: Record<BlogSchemaLocale, string> = {
  th: 'คำถามที่พบบ่อย',
  tr: 'Sık Sorulan Sorular',
  'zh-hk': '常見問題',
  lt: 'DUK',
  en: 'Frequently Asked Questions',
  pl: 'Często zadawane pytania',
  lv: 'Biežāk uzdotie jautājumi',
  ee: 'Korduma kippuvad küsimused',
  fr: 'Questions fréquentes',
  es: 'Preguntas frecuentes',
  de: 'Häufige Fragen',
  se: 'Vanliga frågor',
  dk: 'Ofte stillede spørgsmål',
  fi: 'Usein kysytyt kysymykset',
  no: 'Ofte stilte spørsmål',
  nl: 'Veelgestelde vragen',
  it: 'Domande frequenti',
  pt: 'Perguntas frequentes',
  ro: 'Întrebări frecvente',
  cs: 'Časté otázky',
  el: 'Συχνές ερωτήσεις',
  hu: 'Gyakori kérdések',
  bg: 'Често задавани въпроси',
  hr: 'Česta pitanja',
  sk: 'Časté otázky',
  sl: 'Pogosta vprašanja',
  hi: 'अक्सर पूछे जाने वाले प्रश्न',
  ko: '자주 묻는 질문',
  ja: 'よくある質問',
  id: 'Pertanyaan yang sering diajukan',
  ar: 'الأسئلة الشائعة',
  'pt-br': 'Perguntas frequentes',
  'es-mx': 'Preguntas frecuentes',
  fil: 'Mga madalas itanong',
  he: 'שאלות נפוצות',
  uk: 'Поширені запитання',
};

const DEFAULT_TITLE_CONVENTION =
  'Use a concise, natural native-language search title in ordinary sentence case; return it only in the JSON title field and never repeat it as an H1 in the body';

const TITLE_CONVENTION_OVERRIDES: Partial<Record<BlogSchemaLocale, string>> = {
  en: 'Use natural sentence case, not American marketing Title Case; return the title only in JSON and do not add an H1 to the body',
  de: 'Follow standard German noun capitalization but avoid English-style capitalization of every major word; no H1 in the body',
  fr: 'Use French sentence-style headline capitalization, not an English Title Case calque; no H1 in the body',
  es: 'Use Spanish sentence case and proper opening punctuation for a question; avoid capitalizing every important word; no H1 in the body',
  'es-mx': 'Use Mexican Spanish sentence case and proper opening punctuation for a question; no English Title Case and no H1 in the body',
  pt: 'Use European Portuguese sentence case rather than capitalizing each headline word; no H1 in the body',
  'pt-br': 'Use Brazilian Portuguese sentence case rather than capitalizing each headline word; no H1 in the body',
  tr: 'Apply Turkish casing correctly, including dotted and dotless I; use natural sentence case and no H1 in the body',
  'zh-hk': 'Write a concise Traditional Chinese Hong Kong headline without inserted spaces, English Title Case, or an H1 in the body',
  ja: 'Write a concise natural Japanese search headline without English-style punctuation or an H1 in the body',
  ko: 'Write a concise natural Korean search headline without English Title Case or an H1 in the body',
  ar: 'Write a clear Modern Standard Arabic search headline with natural RTL punctuation and no H1 in the body',
  he: 'Write a clear natural Hebrew search headline with natural RTL punctuation and no H1 in the body',
  hi: 'Write a concise natural Hindi search headline; retain only education terms commonly used in English by Indian readers and add no H1 to the body',
  th: 'Write a concise natural Thai search headline without artificial word spacing or an H1 in the body',
};

const DEFAULT_TRANSLATION_ARTIFACT_RULE =
  'Do not mirror English sentence order, translate idioms literally, preserve English heading templates, mention a source article, or emit labels such as “translation” or “original”';

const TRANSLATION_ARTIFACT_OVERRIDES: Partial<Record<BlogSchemaLocale, string>> = {
  en: 'Do not assume a US-only school system, spell out unexplained local acronyms, or copy examples from the Lithuanian market brief',
  'zh-hk': 'Use Traditional Chinese and Hong Kong education terms; reject Simplified Chinese characters, Mainland-only terminology, and English punctuation patterns',
  pt: 'Use European Portuguese throughout; reject Brazilian vocabulary, gerund-heavy Brazilian phrasing, and translated English headline patterns',
  'pt-br': 'Use Brazilian Portuguese throughout; reject European Portuguese vocabulary and translated English headline patterns',
  es: 'Use Spain Spanish and its education system; reject Mexican school-stage terms and literal English headline patterns',
  'es-mx': 'Use Mexican Spanish and its education system; reject Spain-only school-stage terms and literal English headline patterns',
  cs: 'Use Czech consistently; reject Slovak inflections or mixed Czech-Slovak terminology',
  sk: 'Use Slovak consistently; reject Czech inflections or mixed Czech-Slovak terminology',
  uk: 'Use Ukrainian consistently; reject Russian vocabulary, transliterations, and Russian school terminology',
  id: 'Use Indonesian consistently; reject Malaysian vocabulary and literal English syntax',
  no: 'Use natural Norwegian Bokmål; reject mixed Danish or Swedish forms',
  se: 'Use natural Swedish; reject mixed Danish or Norwegian forms',
  dk: 'Use natural Danish; reject mixed Swedish or Norwegian forms',
  fil: 'Use natural Filipino with locally normal English education terms; reject word-for-word English-to-Filipino phrasing',
  ar: 'Use readable Modern Standard Arabic; do not drift into an unlabelled country dialect or mirror English word order',
};

export const BLOG_TITLE_CONVENTIONS = Object.fromEntries(
  BLOG_SCHEMA_LOCALES.map((locale) => [
    locale,
    TITLE_CONVENTION_OVERRIDES[locale] || DEFAULT_TITLE_CONVENTION,
  ]),
) as Record<BlogSchemaLocale, string>;

export const BLOG_TRANSLATION_ARTIFACT_RULES = Object.fromEntries(
  BLOG_SCHEMA_LOCALES.map((locale) => [
    locale,
    TRANSLATION_ARTIFACT_OVERRIDES[locale] || DEFAULT_TRANSLATION_ARTIFACT_RULE,
  ]),
) as Record<BlogSchemaLocale, string>;

export function blogLocaleInternalPath(locale: BlogSchemaLocale, path: '/blog' | '/pricing'): string {
  return `/${locale}${path}`;
}

/** A labelled, locale-specific SEO brief injected into every independent article request. */
export function blogLocaleSeoInstructions(locale: BlogSchemaLocale, searchIntent: string): string {
  const language = BLOG_LOCALE_LANGUAGE[locale];
  return [
    `TARGET-LOCALE SEO BRIEF (${locale}; ${language}) - write independently, do not translate an English article:`,
    `- Search intent: ${searchIntent}`,
    '- Query coverage: answer the dominant intent first, then use native synonyms and related education entities only where they improve clarity; never create a section for every keyword variation',
    `- Terminology: ${BLOG_MARKET_NOTES[locale]}`,
    `- Examples: create at least two locally plausible worked examples grounded in those school stages, exams, tutoring formats, and family decisions; label them as examples and never imply they are real customers or research findings`,
    '- Information gain: make the shared thesis useful through a local decision rule, diagnostic, trade-off, failure mode, or operational framework rather than a generic tips list',
    `- Units and currency: use local date, time, number, school-year, measurement, and currency conventions from the market note; never silently convert an example from another locale`,
    `- Title/H1 convention: ${BLOG_TITLE_CONVENTIONS[locale]}`,
    `- Internal links: optional, maximum one; use native-language anchor text and only ${blogLocaleInternalPath(locale, '/blog')} or ${blogLocaleInternalPath(locale, '/pricing')}; never copy another locale's URL prefix`,
    `- Prohibited translation artifacts: ${BLOG_TRANSLATION_ARTIFACT_RULES[locale]}`,
  ].join('\n');
}

/** Tuesday and Friday UTC — two new articles per week, fixed weekdays. */
export function isBlogAutoPublishWeekday(now = new Date()): boolean {
  const day = now.getUTCDay();
  return day === 2 || day === 5;
}

/** Generate English first (brief language), then LT slug, then other markets. */
export const BLOG_LOCALE_WRITE_ORDER: BlogSchemaLocale[] = [
  'en', 'lt', 'pl', 'de', 'fr', 'es', 'it', 'pt', 'pt-br', 'es-mx', 'nl',
  'lv', 'ee', 'se', 'dk', 'fi', 'no', 'tr', 'cs', 'sk', 'sl', 'ro', 'hu',
  'bg', 'hr', 'el', 'uk', 'ar', 'he', 'hi', 'id', 'fil', 'th', 'zh-hk', 'ja', 'ko',
];
