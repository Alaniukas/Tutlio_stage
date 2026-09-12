const DIACRITICS: Record<string, string> = {
  // Lithuanian
  ą: 'a', č: 'c', ę: 'e', ė: 'e', į: 'i', š: 's', ų: 'u', ū: 'u', ž: 'z',
  // Polish
  ć: 'c', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  // Latvian (ū shared with Lithuanian above)
  ā: 'a', ē: 'e', ģ: 'g', ī: 'i', ķ: 'k', ļ: 'l', ņ: 'n', ŗ: 'r',
  // Estonian
  õ: 'o', ä: 'a', ö: 'o', ü: 'u',
  // French / Spanish
  à: 'a', â: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e', î: 'i', ï: 'i', ô: 'o',
  ù: 'u', û: 'u', ÿ: 'y', ç: 'c', ñ: 'n', í: 'i', ú: 'u',
  // German
  ß: 'ss',
  // Scandinavian
  å: 'a', æ: 'ae', ø: 'o',
};

const DIACRITICS_RE = new RegExp(`[${Object.keys(DIACRITICS).join('')}]`, 'g');

export function slugify(text: string): string {
  const slug = text
    .normalize('NFC')
    .toLowerCase()
    .replace(DIACRITICS_RE, (c) => DIACRITICS[c] || c)
    // Keep native-script URLs for locales that cannot be meaningfully reduced
    // to ASCII (Arabic, CJK, Cyrillic, Devanagari, Hebrew, Thai, etc.). Marks
    // are required for scripts whose vowels/accents are separate code points.
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
    .replace(/^-|-$/g, '');

  // Slice code points rather than UTF-16 units so an astral character can
  // never be cut in half. URL serializers will percent-encode when required.
  return Array.from(slug).slice(0, 80).join('').replace(/-$/g, '');
}
