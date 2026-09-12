import { describe, expect, it } from 'vitest';
import {
  BLOG_COVER_ART_DIRECTIONS,
  buildBlogCoverPrompt,
  selectBlogCoverArtDirection,
} from '../../api/_lib/blogCoverArt.js';

describe('blog cover art direction', () => {
  it('offers a broad but controlled set of unique editorial directions', () => {
    expect(BLOG_COVER_ART_DIRECTIONS.length).toBeGreaterThanOrEqual(12);
    expect(new Set(BLOG_COVER_ART_DIRECTIONS.map((direction) => direction.id)).size)
      .toBe(BLOG_COVER_ART_DIRECTIONS.length);
    for (const direction of BLOG_COVER_ART_DIRECTIONS) {
      expect(direction.medium.length).toBeGreaterThan(30);
      expect(direction.composition.length).toBeGreaterThan(30);
      expect(direction.palette).toContain('indigo');
    }
  });

  it('selects deterministically while distributing ordinary blog topics', () => {
    const topics = [
      'when tutoring helps',
      'student motivation without pressure',
      'pricing private lessons',
      'exam preparation plan',
      'parent tutor communication',
      'managing a tutoring school',
      'homework routines',
      'choosing an online tutor',
      'reducing lesson cancellations',
      'measuring learning progress',
      'group lessons versus individual lessons',
      'building student confidence',
    ];
    const ids = topics.map((topic) => selectBlogCoverArtDirection(topic).id);
    expect(selectBlogCoverArtDirection(topics[0]).id).toBe(ids[0]);
    expect(new Set(ids).size).toBeGreaterThanOrEqual(7);
  });

  it('requests a topic-specific scene and explicitly rejects the repeated SaaS-icon look', () => {
    const { prompt, direction } = buildBlogCoverPrompt({
      keyword: 'student motivation without pressure',
      title: 'How to rebuild motivation after a difficult term',
      tag: 'Parents',
      concept: 'A student gradually opening a folded-paper path while an adult waits supportively at a distance.',
    });
    expect(prompt).toContain(direction.id);
    expect(prompt).toContain('one dominant focal subject');
    expect(prompt).toContain('generic SaaS dashboard');
    expect(prompt).toContain('icon cloud');
    expect(prompt).toContain('purple gradient blobs');
    expect(prompt).toContain('Return one image only');
  });
});
