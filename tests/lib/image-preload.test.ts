import { afterEach, describe, expect, it, vi } from 'vitest';
import { preloadImages } from '../../src/lib/imagePreload';

describe('image preload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('warms unique image paths at low priority', () => {
    const created: Array<{ src: string; decoding: string; fetchPriority: string }> = [];

    class MockImage {
      decoding = '';
      fetchPriority = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(value: string) {
        created.push({ src: value, decoding: this.decoding, fetchPriority: this.fetchPriority });
      }
    }

    vi.stubGlobal('Image', MockImage);
    preloadImages(['/quiz/next-a.webp', '/quiz/next-b.webp', '/quiz/next-a.webp']);

    expect(created).toEqual([
      { src: '/quiz/next-a.webp', decoding: 'async', fetchPriority: 'low' },
      { src: '/quiz/next-b.webp', decoding: 'async', fetchPriority: 'low' },
    ]);
  });
});
