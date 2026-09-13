import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../../src/lib/i18n/en';
import { lt } from '../../src/lib/i18n/lt';

const srcRoot = path.join(process.cwd(), 'src');

const usedKeys = new Set<string>();

function walk(dir: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full);
      continue;
    }
    if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue;
    const source = fs.readFileSync(full, 'utf8');
    for (const match of source.matchAll(/\bt(?:Html)?\(\s*['"]([^'"]+)['"]/g)) {
      usedKeys.add(match[1]);
    }
  }
}

walk(srcRoot);

const isQuizKey = (key: string) => key.startsWith('quiz.');
const isCompareKey = (key: string) => key.startsWith('compare.');
const isMvLtOnlyKey = (key: string) =>
  key.startsWith('em.mvFirstLesson') || key.startsWith('push.mv_first_lesson_planned_tutor');

const staticUsedKeys = [...usedKeys]
  .filter((key) => !isQuizKey(key) && !isCompareKey(key) && !isMvLtOnlyKey(key))
  .sort();

describe('i18n used keys — no raw key leaks in UI', () => {
  it('en defines every static t() key used in src/', () => {
    const missing = staticUsedKeys.filter((key) => !(key in en));
    expect(missing, `en.ts is missing ${missing.length} used key(s):\n${missing.join('\n')}`).toEqual([]);
  });

  it('lt defines every static t() key used in src/', () => {
    const missing = staticUsedKeys.filter((key) => !(key in lt));
    expect(missing, `lt.ts is missing ${missing.length} used key(s):\n${missing.join('\n')}`).toEqual([]);
  });
});
