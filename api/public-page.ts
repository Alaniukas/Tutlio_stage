/**
 * Anonymous read of a published landing page.
 *
 *   GET /api/public-page?slug=rasa-demo
 *
 * Only published rows are ever returned — an unpublished page is a 404 here,
 * and the owner previews it through /api/public-page-admin instead. The column
 * list is explicit so internal ids and the owner's user_id never leak.
 */

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { deriveForTutor, EMPTY_DERIVED } from './_lib/publicPageDerived.js';
import type { PublicPageRow } from './_lib/publicPageRow.js';

const PUBLIC_COLUMNS =
  'id, slug, owner_type, locale, display_name, headline, bio, tagline_text, tagline_emphasis, ' +
  'photo_url, cover_url, city, languages, timezone, brand_color, brand_color_secondary, ' +
  'brand_color_tertiary, accent_color, accent_text_color, backdrop_theme, socials, ' +
  'published, booking_enabled, user_id, organization_id';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method-not-allowed' });

  const slug = typeof req.query.slug === 'string' ? req.query.slug.toLowerCase().trim() : '';
  if (!slug) return res.status(400).json({ error: 'slug-required' });

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(503).json({ error: 'database-unavailable' });

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data, error } = await supabase
      .from('public_pages')
      .select(PUBLIC_COLUMNS)
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return res.status(404).json({ error: 'not-found' });
    const page = data as unknown as PublicPageRow;

    // An organization page has no single calendar to publish — its lessons
    // belong to individual tutors — so it renders as a business card.
    const derived = page.user_id
      ? await deriveForTutor(supabase, page.user_id, page.timezone || 'Europe/Vilnius')
      : EMPTY_DERIVED;

    // The owner ids were only needed to derive; they must not reach the browser.
    const { user_id: _userId, organization_id: _orgId, ...safePage } = page;

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({ page: safePage, derived });
  } catch (err) {
    console.error('[public-page]', err);
    return res.status(500).json({ error: 'internal-error' });
  }
}
