import { describe, expect, it } from 'vitest';
import { slugify } from '../../api/_lib/slugify.js';

describe('blog slugify', () => {
  it('keeps the established readable ASCII slugs for Latin titles', () => {
    expect(slugify('Kaip išsirinkti korepetitorių?')).toBe('kaip-issirinkti-korepetitoriu');
    expect(slugify('Choisir un professeur particulier')).toBe('choisir-un-professeur-particulier');
  });

  it.each([
    ['Ukrainian', 'Як обрати репетитора'],
    ['Arabic', 'كيف تختار معلماً خصوصياً'],
    ['Hebrew', 'איך לבחור מורה פרטי'],
    ['Hindi', 'सही ट्यूटर कैसे चुनें'],
    ['Thai', 'วิธีเลือกครูสอนพิเศษ'],
    ['Traditional Chinese', '如何選擇補習老師'],
    ['Japanese', '家庭教師の選び方'],
    ['Korean', '개인 교사를 선택하는 방법'],
    ['Greek', 'Πώς να επιλέξετε καθηγητή'],
    ['Bulgarian', 'Как да изберем частен учител'],
  ])('creates a non-empty native-script slug for %s', (_language, title) => {
    const slug = slugify(title);
    expect(slug.length).toBeGreaterThan(2);
    expect(slug).not.toMatch(/^[-\s]+$/);
    expect(slug).not.toContain(' ');
  });

  it('limits by Unicode code points without leaving a trailing separator', () => {
    const slug = slugify(`${'学'.repeat(79)} test more words`);
    expect(Array.from(slug).length).toBeLessThanOrEqual(80);
    expect(Array.from(slug)).toHaveLength(79);
    expect(slug).not.toMatch(/-$/);
  });
});
