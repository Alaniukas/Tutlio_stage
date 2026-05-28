const DIACRITICS: Record<string, string> = {
  // Lithuanian
  ą: 'a', č: 'c', ę: 'e', ė: 'e', į: 'i', š: 's', ų: 'u', ū: 'u', ž: 'z',
  // Polish
  ć: 'c', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
  // Latvian
  ā: 'a', ē: 'e', ģ: 'g', ī: 'i', ķ: 'k', ļ: 'l', ņ: 'n', ŗ: 'r', ū: 'u',
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
  return text
    .toLowerCase()
    .replace(DIACRITICS_RE, (c) => DIACRITICS[c] || c)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}
