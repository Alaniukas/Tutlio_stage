/**
 * Custom AI blog generation provider.
 * Contract: POST BLOG_AI_API_URL with Bearer BLOG_AI_API_KEY.
 */

export const BLOG_AUTO_LOCALES = ['lt', 'en', 'pl'] as const;
export type BlogAutoLocale = (typeof BLOG_AUTO_LOCALES)[number];

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

/** Shared SEO writing rules — educational first, brand mentioned sparingly. */
export const BLOG_SEO_WRITING_RULES =
  'Write an informational SEO article (like nomora.io or hubspot blog), NOT a sales page.\n' +
  '- Title: keyword-first, natural, helpful (guide/checklist/tips). Do NOT put "Tutlio" in the title.\n' +
  '- Avoid titles like "Kaip [Brand] padeda…" or "…su Tutlio". Prefer "…: praktinis gidas", "…: patarimai korepetitoriams".\n' +
  '- 90%+ pure educational value: practical steps, checklists, mistakes to avoid, examples for tutors/parents.\n' +
  '- Mention Tutlio at most 1–2 times in the entire article, only in the last section or one soft contextual sentence.\n' +
  '- Never use hard-sell phrases: "mūsų platforma", "registruokitės dabar", "geriausia platforma", "tik su Tutlio".\n' +
  '- No product feature dumps. If mentioning software, keep it generic ("specializuota platforma", "tvarkaraščio įrankis").\n' +
  '- Include 5–7 ## H2 sections + ### H3 where useful; lists, numbered steps, optional > Pro tip: blockquote.\n' +
  '- Add one short FAQ section (###) with 2–3 questions if it fits the keyword.\n' +
  '- excerpt: reader benefit only, no brand name, no CTA.\n' +
  '- ~550–750 words per locale. LT primary; EN/PL natural adaptations.';

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

async function generateBlogWithGemini(options: BlogAiGenerateOptions): Promise<BlogAiGenerateResult> {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) throw new Error('GEMINI_API_KEY must be configured for Gemini blog generation');

  const model = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const prompt =
    `You are an expert SEO editor for a tutoring-industry blog (informational content, not ads).\n` +
    `Target keyword: "${options.keyword}"` +
    (options.tag ? ` (category: ${options.tag})` : '') +
    `\nBrand context (mention sparingly): Tutlio online tutoring platform.\n\n` +
    `Return ONLY valid JSON (no markdown fences):\n` +
    `{\n` +
    `  "tag": "short category",\n` +
    `  "lt": { "title": "...", "excerpt": "...", "content": "markdown body" },\n` +
    `  "en": { "title": "...", "excerpt": "...", "content": "markdown body" },\n` +
    `  "pl": { "title": "...", "excerpt": "...", "content": "markdown body" }\n` +
    `}\n\n` +
    BLOG_SEO_WRITING_RULES;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
        maxOutputTokens: 16384,
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

  const contentText = extractGeminiText(json);
  let parsedBodyRaw: unknown;
  try {
    parsedBodyRaw = JSON.parse(contentText);
  } catch {
    throw new Error(`Gemini content was not valid JSON: ${contentText.slice(0, 200)}`);
  }

  const parsedLocales = parseBlogAiResponse({
    ...(parsedBodyRaw as Record<string, unknown>),
    cover_image_url: geminiCoverPlaceholder(options.keyword),
  });

  const cover = await generateGeminiCoverImage({
    keyword: options.keyword,
    title: parsedLocales.locales.lt.title,
    tag: parsedLocales.tag,
  });

  return {
    ...parsedLocales,
    coverImageUrl: '',
    coverImageBase64: cover.base64,
    coverImageContentType: cover.contentType,
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
