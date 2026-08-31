/**
 * Custom AI blog generation provider.
 * Contract: POST BLOG_AI_API_URL with Bearer BLOG_AI_API_KEY.
 */

import { LOCALES, type Locale } from './seo-routing.js';
import { BLOG_AUTHOR_NAME } from '../../src/lib/blogAuthor.js';
import { BLOG_LOCALE_LANGUAGE, BLOG_MARKET_NOTES } from './blogMarkets.js';

export const BLOG_AUTO_LOCALES = LOCALES;
export type BlogAutoLocale = Locale;

export interface BlogLocaleContent {
  title: string;
  excerpt: string;
  content: string;
}

export interface BlogAiGenerateResult {
  tag: string;
  coverImageUrl: string;
  coverImageBase64?: string;
  coverImageContentType?: string;
  locales: Record<BlogAutoLocale, BlogLocaleContent>;
}

function localeBlock(raw: unknown): BlogLocaleContent | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const title = String(o.title || '').trim();
  const excerpt = String(o.excerpt || '').trim();
  const content = String(o.content || '').trim();
  if (!title || !content) return null;
  return { title, excerpt: excerpt || title.slice(0, 160), content };
}

/** Parse and validate the custom AI API JSON response. */
export function parseBlogAiResponse(raw: unknown): BlogAiGenerateResult {
  if (!raw || typeof raw !== 'object') throw new Error('AI response must be a JSON object');
  const body = raw as Record<string, unknown>;

  const locales = {} as Record<BlogAutoLocale, BlogLocaleContent>;
  for (const loc of BLOG_AUTO_LOCALES) {
    const block = localeBlock(body[loc]);
    if (!block) throw new Error(`AI response missing valid "${loc}" block (title + content)`);
    locales[loc] = block;
  }

  const tag = String(body.tag || 'SEO').trim() || 'SEO';
  const coverImageUrl = String(body.cover_image_url || '').trim();
  const coverImageBase64 = String(body.cover_image_base64 || '').trim();
  const coverImageContentType = String(body.cover_image_content_type || 'image/webp').trim();

  if (!coverImageUrl && !coverImageBase64) {
    throw new Error('AI response must include cover_image_url or cover_image_base64');
  }

  return {
    tag,
    coverImageUrl,
    coverImageBase64: coverImageBase64 || undefined,
    coverImageContentType: coverImageBase64 ? coverImageContentType : undefined,
    locales,
  };
}

export interface BlogAiGenerateOptions {
  keyword: string;
  tag?: string;
}

/** Shared SEO + GEO writing rules — education briefing, not a product page. */
export const BLOG_SEO_WRITING_RULES =
  `You write as ${BLOG_AUTHOR_NAME}, education-market editor at Tutlio (a tutoring-operations company).\n` +
  'Voice: calm, specific, slightly opinionated — like a briefing note from a school-operations director, not a growth blog.\n' +
  'The article is about education (parents, students, tutors, schools). Software is not the subject.\n\n' +
  'GEO / SEO:\n' +
  '- First paragraph: 40–80 words that ANSWER the search query directly (no throat-clearing).\n' +
  '- Title: natural search phrasing for THIS market. Never put Tutlio in the title.\n' +
  '- 5–8 ## H2 headings that sound like real questions or decisions ("When to hire…", "What to check after 6 weeks").\n' +
  '- One ## FAQ (or local equivalent: DUK / Często zadawane pytania / Häufige Fragen…) with 3 ### questions whose answers are 2–4 sentences each.\n' +
  '- 1200–1800 words. Concrete steps, checklists, failure modes, what to ignore.\n' +
  '- excerpt: 1–2 sentences of reader benefit, no brand, no CTA.\n\n' +
  'Facts:\n' +
  '- FORBIDDEN: invented percentages, surveys, "studies show", "research indicates", fake year-over-year lifts, unnamed "experts".\n' +
  '- If you cannot name a real public source (OECD, Eurostat, a ministry, a named exam board) and a real year, describe the mechanism in plain language instead of a number.\n' +
  '- Do not invent quotes, case studies, or customer names.\n\n' +
  'Anti-slop (never use): "in today\'s fast-paced world", "delve", "landscape", "unlock your potential", "leverage", "it\'s important to note", "as an AI", emoji, keyword stuffing, numbered "Top 7 secrets".\n\n' +
  'Brand:\n' +
  '- Mention Tutlio at most once, only if scheduling / parent communication / lesson admin is genuinely in the reader\'s problem. One short clause, no feature list.\n' +
  '- Zero required product links. Optional: a single relative link to /blog or /pricing if it is actually useful. Never /features/* dumps.\n' +
  '- No "sign up now", "best platform", "only with Tutlio".\n\n' +
  'Do not copy another locale word-for-word. Local exam names, school stages, and parent realities must match the market note.';

export type BlogAiProviderName = 'custom' | 'gemini';

/** Which backend generates blog content (custom HTTP API vs Gemini). */
export function resolveBlogAiProvider(): BlogAiProviderName {
  const explicit = (process.env.BLOG_AI_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'gemini') return 'gemini';
  if (explicit === 'custom') return 'custom';

  const apiUrl = (process.env.BLOG_AI_API_URL || '').trim();
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (apiUrl) return 'custom';
  if (geminiKey) return 'gemini';
  return 'custom';
}

function geminiCoverPlaceholder(keyword: string): string {
  const seed = encodeURIComponent(keyword.toLowerCase().replace(/\s+/g, '-').slice(0, 40));
  return `https://picsum.photos/seed/tutlio-${seed}/1200/630`;
}

function extractGeminiImagePart(json: unknown): { data: string; mimeType: string } | null {
  if (!json || typeof json !== 'object') return null;
  const candidates = (json as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }> }).candidates;
  if (!Array.isArray(candidates)) return null;
  for (const part of candidates[0]?.content?.parts || []) {
    const data = part.inlineData?.data;
    if (data) {
      return { data, mimeType: part.inlineData?.mimeType || 'image/png' };
    }
  }
  return null;
}

export async function generateGeminiCoverImage(options: {
  keyword: string;
  title: string;
  tag?: string;
}): Promise<{ base64: string; contentType: string }> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY must be configured for cover image generation');

  const configured = (process.env.GEMINI_IMAGE_MODEL || '').trim();
  const models = [...new Set([configured, 'gemini-2.5-flash-image', 'gemini-2.0-flash-preview-image-generation'].filter(Boolean))];

  const prompt =
    `Generate ONE single blog hero illustration (NOT a photo, NOT a collage).\n` +
    `Topic: "${options.keyword}" — online tutoring / education context.\n` +
    `Visual mood for article: "${options.title}"` +
    (options.tag ? `\nCategory: ${options.tag}` : '') +
    `\n\nColor palette: indigo #4F46E5, violet #8B5CF6, white, soft gradients (Tutlio brand feel without logos).\n\n` +
    `REQUIRED:\n` +
    `- Flat vector SaaS-style illustration, ONE unified scene\n` +
    `- Topic icons only (calendar, video lesson, student progress, checklist) — educational, not promotional\n` +
    `- 16:9 hero, clean, airy, professional\n\n` +
    `FORBIDDEN:\n` +
    `- ANY readable text, words, letters, logos, brand names, article titles on the image\n` +
    `- "Tutlio", watermarks, UI screenshots, photorealistic photos\n` +
    `- Collage, grid, triptych, multiple panels`;

  let lastError = 'unknown error';

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio: '16:9' },
        },
      }),
    });

    const rawText = await resp.text();
    let json: unknown;
    try {
      json = JSON.parse(rawText);
    } catch {
      lastError = `model ${model}: non-JSON (${resp.status})`;
      continue;
    }

    if (!resp.ok) {
      const msg =
        json && typeof json === 'object' && 'error' in json
          ? String((json as { error: { message?: string } }).error?.message || rawText.slice(0, 160))
          : rawText.slice(0, 160);
      lastError = `model ${model}: ${msg}`;
      continue;
    }

    const img = extractGeminiImagePart(json);
    if (img) {
      return { base64: img.data, contentType: img.mimeType || 'image/png' };
    }
    lastError = `model ${model}: no image in response`;
  }

  throw new Error(`Gemini cover image generation failed: ${lastError}`);
}

function extractGeminiText(json: unknown): string {
  if (!json || typeof json !== 'object') throw new Error('Gemini returned empty response');
  const root = json as Record<string, unknown>;
  const candidates = root.candidates;
  if (!Array.isArray(candidates) || !candidates[0]) {
    const msg = root.error && typeof root.error === 'object'
      ? String((root.error as { message?: unknown }).message || 'Gemini error')
      : 'Gemini returned no candidates';
    throw new Error(msg);
  }
  const content = (candidates[0] as { content?: { parts?: Array<{ text?: string }> } }).content;
  const text = content?.parts?.map((p) => p.text || '').join('').trim();
  if (!text) throw new Error('Gemini returned no text content');
  return text;
}

/** How many times to ask Gemini for the article before giving up (it occasionally truncates JSON). */
const GEMINI_BLOG_MAX_ATTEMPTS = 3;

/**
 * Tolerantly turn model text into a JSON object. Handles the common ways a model
 * wraps JSON: as-is, inside ```json fences, or with stray prose around the object.
 */
export function coerceJsonObject(text: string): Record<string, unknown> {
  const trimmed = (text || '').trim();
  const candidates = [trimmed];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // try the next shape
    }
  }
  throw new Error(`content was not valid JSON: ${trimmed.slice(0, 200)}`);
}

export interface BlogEditorialBrief {
  tag: string;
  topic: string;
  angles: Partial<Record<BlogAutoLocale, string>>;
}

export function parseEditorialBrief(raw: unknown): BlogEditorialBrief {
  if (!raw || typeof raw !== 'object') throw new Error('Brief must be a JSON object');
  const o = raw as Record<string, unknown>;
  const topic = String(o.topic || '').trim();
  if (!topic) throw new Error('Brief missing topic');
  const tag = String(o.tag || 'Education').trim() || 'Education';
  const angles: Partial<Record<BlogAutoLocale, string>> = {};
  const rawAngles = o.angles && typeof o.angles === 'object' ? (o.angles as Record<string, unknown>) : {};
  for (const loc of BLOG_AUTO_LOCALES) {
    const a = String(rawAngles[loc] || '').trim();
    if (a) angles[loc] = a;
  }
  return { tag, topic, angles };
}

function geminiEndpoint(apiKey: string): string {
  const model = (process.env.GEMINI_MODEL || 'gemini-2.5-pro').trim();
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

async function requestGeminiJson(prompt: string, maxOutputTokens: number): Promise<Record<string, unknown>> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY must be configured for Gemini blog generation');

  const url = geminiEndpoint(apiKey);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.75,
        maxOutputTokens,
      },
    }),
  });

  const rawText = await resp.text();
  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    throw new Error(`Gemini returned non-JSON (${resp.status}): ${rawText.slice(0, 200)}`);
  }

  if (!resp.ok) {
    const msg =
      json && typeof json === 'object' && 'error' in json
        ? String((json as { error: { message?: string } }).error?.message || rawText.slice(0, 200))
        : rawText.slice(0, 200);
    throw new Error(`Gemini API error ${resp.status}: ${msg}`);
  }

  return coerceJsonObject(extractGeminiText(json));
}

async function requestGeminiJsonWithRetry(prompt: string, maxOutputTokens: number): Promise<Record<string, unknown>> {
  let lastError = 'unknown error';
  for (let attempt = 1; attempt <= GEMINI_BLOG_MAX_ATTEMPTS; attempt++) {
    try {
      return await requestGeminiJson(prompt, maxOutputTokens);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn(`[blog-ai] Gemini attempt ${attempt}/${GEMINI_BLOG_MAX_ATTEMPTS} failed: ${lastError}`);
    }
  }
  throw new Error(`Gemini blog generation failed after ${GEMINI_BLOG_MAX_ATTEMPTS} attempts: ${lastError}`);
}

export async function generateBlogEditorialBrief(options: BlogAiGenerateOptions): Promise<BlogEditorialBrief> {
  const localeKeys = BLOG_AUTO_LOCALES.join(', ');
  const prompt =
    `You are ${BLOG_AUTHOR_NAME}, education-market editor at Tutlio. Produce a research brief for native articles (not translations).\n` +
    `Topic seed: "${options.keyword}"` +
    (options.tag ? ` (category: ${options.tag})` : '') +
    `\n\nReturn JSON: { "tag": "short category", "topic": "one English sentence naming the reader problem", "angles": { "<locale>": "2-3 sentences: local exam/school vocabulary, who the reader is, what NOT to copy from other markets" } }\n` +
    `Locales in angles (all required): ${localeKeys}.\n` +
    `No statistics. No product pitch. No Tutlio mention in the brief.`;

  const raw = await requestGeminiJsonWithRetry(prompt, 8192);
  return parseEditorialBrief(raw);
}

export async function generateBlogLocaleArticle(options: {
  keyword: string;
  tag?: string;
  locale: BlogAutoLocale;
  brief: BlogEditorialBrief;
}): Promise<BlogLocaleContent> {
  const loc = options.locale;
  const language = BLOG_LOCALE_LANGUAGE[loc];
  const market = BLOG_MARKET_NOTES[loc];
  const angle = options.brief.angles[loc] || options.brief.topic;

  const prompt =
    `You are ${BLOG_AUTHOR_NAME}, education-market editor at Tutlio. Write ONE original ${language} article.\n` +
    `Write the entire JSON values (title, excerpt, content) in ${language} only.\n` +
    `Topic seed: "${options.keyword}"\n` +
    `Shared topic: ${options.brief.topic}\n` +
    `This market angle: ${angle}\n` +
    `Market note: ${market}\n\n` +
    `Return JSON: { "title": "...", "excerpt": "...", "content": "markdown body with ## H2 headings and a FAQ section" }\n\n` +
    BLOG_SEO_WRITING_RULES;

  const raw = await requestGeminiJsonWithRetry(prompt, 12288);
  const block = localeBlock(raw);
  if (!block) throw new Error(`Gemini ${loc} article missing title + content`);
  return block;
}

async function generateBlogWithGemini(options: BlogAiGenerateOptions): Promise<BlogAiGenerateResult> {
  const brief = await generateBlogEditorialBrief(options);
  const locales = {} as Record<BlogAutoLocale, BlogLocaleContent>;
  for (const loc of BLOG_AUTO_LOCALES) {
    locales[loc] = await generateBlogLocaleArticle({
      keyword: options.keyword,
      tag: options.tag || brief.tag,
      locale: loc,
      brief,
    });
  }

  const coverTitle = locales.lt?.title || locales.en?.title || options.keyword;
  const cover = await generateGeminiCoverImage({
    keyword: options.keyword,
    title: coverTitle,
    tag: brief.tag,
  }).catch((e) => {
    console.warn('[blog-ai] cover image failed, using placeholder:', e);
    return null;
  });

  return {
    tag: brief.tag,
    coverImageUrl: cover ? '' : geminiCoverPlaceholder(options.keyword),
    coverImageBase64: cover?.base64,
    coverImageContentType: cover?.contentType,
    locales,
  };
}

export async function generateBlogWithAi(options: BlogAiGenerateOptions): Promise<BlogAiGenerateResult> {
  if (resolveBlogAiProvider() === 'gemini') {
    return generateBlogWithGemini(options);
  }

  const apiUrl = (process.env.BLOG_AI_API_URL || '').trim();
  const apiKey = (process.env.BLOG_AI_API_KEY || '').trim();
  if (!apiUrl || !apiKey) {
    throw new Error('BLOG_AI_API_URL and BLOG_AI_API_KEY must be configured (or set BLOG_AI_PROVIDER=gemini with GEMINI_API_KEY)');
  }

  const imageUrl = (process.env.BLOG_AI_IMAGE_URL || '').trim();

  const payload = {
    keyword: options.keyword,
    tag: options.tag || '',
    locales: [...BLOG_AUTO_LOCALES],
    brand: 'Tutlio',
    instructions: BLOG_SEO_WRITING_RULES,
  };

  const resp = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`AI API returned non-JSON (${resp.status}): ${text.slice(0, 200)}`);
  }

  if (!resp.ok) {
    const errMsg =
      json && typeof json === 'object' && 'error' in json
        ? String((json as { error: unknown }).error)
        : text.slice(0, 200);
    throw new Error(`AI API error ${resp.status}: ${errMsg}`);
  }

  let parsed = parseBlogAiResponse(json);

  if (!parsed.coverImageUrl && !parsed.coverImageBase64 && imageUrl) {
    const imgResp = await fetch(imageUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ keyword: options.keyword, title: parsed.locales.lt.title }),
    });
    const imgJson = (await imgResp.json().catch(() => ({}))) as Record<string, unknown>;
    if (imgResp.ok) {
      if (imgJson.cover_image_url) {
        parsed = { ...parsed, coverImageUrl: String(imgJson.cover_image_url) };
      } else if (imgJson.cover_image_base64) {
        parsed = {
          ...parsed,
          coverImageBase64: String(imgJson.cover_image_base64),
          coverImageContentType: String(imgJson.cover_image_content_type || 'image/webp'),
        };
      }
    }
  }

  if (!parsed.coverImageUrl && !parsed.coverImageBase64) {
    throw new Error('No cover image in AI response and BLOG_AI_IMAGE_URL did not return one');
  }

  return parsed;
}
