import { withEnglishLocaleFallback, type Locale } from './i18n/locales.js';

export const BLOG_EDITORIAL_VOICE = 'a Tutlio education-market editor';

const AUTHOR_AVATARS = [
  '/blog/authors/editor-elena.jpg',
  '/blog/authors/editor-sofia.jpg',
  '/blog/authors/editor-daniel.jpg',
] as const;

/** Fictional Tutlio bylines paired with original portraits in public/blog/authors. */
const AUTHOR_NAMES: Record<Locale, readonly [string, string, string]> = {
  lt: ['Elena Norkūnė', 'Austėja Kazlauskaitė', 'Mantas Petraitis'],
  en: ['Emma Carter', 'Sofia Martin', 'Daniel Kim'],
  pl: ['Zofia Nowak', 'Anna Kowalska', 'Michał Zieliński'],
  lv: ['Elīna Ozoliņa', 'Laura Bērziņa', 'Mārtiņš Kalniņš'],
  ee: ['Eliise Tamm', 'Sofia Saar', 'Martin Kask'],
  fr: ['Élise Martin', 'Sophie Bernard', 'Julien Moreau'],
  es: ['Elena García', 'Sofía Martín', 'Daniel Ruiz'],
  de: ['Lena Hoffmann', 'Sofia Wagner', 'Daniel Becker'],
  se: ['Elin Andersson', 'Sofia Lindberg', 'Daniel Berg'],
  dk: ['Emma Nielsen', 'Sofie Jensen', 'Daniel Larsen'],
  fi: ['Elina Korhonen', 'Sofia Mäkinen', 'Daniel Virtanen'],
  no: ['Elise Hansen', 'Sofie Johansen', 'Daniel Berg'],
  nl: ['Emma de Vries', 'Sophie Jansen', 'Daan Smit'],
  th: ['เอ็มมา คาร์เตอร์', 'โซเฟีย มาร์ติน', 'แดเนียล คิม'],
  tr: ['Elif Kaya', 'Sofia Martin', 'Deniz Yılmaz'],
  'zh-hk': ['陳雅雯', '蘇菲亞・馬丁', '金大賢'],
  it: ['Elena Rossi', 'Sofia Romano', 'Daniele Conti'],
  pt: ['Helena Silva', 'Sofia Martins', 'Daniel Costa'],
  ro: ['Elena Popescu', 'Sofia Ionescu', 'Daniel Dumitrescu'],
  cs: ['Eliška Nováková', 'Sofie Svobodová', 'Daniel Dvořák'],
  el: ['Ελένη Παπαδοπούλου', 'Σοφία Νικολάου', 'Δημήτρης Γεωργίου'],
  hu: ['Emma Nagy', 'Zsófia Kovács', 'Dániel Szabó'],
  bg: ['Елена Иванова', 'София Петрова', 'Даниел Георгиев'],
  hr: ['Elena Horvat', 'Sofija Kovač', 'Daniel Babić'],
  sk: ['Elena Nováková', 'Sofia Kováčová', 'Daniel Horváth'],
  sl: ['Elena Novak', 'Sofija Kovač', 'Daniel Zupan'],
  hi: ['एमा कार्टर', 'सोफिया मार्टिन', 'डैनियल किम'],
  ko: ['엠마 카터', '소피아 마틴', '대니얼 김'],
  ja: ['エマ・カーター', 'ソフィア・マルティン', 'ダニエル・キム'],
  id: ['Emma Kartika', 'Sofia Lestari', 'Daniel Wijaya'],
  ar: ['إيما كارتر', 'صوفيا مارتن', 'دانيال كيم'],
  'pt-br': ['Helena Souza', 'Sofia Martins', 'Daniel Costa'],
  'es-mx': ['Elena García', 'Sofía Martínez', 'Daniel Ruiz'],
  fil: ['Emma Santos', 'Sofia Reyes', 'Daniel Cruz'],
  he: ['אמה קרטר', 'סופיה מרטין', 'דניאל קים'],
  uk: ['Олена Коваль', 'Софія Бондаренко', 'Данило Мельник'],
};

export const BLOG_AUTHOR_ROLE: Record<Locale, string> = withEnglishLocaleFallback({
  lt: 'Švietimo rinkos redakcija, Tutlio',
  en: 'Education market editor, Tutlio',
  pl: 'Redakcja rynku edukacji, Tutlio',
  lv: 'Izglītības tirgus redakcija, Tutlio',
  ee: 'Haridusturu toimetus, Tutlio',
  fr: 'Rédaction du marché de l’éducation, Tutlio',
  es: 'Redacción del mercado educativo, Tutlio',
  de: 'Redaktion Bildungsmarkt, Tutlio',
  se: 'Redaktion för utbildningsmarknaden, Tutlio',
  dk: 'Redaktion for uddannelsesmarkedet, Tutlio',
  fi: 'Koulutusmarkkinoiden toimitus, Tutlio',
  no: 'Redaksjon for utdanningsmarkedet, Tutlio',
  nl: 'Redactie onderwijsmarkt, Tutlio',
  th: 'กองบรรณาธิการด้านการศึกษา, Tutlio',
  tr: 'Eğitim pazarı editörlüğü, Tutlio',
  'zh-hk': '教育市場編輯，Tutlio',
  it: 'Redazione del mercato dell’istruzione, Tutlio',
  pt: 'Redação do mercado da educação, Tutlio',
  ro: 'Redacția pieței educaționale, Tutlio',
  cs: 'Redakce trhu vzdělávání, Tutlio',
  el: 'Συντακτική ομάδα εκπαίδευσης, Tutlio',
  hu: 'Oktatási piaci szerkesztőség, Tutlio',
  bg: 'Редакция за образователния пазар, Tutlio',
  hr: 'Redakcija obrazovnog tržišta, Tutlio',
  sk: 'Redakcia trhu vzdelávania, Tutlio',
  sl: 'Uredništvo izobraževalnega trga, Tutlio',
  hi: 'शिक्षा बाज़ार संपादकीय टीम, Tutlio',
  ko: '교육 시장 편집팀, Tutlio',
  ja: '教育市場編集部、Tutlio',
  id: 'Redaksi pasar pendidikan, Tutlio',
  ar: 'هيئة تحرير سوق التعليم، Tutlio',
  'pt-br': 'Redação do mercado da educação, Tutlio',
  'es-mx': 'Redacción del mercado educativo, Tutlio',
  fil: 'Patnugutan sa merkado ng edukasyon, Tutlio',
  he: 'מערכת שוק החינוך, Tutlio',
  uk: 'Редакція освітнього ринку, Tutlio',
});

export interface BlogAuthor {
  id: string;
  name: string;
  role: string;
  avatar: string;
}

function authorSeed(post: Record<string, unknown>): string {
  for (const key of ['id', 'generation_keyword', 'slug', 'slug_lt', 'slug_en', 'title_lt', 'title_en']) {
    const value = post[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return 'tutlio-editorial';
}

export function blogAuthorIndex(post: Record<string, unknown>): number {
  let hash = 2166136261;
  for (const char of authorSeed(post)) {
    hash ^= char.codePointAt(0) || 0;
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % AUTHOR_AVATARS.length;
}

export function blogAuthorRole(locale: Locale): string {
  return BLOG_AUTHOR_ROLE[locale] || BLOG_AUTHOR_ROLE.en;
}

export function blogAuthorForPost(post: Record<string, unknown>, locale: Locale): BlogAuthor {
  const index = blogAuthorIndex(post);
  return {
    id: `tutlio-editor-${index + 1}`,
    name: AUTHOR_NAMES[locale]?.[index] || AUTHOR_NAMES.en[index],
    role: blogAuthorRole(locale),
    avatar: AUTHOR_AVATARS[index],
  };
}

export function blogAuthorJsonLd(locale: Locale, post: Record<string, unknown>) {
  const author = blogAuthorForPost(post, locale);
  return {
    '@type': 'Person' as const,
    name: author.name,
    image: `https://www.tutlio.com${author.avatar}`,
    jobTitle: author.role,
    worksFor: {
      '@type': 'Organization' as const,
      name: 'Tutlio',
      url: 'https://www.tutlio.com',
    },
  };
}
