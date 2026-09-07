import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * House style for the public website: no em-dashes (U+2014) in marketing
 * copy - a plain hyphen is used instead. Covers every locale dictionary's
 * marketing keys, the search metadata and the crawler-facing text files.
 * App/dashboard strings are out of scope. The prefix list mirrors the
 * one-off replacement script that introduced the rule.
 */
const ROOT = process.cwd();
const MARKETING_PREFIXES = [
  'landing', 'compare', 'feature', 'featuresIndex', 'pricing', 'about', 'contact',
  'schoolsLanding', 'quiz', 'nav', 'footer', 'blog', 'support', 'subscribe',
  'enterprise', 'enterpriseSuccess', 'common',
];
const KEY_RE = new RegExp(`^\\s*['"](${MARKETING_PREFIXES.join('|')})\\.`);
const EM_DASH = '—';

const dictionaryFiles = readdirSync(path.join(ROOT, 'src/lib/i18n'))
  .filter((name) => /^[a-z]{2,3}(-[a-z]{2})?\.ts$/.test(name))
  .sort();

describe('website copy uses hyphens, never em-dashes', () => {
  it('covers every locale dictionary', () => {
    expect(dictionaryFiles.length).toBeGreaterThanOrEqual(36);
  });

  it.each(dictionaryFiles)('%s marketing keys contain no em-dash', (name) => {
    const lines = readFileSync(path.join(ROOT, 'src/lib/i18n', name), 'utf8').split(/\r?\n/);
    const offenders = lines.filter((line) => KEY_RE.test(line) && line.includes(EM_DASH));
    expect(offenders, offenders.slice(0, 3).join('\n')).toEqual([]);
  });

  it.each([
    'src/lib/seoMeta.ts',
    'api/llms-txt.ts',
    'api/_lib/blogRelatedLinks.ts',
    'src/components/landing/v2/socialProof.ts',
    'src/components/landing/v2/demoPersonas.ts',
  ])('%s contains no em-dash', (file) => {
    expect(readFileSync(path.join(ROOT, file), 'utf8')).not.toContain(EM_DASH);
  });
});
