import { expect, it } from 'vitest';
import { schoolFamilyAccountTranslations, schoolFamilyAccountCopy } from '../../src/lib/schoolFamilyAccountCopy';
it('covers all 13 legacy languages and keeps the new family copy complete', () => {
  expect(Object.keys(schoolFamilyAccountTranslations).sort()).toEqual(['lt','en','pl','lv','ee','fr','es','de','se','dk','fi','no','nl'].sort());
  for (const [locale, copy] of Object.entries(schoolFamilyAccountTranslations)) {
    expect(Object.keys(copy)).toEqual(Object.keys(schoolFamilyAccountTranslations.en));
    expect(Object.values(copy).every((value) => value.trim().length > 0)).toBe(true);
    if (locale !== 'en') expect(copy.intro).not.toBe(schoolFamilyAccountTranslations.en.intro);
  }
  expect(schoolFamilyAccountCopy('unsupported')).toBe(schoolFamilyAccountTranslations.en);
});
