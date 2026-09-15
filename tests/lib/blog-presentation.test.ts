import { describe, expect, it } from 'vitest';
import { blogAuthorForPost, blogAuthorIndex } from '../../src/lib/blogAuthor';
import { localizedBlogTag, storedBlogTag } from '../../src/lib/blogTag';
import { blogPostPath, postSlug } from '../../src/lib/blogLocale';

describe('localized blog presentation', () => {
  it('uses the localized slug in the article path', () => {
    const post = { slug: 'universal', slug_en: 'english-title', slug_pl: 'polski-tytul' };
    expect(postSlug(post, 'pl')).toBe('polski-tytul');
    expect(blogPostPath(post, 'pl')).toBe('/pl/blog/polski-tytul');
  });

  it('localizes legacy and generated category labels', () => {
    expect(localizedBlogTag('Parenting & Academic Support', 'pl')).toBe('Rodzice i nauka');
    expect(localizedBlogTag('Bendravimas', 'pl')).toBe('Komunikacja');
    expect(localizedBlogTag('Finansai korepetitoriams', 'pl')).toBe('Finanse');
    expect(storedBlogTag('Parenting & Academic Support')).toBe('Parents');
  });

  it('rotates among three stable authors and localizes each byline', () => {
    const posts = Array.from({ length: 30 }, (_, index) => ({ id: `post-${index}` }));
    expect(new Set(posts.map(blogAuthorIndex))).toEqual(new Set([0, 1, 2]));

    const post = posts[4];
    const english = blogAuthorForPost(post, 'en');
    const polish = blogAuthorForPost(post, 'pl');
    expect(polish.avatar).toBe(english.avatar);
    expect(polish.name).not.toBe(english.name);
    expect(polish.role).toBe('Redakcja rynku edukacji, Tutlio');
  });
});
