/**
 * Custom AI blog generation provider.
 * Contract: POST BLOG_AI_API_URL with Bearer BLOG_AI_API_KEY.
 */

import { BLOG_SCHEMA_LOCALES, type BlogSchemaLocale } from '../../src/lib/i18n/localeRelease.js';
import { BLOG_AUTHOR_NAME } from '../../src/lib/blogAuthor.js';
import { LOCALE_FORMAT_TAGS } from '../../src/lib/i18n/locales.js';
import { extractBlogFaqs } from './blogFaq.js';
import { buildBlogCoverPrompt } from './blogCoverArt.js';
import {
  BLOG_FAQ_LABEL,
  BLOG_LOCALE_LANGUAGE,
  blogLocaleInternalPath,
  blogLocaleSeoInstructions,
} from './blogMarkets.js';

export const BLOG_AUTO_LOCALES = BLOG_SCHEMA_LOCALES;
export type BlogAutoLocale = BlogSchemaLocale;

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

export interface BlogLocaleQuality {
  wordCount: number;
  h2Count: number;
  faqCount: number;
  listItemCount: number;
}

function plainBlogText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/[*_`>#~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Unicode-aware word count, including languages that do not separate words with spaces. */
export function countBlogWords(markdown: string, locale: BlogAutoLocale): number {
  const plain = plainBlogText(markdown);
  if (!plain) return 0;
  const Segmenter = (Intl as unknown as { Segmenter?: new (
    locale?: string,
    options?: { granularity: 'word' },
  ) => { segment(input: string): Iterable<{ isWordLike?: boolean }> } }).Segmenter;
  if (Segmenter) {
    return Array.from(
      new Segmenter(LOCALE_FORMAT_TAGS[locale] || locale, { granularity: 'word' }).segment(plain),
    ).filter((segment) => segment.isWordLike).length;
  }
  return plain.match(/[\p{L}\p{N}]+/gu)?.length || 0;
}

/**
 * Reject thin or malformed AI copy before it can be persisted or published.
 * The model receives these validation failures on retry, so quality problems
 * are corrected rather than silently accepted.
 */
export function validateBlogLocaleArticle(
  locale: BlogAutoLocale,
  raw: unknown,
): BlogLocaleContent {
  const block = localeBlock(raw);
  if (!block) throw new Error(`${locale} article is missing title, excerpt, or content`);

  const problems: string[] = [];
  const wordCount = countBlogWords(block.content, locale);
  const h2Count = block.content.match(/^##\s+\S.+$/gm)?.length || 0;
  const faqCount = extractBlogFaqs(block.content).length;
  const listItemCount = block.content.match(/^(?:[-*+]\s+|\d+\.\s+)\S.+$/gm)?.length || 0;
  const paragraphCount = block.content
    .split(/\n\s*\n/)
    .filter((part) => !/^\s*(?:#|[-*+]\s+|\d+\.\s+)/.test(part) && plainBlogText(part).length >= 80)
    .length;
  const brandMentions = block.content.match(/\bTutlio\b/gi)?.length || 0;
  const internalLinks = Array.from(block.content.matchAll(/\]\((\/[^)\s]+)\)/g), (match) => match[1]);
  const allowedInternalLinks = new Set([
    blogLocaleInternalPath(locale, '/blog'),
    blogLocaleInternalPath(locale, '/pricing'),
  ]);
  const genericTitleTemplate = /\b(?:a practical guide|a comprehensive guide|the ultimate guide|maximize (?:your|their) potential|everything you need to know)\b/i;

  if (block.title.length < 8 || block.title.length > 90) problems.push('title must be 8-90 characters');
  if (/\bTutlio\b/i.test(block.title)) problems.push('title must not contain Tutlio');
  if (genericTitleTemplate.test(block.title)) problems.push('title uses a prohibited generic guide template');
  if (block.excerpt.length < 40 || block.excerpt.length > 220) problems.push('excerpt must be 40-220 characters');
  // These are runaway/thin-content guards, not SEO targets. The prompt tells
  // the editor to use only the length needed to satisfy the reader's intent.
  if (wordCount < 750 || wordCount > 2800) problems.push(`body must be 750-2800 words (got ${wordCount})`);
  if (h2Count < 4 || h2Count > 10) problems.push(`body must have 4-10 H2 sections (got ${h2Count})`);
  if (faqCount < 2 || faqCount > 4) problems.push(`native FAQ must have 2-4 answered questions (got ${faqCount})`);
  if (listItemCount < 3) problems.push(`body must include an actionable list with at least 3 items (got ${listItemCount})`);
  if (paragraphCount < 6) problems.push(`body must include at least 6 substantive paragraphs (got ${paragraphCount})`);
  if (/^#\s+/m.test(block.content)) problems.push('body must not contain an H1');
  if (brandMentions > 1) problems.push(`body may mention Tutlio at most once (got ${brandMentions})`);
  if (internalLinks.length > 1) problems.push(`body may contain at most one internal link (got ${internalLinks.length})`);
  for (const link of internalLinks) {
    if (!allowedInternalLinks.has(link)) {
      problems.push(`internal link ${link} must use the ${locale} locale path`);
    }
  }

  if (problems.length) {
    throw new Error(`${locale} article quality validation failed: ${problems.join('; ')}`);
  }
  return block;
}

/** Parse and validate the custom AI API JSON response. */
export function parseBlogAiResponse(raw: unknown): BlogAiGenerateResult {
  if (!raw || typeof raw !== 'object') throw new Error('AI response must be a JSON object');
  const body = raw as Record<string, unknown>;

  const locales = {} as Record<BlogAutoLocale, BlogLocaleContent>;
  for (const loc of BLOG_AUTO_LOCALES) {
    try {
      locales[loc] = validateBlogLocaleArticle(loc, body[loc]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`AI response missing or rejected "${loc}" block: ${message}`);
    }
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

/** Shared people-first SEO + AI-search rules — an education briefing, not a product page. */
export const BLOG_SEO_WRITING_RULES =
  `You write as ${BLOG_AUTHOR_NAME}, education-market editor at Tutlio (a tutoring-operations company).\n` +
  'Voice: calm, specific, slightly opinionated — like a briefing note from a school-operations director, not a growth blog.\n' +
  'The article is about education (parents, students, tutors, schools). Software is not the subject.\n\n' +
  'People-first SEO and generative-search visibility:\n' +
  '- First paragraph: 40–80 words that ANSWER the search query directly (no throat-clearing).\n' +
  '- Satisfy the main intent completely, then cover only genuinely useful follow-up decisions. Do not create sections merely to target query variants.\n' +
  '- Title: natural, specific search phrasing for THIS market. Never put Tutlio in the title. Never use reusable formulas such as "A Practical Guide", "A Comprehensive Guide", "Ultimate Guide", or "Maximize Your Potential".\n' +
  '- Use 4–9 ## H2 headings when the subject needs them. Vary the structure by topic; headings should name real questions, trade-offs, diagnostics, or decisions.\n' +
  '- One H2 is the required native-language FAQ, with 2–4 non-obvious ### questions whose concise answers add information not already repeated verbatim above.\n' +
  '- Include at least one actionable checklist or decision list with 3–7 items.\n' +
  '- Use only the length needed to solve the problem; most topics will need roughly 900–1600 words, but never pad to a word count.\n' +
  '- Add information gain: a defensible editorial thesis plus a concrete decision framework, diagnostic, worked example, trade-off, or operational insight that a generic summary would not provide.\n' +
  '- Clearly distinguish principles from examples. Never present an invented scenario as a real Tutlio customer story or as first-hand research.\n' +
  '- excerpt: 1–2 sentences of reader benefit, no brand, no CTA.\n\n' +
  'Facts:\n' +
  '- FORBIDDEN: invented percentages, surveys, "studies show", "research indicates", fake year-over-year lifts, unnamed "experts".\n' +
  '- Do not create external URLs from memory. If an approved source URL was not supplied in the brief, omit time-sensitive statistics, prices, deadlines, regulations, and exam rules; describe the durable mechanism in plain language instead.\n' +
  '- When a supplied source is used, name the primary institution and date, link the exact claim, and never cite an SEO article or AI-generated summary as evidence.\n' +
  '- Do not invent quotes, case studies, or customer names.\n\n' +
  'Anti-slop (never use): "in today\'s fast-paced world", "delve", "landscape", "unlock your potential", "leverage", "it\'s important to note", "as an AI", emoji, keyword stuffing, numbered "Top 7 secrets".\n\n' +
  'Brand:\n' +
  '- Mention Tutlio at most once, only if scheduling / parent communication / lesson admin is genuinely in the reader\'s problem. One short clause, no feature list.\n' +
  '- Zero required product links. Optional: a single relative link to /blog or /pricing if it is actually useful. Never /features/* dumps.\n' +
  '- No "sign up now", "best platform", "only with Tutlio".\n\n' +
  'Do not copy another locale word-for-word. Local exam names, school stages, and parent realities must match the market note.';

export type BlogAiProviderName = 'custom' | 'gemini';

export const DEFAULT_GEMINI_BLOG_MODEL = 'gemini-3.8-flash';
export const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';
const GEMINI_REQUEST_TIMEOUT_MS = 75_000;
const GEMINI_DEADLINE_BUFFER_MS = 5_000;

export function resolveGeminiTextModel(): string {
  return (process.env.GEMINI_MODEL || DEFAULT_GEMINI_BLOG_MODEL).trim();
}

async function fetchGemini(
  url: string,
  init: RequestInit,
  deadline?: number,
): Promise<Response> {
  const remaining = deadline === undefined
    ? GEMINI_REQUEST_TIMEOUT_MS
    : deadline - Date.now() - GEMINI_DEADLINE_BUFFER_MS;
  if (remaining <= 0) throw new Error('Gemini generation deadline reached');

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.min(GEMINI_REQUEST_TIMEOUT_MS, remaining),
  );
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

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
  concept?: string;
  deadline?: number;
}): Promise<{ base64: string; contentType: string }> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY must be configured for cover image generation');

  const configured = (process.env.GEMINI_IMAGE_MODEL || '').trim();
  const models = [...new Set([configured, DEFAULT_GEMINI_IMAGE_MODEL].filter(Boolean))];

  const { prompt } = buildBlogCoverPrompt(options);

  let lastError = 'unknown error';

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetchGemini(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          responseFormat: { image: { aspectRatio: '16:9', imageSize: '1K' } },
        },
      }),
    }, options.deadline);

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
  editorialThesis: string;
  informationGain: string;
  coverConcept: string;
  angles: Partial<Record<BlogAutoLocale, string>>;
}

export function parseEditorialBrief(raw: unknown): BlogEditorialBrief {
  if (!raw || typeof raw !== 'object') throw new Error('Brief must be a JSON object');
  const o = raw as Record<string, unknown>;
  const topic = String(o.topic || '').trim();
  if (!topic) throw new Error('Brief missing topic');
  const tag = String(o.tag || 'Education').trim() || 'Education';
  const editorialThesis = String(o.editorialThesis || o.editorial_thesis || '').trim();
  if (editorialThesis.length < 40) throw new Error('Brief missing a defensible editorial thesis');
  const informationGain = String(o.informationGain || o.information_gain || '').trim();
  if (informationGain.length < 60) throw new Error('Brief missing a concrete information-gain plan');
  const coverConcept = String(o.coverConcept || o.cover_concept || '').trim();
  if (coverConcept.length < 40) throw new Error('Brief missing a specific visual cover concept');
  const angles: Partial<Record<BlogAutoLocale, string>> = {};
  const rawAngles = o.angles && typeof o.angles === 'object' ? (o.angles as Record<string, unknown>) : {};
  for (const loc of BLOG_AUTO_LOCALES) {
    const a = String(rawAngles[loc] || '').trim();
    if (a.length >= 40) angles[loc] = a;
  }
  const missing = BLOG_AUTO_LOCALES.filter((loc) => !angles[loc]);
  if (missing.length) throw new Error(`Brief missing substantive market angles: ${missing.join(', ')}`);
  return { tag, topic, editorialThesis, informationGain, coverConcept, angles };
}

function geminiEndpoint(apiKey: string): string {
  const model = resolveGeminiTextModel();
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

/** Gemini 3.8 supports structured output and thinking, but not legacy sampling knobs. */
export function geminiBlogGenerationConfig(maxOutputTokens: number) {
  return {
    responseMimeType: 'application/json',
    maxOutputTokens,
    thinkingConfig: { thinkingLevel: 'medium' },
  } as const;
}

async function requestGeminiJson(
  prompt: string,
  maxOutputTokens: number,
  deadline?: number,
): Promise<Record<string, unknown>> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY must be configured for Gemini blog generation');

  const url = geminiEndpoint(apiKey);
  const resp = await fetchGemini(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: geminiBlogGenerationConfig(maxOutputTokens),
    }),
  }, deadline);

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

async function requestGeminiJsonWithRetry<T = Record<string, unknown>>(
  prompt: string,
  maxOutputTokens: number,
  validate?: (raw: Record<string, unknown>) => T,
  deadline?: number,
): Promise<T> {
  let lastError = 'unknown error';
  let attemptPrompt = prompt;
  for (let attempt = 1; attempt <= GEMINI_BLOG_MAX_ATTEMPTS; attempt++) {
    if (deadline !== undefined && Date.now() >= deadline - GEMINI_DEADLINE_BUFFER_MS) {
      lastError = 'generation deadline reached';
      break;
    }
    try {
      const raw = await requestGeminiJson(attemptPrompt, maxOutputTokens, deadline);
      return validate ? validate(raw) : raw as T;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn(`[blog-ai] Gemini attempt ${attempt}/${GEMINI_BLOG_MAX_ATTEMPTS} failed: ${lastError}`);
      attemptPrompt = `${prompt}\n\nYour previous attempt was rejected: ${lastError}\nRegenerate the complete article and correct every listed issue. Return JSON only.`;
    }
  }
  throw new Error(`Gemini blog generation failed after ${GEMINI_BLOG_MAX_ATTEMPTS} attempts: ${lastError}`);
}

export async function generateBlogEditorialBrief(
  options: BlogAiGenerateOptions,
  deadline?: number,
): Promise<BlogEditorialBrief> {
  const localeKeys = BLOG_AUTO_LOCALES.join(', ');
  const prompt =
    `You are ${BLOG_AUTHOR_NAME}, education-market editor at Tutlio. Produce a research brief for native articles (not translations).\n` +
    `Topic seed: "${options.keyword}"` +
    (options.tag ? ` (category: ${options.tag})` : '') +
    `\n\nReturn JSON: { "tag": "short category", "topic": "one English sentence naming the reader problem", "editorialThesis": "one useful, defensible and slightly opinionated answer to the reader problem", "informationGain": "a concrete decision framework, diagnostic, trade-off or tutoring-operations insight that goes beyond generic search summaries without inventing data or experience", "coverConcept": "one specific text-free visual metaphor unique to this topic; no dashboards, icon clouds, calendars, charts, checklists, words, or logos", "angles": { "<locale>": "3-5 compact editor instructions covering the target reader and dominant intent, one natural native query theme plus related entities, the local information gap and decision, realistic examples, units/currency, and what must not be translated literally" } }\n` +
    `Locales in angles (all required): ${localeKeys}.\n` +
    `No statistics. No product pitch. No Tutlio mention in the brief.`;

  return requestGeminiJsonWithRetry(prompt, 12288, parseEditorialBrief, deadline);
}

export async function generateBlogLocaleArticle(options: {
  keyword: string;
  tag?: string;
  locale: BlogAutoLocale;
  brief: BlogEditorialBrief;
  deadline?: number;
}): Promise<BlogLocaleContent> {
  const loc = options.locale;
  const language = BLOG_LOCALE_LANGUAGE[loc];
  const angle = options.brief.angles[loc] || options.brief.topic;
  const faqHeading = BLOG_FAQ_LABEL[loc];
  const localeSeo = blogLocaleSeoInstructions(loc, angle);

  const prompt =
    `You are ${BLOG_AUTHOR_NAME}, education-market editor at Tutlio. Write ONE original ${language} article.\n` +
    `Write the entire JSON values (title, excerpt, content) in ${language} only.\n` +
    `Topic seed: "${options.keyword}"\n` +
    `Shared topic: ${options.brief.topic}\n` +
    `Editorial thesis to prove usefully: ${options.brief.editorialThesis}\n` +
    `Required information gain: ${options.brief.informationGain}\n` +
    `${localeSeo}\n\n` +
    `Return JSON only: { "title": "...", "excerpt": "...", "content": "markdown body" }\n` +
    `The content must contain 4-9 useful ## sections in total, including exactly "## ${faqHeading}" with 2-4 answered ### questions.\n` +
    `Include at least one practical checklist or decision list with 3-7 items. Every section must give a concrete recommendation, decision rule, diagnostic question, or realistic example; remove generic filler.\n\n` +
    BLOG_SEO_WRITING_RULES;

  return requestGeminiJsonWithRetry(
    prompt,
    16384,
    (raw) => validateBlogLocaleArticle(loc, raw),
    options.deadline,
  );
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
    concept: brief.coverConcept,
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
    localeInstructions: Object.fromEntries(
      BLOG_AUTO_LOCALES.map((locale) => [
        locale,
        blogLocaleSeoInstructions(
          locale,
          `Identify and satisfy the dominant native search intent for "${options.keyword}" in this market`,
        ),
      ]),
    ),
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
