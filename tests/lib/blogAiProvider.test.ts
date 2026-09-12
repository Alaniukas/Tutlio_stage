import { describe, expect, it, afterEach } from 'vitest';
import {
  BLOG_AUTO_LOCALES,
  DEFAULT_GEMINI_BLOG_MODEL,
  DEFAULT_GEMINI_IMAGE_MODEL,
  coerceJsonObject,
  countBlogWords,
  geminiBlogGenerationConfig,
  parseBlogAiResponse,
  parseEditorialBrief,
  resolveBlogAiProvider,
  resolveGeminiTextModel,
  validateBlogLocaleArticle,
} from '../../api/_lib/blogAiProvider.js';
import {
  BLOG_LOCALE_LANGUAGE,
  BLOG_MARKET_NOTES,
  BLOG_TITLE_CONVENTIONS,
  BLOG_TRANSLATION_ARTIFACT_RULES,
  blogLocaleInternalPath,
  blogLocaleSeoInstructions,
} from '../../api/_lib/blogMarkets.js';

const QUALITY_PARAGRAPH = Array.from(
  { length: 32 },
  (_, i) => `practical${i} guidance helps families make a specific decision`,
).join(' ');

const QUALITY_ARTICLE = [
  `## What problem should the family solve?\n\n${QUALITY_PARAGRAPH}`,
  `## How should the first two weeks work?\n\n${QUALITY_PARAGRAPH}`,
  `## Which warning signs matter?\n\n${QUALITY_PARAGRAPH}`,
  `## A practical checklist\n\n${QUALITY_PARAGRAPH}\n\n- Agree one measurable goal\n- Review school work together\n- Reassess the plan after two weeks`,
  `## Frequently Asked Questions\n\n### When should we start?\n\nStart when the difficulty repeats across several assignments and the student can name the obstacle.\n\n### How often should lessons happen?\n\nChoose a rhythm the student can sustain and review it against actual school work.\n\n### How do we know it is helping?\n\nLook for greater independence, clearer explanations, and fewer repeated mistakes rather than one test score.`,
].join('\n\n');

function allLocaleBlocks() {
  return Object.fromEntries(
    BLOG_AUTO_LOCALES.map((l) => [l, {
      title: `${l} tutoring decision framework`,
      excerpt: `A concrete ${l} article that helps families diagnose the learning problem and choose useful support.`,
      content: QUALITY_ARTICLE,
    }]),
  );
}

function allLocaleAngles() {
  return Object.fromEntries(
    BLOG_AUTO_LOCALES.map((locale) => [
      locale,
      `${locale} families need locally specific school terminology, realistic decisions, and practical examples.`,
    ]),
  );
}

const prev = {
  BLOG_AI_PROVIDER: process.env.BLOG_AI_PROVIDER,
  BLOG_AI_API_URL: process.env.BLOG_AI_API_URL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
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

describe('Gemini blog model', () => {
  it('uses stable Gemini 3.8 Flash by default and still permits an explicit override', () => {
    delete process.env.GEMINI_MODEL;
    expect(DEFAULT_GEMINI_BLOG_MODEL).toBe('gemini-3.8-flash');
    expect(resolveGeminiTextModel()).toBe('gemini-3.8-flash');
    process.env.GEMINI_MODEL = 'gemini-test-model';
    expect(resolveGeminiTextModel()).toBe('gemini-test-model');
  });

  it('uses current model-compatible generation settings', () => {
    expect(DEFAULT_GEMINI_IMAGE_MODEL).toBe('gemini-3.1-flash-image');
    const config = geminiBlogGenerationConfig(16_384);
    expect(config.responseMimeType).toBe('application/json');
    expect(config.maxOutputTokens).toBe(16_384);
    expect(config.thinkingConfig.thinkingLevel).toBe('medium');
    expect(config).not.toHaveProperty('temperature');
    expect(config).not.toHaveProperty('topP');
    expect(config).not.toHaveProperty('topK');
  });
});

describe('parseBlogAiResponse', () => {
  it('parses a valid multi-locale response with cover URL', () => {
    const raw = {
      tag: 'Tips',
      cover_image_url: 'https://example.com/cover.jpg',
      ...allLocaleBlocks(),
    };
    const result = parseBlogAiResponse(raw);
    expect(result.tag).toBe('Tips');
    expect(result.coverImageUrl).toBe('https://example.com/cover.jpg');
    expect(result.locales.lt.title).toBe('lt tutoring decision framework');
    expect(BLOG_AUTO_LOCALES).toHaveLength(36);
    expect(BLOG_AUTO_LOCALES.every((l) => result.locales[l].content)).toBe(true);
  });

  it('accepts base64 cover', () => {
    const raw = {
      cover_image_base64: 'abc123',
      cover_image_content_type: 'image/png',
      ...allLocaleBlocks(),
    };
    const result = parseBlogAiResponse(raw);
    expect(result.coverImageBase64).toBe('abc123');
    expect(result.coverImageContentType).toBe('image/png');
  });

  it('throws when a locale block is missing', () => {
    const blocks = allLocaleBlocks() as Record<string, unknown>;
    delete blocks.pl;
    expect(() =>
      parseBlogAiResponse({
        cover_image_url: 'https://x/y.jpg',
        ...blocks,
      }),
    ).toThrow(/pl/);
  });

  it('throws without cover', () => {
    expect(() => parseBlogAiResponse(allLocaleBlocks())).toThrow(/cover/);
  });
});

describe('parseEditorialBrief', () => {
  it('requires a topic and keeps locale angles', () => {
    const brief = parseEditorialBrief({
      tag: 'Parents',
      topic: 'When tutoring helps',
      editorialThesis: 'Tutoring works best after the family identifies the precise learning bottleneck.',
      informationGain: 'Use a three-part diagnostic that separates missing knowledge, inconsistent practice, and a mismatch in teaching approach.',
      coverConcept: 'A student crossing a small paper bridge toward a clearly organised study space.',
      angles: allLocaleAngles(),
    });
    expect(brief.topic).toBe('When tutoring helps');
    expect(brief.editorialThesis).toMatch(/learning bottleneck/);
    expect(brief.informationGain).toMatch(/three-part diagnostic/);
    expect(brief.coverConcept).toMatch(/paper bridge/);
    expect(brief.angles.lt).toContain('lt families');
    expect(brief.angles.de).toContain('de families');
  });

  it('rejects a brief that would make any locale fall back to a generic angle', () => {
    expect(() => parseEditorialBrief({
      tag: 'Parents',
      topic: 'When tutoring helps',
      editorialThesis: 'Tutoring works best after the family identifies the precise learning bottleneck.',
      informationGain: 'Use a three-part diagnostic that separates missing knowledge, inconsistent practice, and a mismatch in teaching approach.',
      coverConcept: 'A student crossing a small paper bridge toward a clearly organised study space.',
      angles: { en: 'English families need a specific and practical article angle.' },
    })).toThrow(/lt/);
  });

  it('rejects a generic brief without a usable cover concept', () => {
    expect(() => parseEditorialBrief({
      tag: 'Parents',
      topic: 'When tutoring helps',
      editorialThesis: 'Tutoring works best after the family identifies the precise learning bottleneck.',
      informationGain: 'Use a three-part diagnostic that separates missing knowledge, inconsistent practice, and a mismatch in teaching approach.',
      coverConcept: 'Education icons',
      angles: allLocaleAngles(),
    })).toThrow(/visual cover concept/);
  });

  it('rejects briefs without an editorial thesis or information gain', () => {
    expect(() => parseEditorialBrief({
      tag: 'Parents',
      topic: 'When tutoring helps',
      editorialThesis: 'Tutoring is useful.',
      informationGain: 'Some tips.',
      coverConcept: 'A student crossing a small paper bridge toward a clearly organised study space.',
      angles: allLocaleAngles(),
    })).toThrow(/editorial thesis/);
  });
});

describe('locale-specific SEO instructions', () => {
  it.each(BLOG_AUTO_LOCALES)('%s receives an independent localization brief', (locale) => {
    const angle = `${locale} readers want a concrete decision guide grounded in their own school system.`;
    const instructions = blogLocaleSeoInstructions(locale, angle);
    expect(instructions).toContain('write independently, do not translate an English article');
    expect(instructions).toContain(`Search intent: ${angle}`);
    expect(instructions).toContain(`Terminology: ${BLOG_MARKET_NOTES[locale]}`);
    expect(instructions).toContain(BLOG_LOCALE_LANGUAGE[locale]);
    expect(instructions).toContain(BLOG_TITLE_CONVENTIONS[locale]);
    expect(instructions).toContain(BLOG_TRANSLATION_ARTIFACT_RULES[locale]);
    expect(instructions).toContain(blogLocaleInternalPath(locale, '/blog'));
    expect(instructions).toContain(blogLocaleInternalPath(locale, '/pricing'));
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

describe('validateBlogLocaleArticle', () => {
  it('accepts a substantive, structured and actionable native article', () => {
    const result = validateBlogLocaleArticle('en', {
      title: 'When private tutoring is the right next step',
      excerpt: 'A practical way to identify the real learning problem and decide what support will help.',
      content: QUALITY_ARTICLE,
    });
    expect(result.title).toMatch(/private tutoring/);
    expect(countBlogWords(result.content, 'en')).toBeGreaterThanOrEqual(750);
  });

  it('rejects thin generic copy before it can be stored', () => {
    expect(() => validateBlogLocaleArticle('en', {
      title: 'Tutlio tutoring tips',
      excerpt: 'Short excerpt',
      content: '## Tips\n\nTry harder.\n\n## FAQ\n\n### Why?\nBecause.',
    })).toThrow(/quality validation failed/);
  });

  it('rejects the generic title formulas repeated by commodity SEO articles', () => {
    expect(() => validateBlogLocaleArticle('en', {
      title: 'Private tutoring: A Comprehensive Guide',
      excerpt: 'A useful way to identify the real learning problem and choose appropriate support.',
      content: QUALITY_ARTICLE,
    })).toThrow(/generic guide template/);
  });

  it('rejects an internal link that loses the target locale', () => {
    expect(() => validateBlogLocaleArticle('he', {
      title: 'איך לבחור תמיכה לימודית שמתאימה לתלמיד',
      excerpt: 'מדריך מעשי להורים שרוצים לזהות את הקושי ולבחור תמיכה מתאימה בלי פתרונות כלליים.',
      content: `${QUALITY_ARTICLE}\n\n[מידע נוסף](/pricing)`,
    })).toThrow(/must use the he locale path/);
  });
});
