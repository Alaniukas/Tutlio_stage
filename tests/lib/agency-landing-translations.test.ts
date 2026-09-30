import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';

const locales = ["ar","bg","cs","el","es-mx","fil","he","hi","hr","hu","id","it","ja","ko","pt","pt-br","ro","sk","sl","th","tr","uk","zh-hk","de","dk","ee","es","fi","fr","lv","no"] as const;
const exportNames: Record<string, string> = { 'es-mx': 'esMx', 'pt-br': 'ptBr', 'zh-hk': 'zhHk' };
const keys = Object.keys(en).filter(key => key.startsWith('landing.agencyCta.') || key.startsWith('landing.agencyFaq.'));

describe('native agency landing copy without a shared eager language bundle', () => {
  it.each(locales)('%s explicitly supplies the agency CTA and FAQs in its own locale dictionary', async locale => {
    const module = await import('../../src/lib/i18n/' + locale + '.ts');
    const dictionary = module[exportNames[locale] || locale] as Record<string, string>;
    const source = readFileSync('src/lib/i18n/' + locale + '.ts', 'utf8');
    expect(keys).toHaveLength(12);
    for (const key of keys) {
      expect(source).toContain(JSON.stringify(key) + ':');
      expect(dictionary[key]).toBeTruthy();
      expect(dictionary[key]).not.toBe(en[key]);
      for (const pattern of [/\{[a-zA-Z_][a-zA-Z_0-9]*\}/g, /<\/?[a-zA-Z][^>]*>/g, /\d+(?:[.,]\d+)?/g, /(?:https?:\/\/|mailto:)[^\s"'<>]+/g]) {
        expect((dictionary[key].match(pattern) || []).sort()).toEqual((en[key].match(pattern) || []).sort());
      }
      expect(dictionary[key]).not.toContain('—');
    }
  });
});
