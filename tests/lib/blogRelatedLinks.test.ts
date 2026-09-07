import { describe, expect, it } from 'vitest';
import {
  enrichBlogLocaleContent,
  relatedPostsForLocale,
  renderAboutTutlioHtml,
  renderRelatedPostsHtml,
} from '../../api/_lib/blogRelatedLinks.js';

describe('enrichBlogLocaleContent', () => {
  it('appends about block and related links', () => {
    const out = enrichBlogLocaleContent('# Hello\n\nBody text.', 'lt', [
      { id: '1', slug: 'test-post', title: 'Test', tag: 'SEO', url: 'https://www.tutlio.lt/blog/test-post' },
    ]);
    expect(out).toContain('## Apie Tutlio');
    expect(out).toContain('## Skaitykite taip pat');
    expect(out).toContain('/blog/test-post');
  });

  it('is idempotent', () => {
    const once = enrichBlogLocaleContent('content', 'en', []);
    const twice = enrichBlogLocaleContent(once, 'en', []);
    expect(twice.match(/## About Tutlio/g)?.length).toBe(1);
  });
});

describe('localized blog supporting links', () => {
  it('never links a locale page to an untranslated fallback article', () => {
    const rows = [
      { id: '1', slug: 'english-post', title_en: 'English post', slug_en: 'english-post' },
      { id: '2', slug: 'article-francais', title_fr: 'Article français', slug_fr: 'article-francais' },
    ];
    const related = relatedPostsForLocale(rows, 'fr');
    expect(related).toHaveLength(1);
    expect(related[0].title).toBe('Article français');
    expect(related[0].url).toBe('https://www.tutlio.com/fr/blog/article-francais');
  });

  it('renders native related and about copy outside the primary three locales', () => {
    const related = renderRelatedPostsHtml([
      { id: '1', slug: 'artikel', title: 'Ein Artikel', tag: 'Tipps', url: 'https://www.tutlio.com/de/blog/artikel' },
    ], 'de');
    const about = renderAboutTutlioHtml('fr', 'https://www.tutlio.com/fr/pricing', 'https://www.tutlio.com/fr/blog');
    expect(related).toContain('Auch lesenswert');
    expect(about).toContain('À propos de Tutlio');
    expect(about).not.toContain('About Tutlio');
  });
});
