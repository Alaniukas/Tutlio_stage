import { describe, expect, it, afterEach } from 'vitest';
import { parseBlogAiResponse, BLOG_AUTO_LOCALES, resolveBlogAiProvider, coerceJsonObject } from '../../api/_lib/blogAiProvider.js';

const prev = {
  BLOG_AI_PROVIDER: process.env.BLOG_AI_PROVIDER,
  BLOG_AI_API_URL: process.env.BLOG_AI_API_URL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
};

afterEach(() => {
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('resolveBlogAiProvider', () => {
  it('prefers explicit gemini provider', () => {
    process.env.BLOG_AI_PROVIDER = 'gemini';
    process.env.BLOG_AI_API_URL = 'https://custom.example/generate';
    expect(resolveBlogAiProvider()).toBe('gemini');
  });

  it('falls back to gemini when only GEMINI_API_KEY is set', () => {
    delete process.env.BLOG_AI_PROVIDER;
    delete process.env.BLOG_AI_API_URL;
    process.env.GEMINI_API_KEY = 'test-key';
    expect(resolveBlogAiProvider()).toBe('gemini');
  });

  it('uses custom when BLOG_AI_API_URL is set', () => {
    delete process.env.BLOG_AI_PROVIDER;
    process.env.BLOG_AI_API_URL = 'https://custom.example/generate';
    process.env.GEMINI_API_KEY = 'test-key';
    expect(resolveBlogAiProvider()).toBe('custom');
  });
});

describe('parseBlogAiResponse', () => {
  it('parses a valid multi-locale response with cover URL', () => {
    const raw = {
      tag: 'Tips',
      cover_image_url: 'https://example.com/cover.jpg',
      lt: { title: 'LT title', excerpt: 'LT ex', content: '# Hello' },
      en: { title: 'EN title', excerpt: 'EN ex', content: '# Hello EN' },
      pl: { title: 'PL title', excerpt: 'PL ex', content: '# Hello PL' },
    };
    const result = parseBlogAiResponse(raw);
    expect(result.tag).toBe('Tips');
    expect(result.coverImageUrl).toBe('https://example.com/cover.jpg');
    expect(result.locales.lt.title).toBe('LT title');
    expect(BLOG_AUTO_LOCALES.every((l) => result.locales[l].content)).toBe(true);
  });

  it('accepts base64 cover', () => {
    const raw = {
      cover_image_base64: 'abc123',
      cover_image_content_type: 'image/png',
      lt: { title: 'A', content: 'body' },
      en: { title: 'B', content: 'body' },
      pl: { title: 'C', content: 'body' },
    };
    const result = parseBlogAiResponse(raw);
    expect(result.coverImageBase64).toBe('abc123');
    expect(result.coverImageContentType).toBe('image/png');
  });

  it('throws when a locale block is missing', () => {
    expect(() =>
      parseBlogAiResponse({
        cover_image_url: 'https://x/y.jpg',
        lt: { title: 'A', content: 'x' },
        en: { title: 'B', content: 'x' },
      }),
    ).toThrow(/pl/);
  });

  it('throws without cover', () => {
    expect(() =>
      parseBlogAiResponse({
        lt: { title: 'A', content: 'x' },
        en: { title: 'B', content: 'x' },
        pl: { title: 'C', content: 'x' },
      }),
    ).toThrow(/cover/);
  });
});

describe('coerceJsonObject', () => {
  it('parses plain JSON', () => {
    expect(coerceJsonObject('{"tag":"Tips","n":1}')).toEqual({ tag: 'Tips', n: 1 });
  });

  it('parses JSON wrapped in ```json fences', () => {
    const text = '```json\n{"tag":"Tips"}\n```';
    expect(coerceJsonObject(text)).toEqual({ tag: 'Tips' });
  });

  it('parses JSON with stray prose around the object', () => {
    const text = 'Here is your article:\n{"tag":"Tips","ok":true}\nHope that helps!';
    expect(coerceJsonObject(text)).toEqual({ tag: 'Tips', ok: true });
  });

  it('throws on content with no JSON object', () => {
    expect(() => coerceJsonObject('totally not json')).toThrow(/not valid JSON/);
    expect(() => coerceJsonObject('')).toThrow(/not valid JSON/);
  });
});
