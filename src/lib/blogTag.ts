import type { Locale } from './i18n/locales.js';

export const BLOG_TAG_CATEGORIES = [
  'parents',
  'communication',
  'productivity',
  'tools',
  'learning',
  'platform',
  'finance',
  'business',
  'tips',
  'news',
] as const;

export type BlogTagCategory = (typeof BLOG_TAG_CATEGORIES)[number];

const TAG_LABELS: Record<Locale, readonly string[]> = {
  lt: ['Tėvams ir mokymuisi', 'Bendravimas', 'Produktyvumas', 'Įrankiai', 'Mokymasis', 'Platforma', 'Finansai', 'Verslas', 'Patarimai', 'Naujienos'],
  en: ['Parenting & learning', 'Communication', 'Productivity', 'Tools', 'Learning', 'Platform', 'Finance', 'Business', 'Tips', 'News'],
  pl: ['Rodzice i nauka', 'Komunikacja', 'Produktywność', 'Narzędzia', 'Nauka', 'Platforma', 'Finanse', 'Biznes', 'Porady', 'Aktualności'],
  lv: ['Vecākiem un mācībām', 'Saziņa', 'Produktivitāte', 'Rīki', 'Mācīšanās', 'Platforma', 'Finanses', 'Bizness', 'Padomi', 'Jaunumi'],
  ee: ['Lapsevanematele ja õppimiseks', 'Suhtlus', 'Tootlikkus', 'Tööriistad', 'Õppimine', 'Platvorm', 'Rahandus', 'Äri', 'Nõuanded', 'Uudised'],
  fr: ['Parents et apprentissage', 'Communication', 'Productivité', 'Outils', 'Apprentissage', 'Plateforme', 'Finances', 'Entreprise', 'Conseils', 'Actualités'],
  es: ['Familias y aprendizaje', 'Comunicación', 'Productividad', 'Herramientas', 'Aprendizaje', 'Plataforma', 'Finanzas', 'Negocio', 'Consejos', 'Novedades'],
  de: ['Eltern und Lernen', 'Kommunikation', 'Produktivität', 'Tools', 'Lernen', 'Plattform', 'Finanzen', 'Unternehmen', 'Tipps', 'Neuigkeiten'],
  se: ['Föräldrar och lärande', 'Kommunikation', 'Produktivitet', 'Verktyg', 'Lärande', 'Plattform', 'Ekonomi', 'Företag', 'Tips', 'Nyheter'],
  dk: ['Forældre og læring', 'Kommunikation', 'Produktivitet', 'Værktøjer', 'Læring', 'Platform', 'Økonomi', 'Forretning', 'Tips', 'Nyheder'],
  fi: ['Vanhemmuus ja oppiminen', 'Viestintä', 'Tuottavuus', 'Työkalut', 'Oppiminen', 'Alusta', 'Talous', 'Liiketoiminta', 'Vinkit', 'Uutiset'],
  no: ['Foreldre og læring', 'Kommunikasjon', 'Produktivitet', 'Verktøy', 'Læring', 'Plattform', 'Økonomi', 'Virksomhet', 'Tips', 'Nyheter'],
  nl: ['Ouders en leren', 'Communicatie', 'Productiviteit', 'Tools', 'Leren', 'Platform', 'Financiën', 'Ondernemen', 'Tips', 'Nieuws'],
  th: ['ผู้ปกครองและการเรียน', 'การสื่อสาร', 'ประสิทธิภาพ', 'เครื่องมือ', 'การเรียนรู้', 'แพลตฟอร์ม', 'การเงิน', 'ธุรกิจ', 'คำแนะนำ', 'ข่าวสาร'],
  tr: ['Ebeveynler ve öğrenme', 'İletişim', 'Verimlilik', 'Araçlar', 'Öğrenme', 'Platform', 'Finans', 'İşletme', 'İpuçları', 'Haberler'],
  'zh-hk': ['家長與學習', '溝通', '生產力', '工具', '學習', '平台', '財務', '業務', '建議', '最新消息'],
  it: ['Genitori e apprendimento', 'Comunicazione', 'Produttività', 'Strumenti', 'Apprendimento', 'Piattaforma', 'Finanza', 'Attività', 'Consigli', 'Novità'],
  pt: ['Famílias e aprendizagem', 'Comunicação', 'Produtividade', 'Ferramentas', 'Aprendizagem', 'Plataforma', 'Finanças', 'Negócios', 'Dicas', 'Novidades'],
  ro: ['Părinți și învățare', 'Comunicare', 'Productivitate', 'Instrumente', 'Învățare', 'Platformă', 'Finanțe', 'Afaceri', 'Sfaturi', 'Noutăți'],
  cs: ['Rodiče a vzdělávání', 'Komunikace', 'Produktivita', 'Nástroje', 'Učení', 'Platforma', 'Finance', 'Podnikání', 'Tipy', 'Novinky'],
  el: ['Γονείς και μάθηση', 'Επικοινωνία', 'Παραγωγικότητα', 'Εργαλεία', 'Μάθηση', 'Πλατφόρμα', 'Οικονομικά', 'Επιχείρηση', 'Συμβουλές', 'Νέα'],
  hu: ['Szülők és tanulás', 'Kommunikáció', 'Hatékonyság', 'Eszközök', 'Tanulás', 'Platform', 'Pénzügyek', 'Üzlet', 'Tippek', 'Hírek'],
  bg: ['Родители и учене', 'Комуникация', 'Продуктивност', 'Инструменти', 'Учене', 'Платформа', 'Финанси', 'Бизнес', 'Съвети', 'Новини'],
  hr: ['Roditelji i učenje', 'Komunikacija', 'Produktivnost', 'Alati', 'Učenje', 'Platforma', 'Financije', 'Poslovanje', 'Savjeti', 'Novosti'],
  sk: ['Rodičia a vzdelávanie', 'Komunikácia', 'Produktivita', 'Nástroje', 'Učenie', 'Platforma', 'Financie', 'Podnikanie', 'Tipy', 'Novinky'],
  sl: ['Starši in učenje', 'Komunikacija', 'Produktivnost', 'Orodja', 'Učenje', 'Platforma', 'Finance', 'Poslovanje', 'Nasveti', 'Novice'],
  hi: ['अभिभावक और पढ़ाई', 'संचार', 'उत्पादकता', 'उपकरण', 'सीखना', 'प्लेटफ़ॉर्म', 'वित्त', 'व्यवसाय', 'सुझाव', 'समाचार'],
  ko: ['학부모와 학습', '소통', '생산성', '도구', '학습', '플랫폼', '재정', '비즈니스', '팁', '소식'],
  ja: ['保護者と学習', 'コミュニケーション', '生産性', 'ツール', '学習', 'プラットフォーム', '財務', 'ビジネス', 'ヒント', 'ニュース'],
  id: ['Orang tua dan belajar', 'Komunikasi', 'Produktivitas', 'Alat', 'Pembelajaran', 'Platform', 'Keuangan', 'Bisnis', 'Kiat', 'Berita'],
  ar: ['الأهل والتعلّم', 'التواصل', 'الإنتاجية', 'الأدوات', 'التعلّم', 'المنصة', 'الماليات', 'الأعمال', 'نصائح', 'الأخبار'],
  'pt-br': ['Famílias e aprendizagem', 'Comunicação', 'Produtividade', 'Ferramentas', 'Aprendizagem', 'Plataforma', 'Finanças', 'Negócios', 'Dicas', 'Novidades'],
  'es-mx': ['Familias y aprendizaje', 'Comunicación', 'Productividad', 'Herramientas', 'Aprendizaje', 'Plataforma', 'Finanzas', 'Negocio', 'Consejos', 'Novedades'],
  fil: ['Magulang at pag-aaral', 'Komunikasyon', 'Pagiging produktibo', 'Mga tool', 'Pag-aaral', 'Platform', 'Pananalapi', 'Negosyo', 'Mga payo', 'Balita'],
  he: ['הורים ולמידה', 'תקשורת', 'פרודוקטיביות', 'כלים', 'למידה', 'פלטפורמה', 'כספים', 'עסקים', 'טיפים', 'חדשות'],
  uk: ['Батьки й навчання', 'Спілкування', 'Продуктивність', 'Інструменти', 'Навчання', 'Платформа', 'Фінанси', 'Бізнес', 'Поради', 'Новини'],
};

const CATEGORY_INDEX = Object.fromEntries(BLOG_TAG_CATEGORIES.map((category, index) => [category, index])) as Record<BlogTagCategory, number>;

function normalizedTag(tag: string): string {
  return tag.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US');
}

export function canonicalBlogTag(tag: unknown): BlogTagCategory | null {
  if (typeof tag !== 'string') return null;
  const value = normalizedTag(tag.trim());
  if (!value) return null;
  if (/parent|parenting|family|academic support|tev|seim/.test(value)) return 'parents';
  if (/communication|communicat|bendrav|sazin/.test(value)) return 'communication';
  if (/productiv|produktyv|planning|time management/.test(value)) return 'productivity';
  if (/tool|irank|narzedz|riki/.test(value)) return 'tools';
  if (/financ|finans|payment|stripe|invoice|mokejim/.test(value)) return 'finance';
  if (/platform|software|technology|technolog/.test(value)) return 'platform';
  if (/business|versl|agency|operations|management/.test(value)) return 'business';
  if (/tip|advice|guide|patar|porad/.test(value)) return 'tips';
  if (/news|update|naujien|aktual/.test(value)) return 'news';
  if (/learn|learning|education|study|mokym|nauk/.test(value)) return 'learning';
  return null;
}

export function localizedBlogTag(tag: unknown, locale: Locale): string {
  if (typeof tag !== 'string') return '';
  const value = tag.trim();
  const category = canonicalBlogTag(value);
  if (!category) return value;
  return TAG_LABELS[locale][CATEGORY_INDEX[category]] || TAG_LABELS.en[CATEGORY_INDEX[category]] || value;
}

export function storedBlogTag(tag: unknown): string {
  const category = canonicalBlogTag(tag) || 'learning';
  return category.charAt(0).toUpperCase() + category.slice(1);
}
