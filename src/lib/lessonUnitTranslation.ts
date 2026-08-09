export type LessonUnitTranslationKey =
  | 'package.lessonUnit1'
  | 'package.lessonUnit2to9'
  | 'package.lessonUnit10plus';

/**
 * Selects the lesson noun form used beside a numeric package size.
 * Polish needs CLDR plural categories: 5–9, 12–14 and values ending in 1
 * (apart from exactly 1) use the genitive plural form.
 */
export function getLessonUnitTranslationKey(locale: string, count: number): LessonUnitTranslationKey {
  if (locale === 'pl') {
    const category = new Intl.PluralRules('pl-PL').select(Math.abs(count));
    if (category === 'one') return 'package.lessonUnit1';
    if (category === 'few') return 'package.lessonUnit2to9';
    return 'package.lessonUnit10plus';
  }

  if (count === 1) return 'package.lessonUnit1';
  return count < 10 ? 'package.lessonUnit2to9' : 'package.lessonUnit10plus';
}
