/**
 * Owner side of the public landing page.
 *
 *   GET    /api/public-page-admin            → the caller's page, created on first call
 *   PATCH  /api/public-page-admin            → update editable fields
 *   POST   /api/public-page-admin?action=image → upload an avatar / cover
 *
 * Everything is keyed off the Bearer token, never off a client-supplied id, so
 * there is no way to address someone else's page through this endpoint.
 */

import type { VercelRequest, VercelResponse } from './types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import { verifyRequestAuth } from './_lib/auth.js';
import { deriveForTutor, EMPTY_DERIVED } from './_lib/publicPageDerived.js';
import { isProKlaseOrg } from './_lib/marketMoney.js';
import type { PublicPageRow } from './_lib/publicPageRow.js';
import { safePublicSocialUrl } from '../src/lib/publicPage.js';

function getSupabase(): SupabaseClient | null {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/* ---------------------------------------------------------------- */
/* Validation                                                        */
/* ---------------------------------------------------------------- */

/** Mirrors RESERVED_SLUGS in src/lib/publicPage.ts — keep the two in step. */
const RESERVED_SLUGS = new Set([
  'api', 'admin', 'login', 'register', 'book', 'review', 'assets', 'new', 'edit',
  'settings', 'pricing', 'blog', 'features', 'schools', 'teachers', 'contacts',
  'about', 'terms', 'privacy-policy', 'dpa', 'tutor', 'korepetitorius',
]);

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const BACKDROP_THEMES = new Set(['math', 'language', 'music', 'plain']);
const SOCIAL_KEYS = ['tiktok', 'youtube', 'x', 'instagram', 'facebook'] as const;

const LIMITS = {
  displayName: 80,
  headline: 140,
  bio: 2000,
  taglineText: 120,
  taglineEmphasis: 60,
  city: 80,
  language: 40,
  url: 300,
};

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Only absolute http(s) links — a `javascript:` href would run in a visitor's page. */
function safeUrl(value: unknown): string | undefined {
  const raw = String(value ?? '').trim().slice(0, LIMITS.url);
  if (!raw) return undefined;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function validTimezone(value: unknown): string | null {
  const tz = String(value ?? '').trim();
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

/**
 * Translates the editor's camelCase patch into columns, dropping anything
 * unrecognised. Colours are hex-checked because they are interpolated straight
 * into `linear-gradient(...)` on a page served to anonymous visitors.
 */
function buildUpdate(patch: Record<string, unknown>): { update: Record<string, unknown>; slug?: string } {
  const u: Record<string, unknown> = {};

  if ('displayName' in patch) u.display_name = clean(patch.displayName, LIMITS.displayName);
  if ('headline' in patch) u.headline = clean(patch.headline, LIMITS.headline);
  if ('bio' in patch) u.bio = String(patch.bio ?? '').trim().slice(0, LIMITS.bio);
  if ('taglineText' in patch) u.tagline_text = clean(patch.taglineText, LIMITS.taglineText) || null;
  if ('taglineEmphasis' in patch) u.tagline_emphasis = clean(patch.taglineEmphasis, LIMITS.taglineEmphasis) || null;
  if ('city' in patch) u.city = clean(patch.city, LIMITS.city) || null;

  if ('photoUrl' in patch) u.photo_url = patch.photoUrl ? safeUrl(patch.photoUrl) ?? null : null;
  if ('coverUrl' in patch) u.cover_url = patch.coverUrl ? safeUrl(patch.coverUrl) ?? null : null;

  if ('languages' in patch && Array.isArray(patch.languages)) {
    u.languages = patch.languages
      .map((l) => clean(l, LIMITS.language))
      .filter(Boolean)
      .slice(0, 8);
  }

  if ('timezone' in patch) {
    const tz = validTimezone(patch.timezone);
    if (tz) u.timezone = tz;
  }

  for (const [key, column] of [
    ['brandColor', 'brand_color'],
    ['brandColorSecondary', 'brand_color_secondary'],
    ['brandColorTertiary', 'brand_color_tertiary'],
    ['accentColor', 'accent_color'],
    ['accentTextColor', 'accent_text_color'],
  ] as const) {
    if (key in patch && HEX_RE.test(String(patch[key]))) u[column] = String(patch[key]).toLowerCase();
  }

  if ('backdropTheme' in patch && BACKDROP_THEMES.has(String(patch.backdropTheme))) {
    u.backdrop_theme = String(patch.backdropTheme);
  }

  if ('socials' in patch && patch.socials && typeof patch.socials === 'object') {
    const incoming = patch.socials as Record<string, unknown>;
    const socials: Record<string, string> = {};
    for (const key of SOCIAL_KEYS) {
      const url = safePublicSocialUrl(key, incoming[key]);
      if (url) socials[key] = url;
    }
    u.socials = socials;
  }

  if ('published' in patch) u.published = Boolean(patch.published);
  if ('bookingEnabled' in patch) u.booking_enabled = Boolean(patch.bookingEnabled);

  const slug = 'slug' in patch ? String(patch.slug ?? '').toLowerCase().trim() : undefined;
  return { update: u, slug };
}

/* ---------------------------------------------------------------- */
/* Row bootstrap                                                     */
/* ---------------------------------------------------------------- */

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/** First free variant of `base`, probing base, base-2, base-3… */
async function uniqueSlug(supabase: SupabaseClient, base: string): Promise<string> {
  const seed = base.length >= 3 && !RESERVED_SLUGS.has(base) ? base : `korepetitorius-${randomUUID().slice(0, 6)}`;
  for (let n = 1; n <= 50; n++) {
    const candidate = n === 1 ? seed : `${seed}-${n}`;
    const { data } = await supabase
      .from('public_pages')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `${seed}-${randomUUID().slice(0, 8)}`;
}

const SELECT_COLUMNS =
  'id, user_id, organization_id, slug, owner_type, locale, display_name, headline, bio, ' +
  'tagline_text, tagline_emphasis, photo_url, cover_url, city, languages, timezone, ' +
  'brand_color, brand_color_secondary, brand_color_tertiary, accent_color, accent_text_color, ' +
  'backdrop_theme, socials, published, booking_enabled';

/**
 * Who this page belongs to.
 *
 * A solo tutor owns their page directly. An organization's page is owned by the
 * org and edited by its admins. A tutor *employed* by an organization gets
 * neither: the org owns the public brand, the same reason /invoices is hidden
 * from them in the sidebar.
 */
type Owner =
  | { kind: 'tutor'; userId: string; name: string; locale: string }
  | { kind: 'organization'; orgId: string; name: string; locale: string }
  | { error: 'not-a-tutor' | 'org-tutor' | 'org-excluded' };

async function resolveOwner(supabase: SupabaseClient, userId: string): Promise<Owner> {
  // organization_admins is UNIQUE (user_id), so at most one org per admin.
  const { data: adminRow } = await supabase
    .from('organization_admins')
    .select('organization_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (adminRow?.organization_id) {
    const orgId = String(adminRow.organization_id);
    const { data: org } = await supabase
      .from('organizations')
      .select('name, slug, preferred_locale')
      .eq('id', orgId)
      .maybeSingle();

    // Pro Klasė is deliberately out: their tutors are placed by the school, so
    // a public "book me" page would cut across how they operate.
    if (isProKlaseOrg(orgId) || isProKlaseOrg(org?.slug)) return { error: 'org-excluded' };

    return {
      kind: 'organization',
      orgId,
      name: String(org?.name || '').trim(),
      locale: String(org?.preferred_locale || 'lt'),
    };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, preferred_locale, organization_id')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) return { error: 'not-a-tutor' };
  if (profile.organization_id) return { error: 'org-tutor' };

  return {
    kind: 'tutor',
    userId,
    name: String(profile.full_name || '').trim(),
    locale: String(profile.preferred_locale || 'lt'),
  };
}

async function loadOrCreate(
  supabase: SupabaseClient,
  owner: Extract<Owner, { kind: string }>,
): Promise<PublicPageRow> {
  const ownerColumn = owner.kind === 'tutor' ? 'user_id' : 'organization_id';
  const ownerId = owner.kind === 'tutor' ? owner.userId : owner.orgId;

  const { data: existing } = await supabase
    .from('public_pages')
    .select(SELECT_COLUMNS)
    .eq(ownerColumn, ownerId)
    .maybeSingle();
  if (existing) return existing as unknown as PublicPageRow;

  const slug = await uniqueSlug(supabase, slugify(owner.name));

  const { data, error } = await supabase
    .from('public_pages')
    .insert({
      [ownerColumn]: ownerId,
      owner_type: owner.kind,
      slug,
      locale: owner.locale,
      display_name: owner.name || slug,
      headline: '',
      bio: '',
      languages: owner.locale === 'lt' ? ['Lietuvių'] : [],
      published: false,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as PublicPageRow;
}

/* ---------------------------------------------------------------- */
/* Handler                                                           */
/* ---------------------------------------------------------------- */

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ error: 'database-unavailable' });

  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'unauthorized' });
  const userId = auth.userId;

  const owner = await resolveOwner(supabase, userId);
  if ('error' in owner) return res.status(403).json({ error: owner.error });

  try {
    if (req.method === 'GET') {
      const page = await loadOrCreate(supabase, owner);
      // An organization has no single calendar or price list to publish — its
      // lessons belong to individual tutors — so its page is a business card.
      const derived = owner.kind === 'tutor'
        ? await deriveForTutor(supabase, owner.userId, page.timezone || 'Europe/Vilnius')
        : EMPTY_DERIVED;
      return res.status(200).json({ page, derived });
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const current = await loadOrCreate(supabase, owner);
      const { update, slug } = buildUpdate(body as Record<string, unknown>);

      if (slug !== undefined && slug !== current.slug) {
        if (!SLUG_RE.test(slug) || slug.length < 3 || slug.length > 80) {
          return res.status(400).json({ error: 'slug-invalid' });
        }
        if (RESERVED_SLUGS.has(slug)) return res.status(400).json({ error: 'slug-reserved' });
        const { data: clash } = await supabase
          .from('public_pages')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();
        if (clash && clash.id !== current.id) return res.status(409).json({ error: 'slug-taken' });
        update.slug = slug;
      }

      if (Object.keys(update).length === 0) return res.status(200).json({ page: current });

      const { data, error } = await supabase
        .from('public_pages')
        .update(update)
        .eq('id', current.id)
        .select(SELECT_COLUMNS)
        .single();

      // A racing insert on the same slug trips the unique index rather than the
      // pre-check above.
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'slug-taken' });
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({ page: data });
    }

    if (req.method === 'POST' && req.query.action === 'image') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const { base64, contentType, kind } = body as Record<string, string>;
      if (!base64 || !IMAGE_TYPES[contentType]) return res.status(400).json({ error: 'bad-image' });
      if (kind !== 'avatar' && kind !== 'cover') return res.status(400).json({ error: 'bad-kind' });

      const buffer = Buffer.from(base64, 'base64');
      if (buffer.length > MAX_IMAGE_BYTES) return res.status(400).json({ error: 'too-large' });

      // Namespaced under the owner id — the storage policy checks that prefix.
      const path = `${userId}/${kind}-${randomUUID()}.${IMAGE_TYPES[contentType]}`;
      const { error } = await supabase.storage
        .from('public-pages')
        .upload(path, buffer, { contentType, upsert: false });
      if (error) return res.status(500).json({ error: error.message });

      const { data } = supabase.storage.from('public-pages').getPublicUrl(path);
      return res.status(200).json({ url: data.publicUrl });
    }

    return res.status(405).json({ error: 'method-not-allowed' });
  } catch (err) {
    console.error('[public-page-admin]', err);
    return res.status(500).json({ error: 'internal-error' });
  }
}
