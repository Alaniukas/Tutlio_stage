// GET /api/org-branding?slug=<slug>  — public: whitelabel login by slug
// GET /api/org-branding?id=<uuid>    — authenticated: branding by org id (student/parent/tutor)
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
  const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  if (!slug && !id) return res.status(400).json({ error: 'Missing slug or id param' });

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    supabaseServiceRoleClientOptions() as any,
  ) as any;

  let query = supabase
    .from('organizations')
    .select('id, name, slug, logo_url, brand_color, brand_color_secondary, features, entity_type');

  if (slug) {
    query = query.eq('slug', slug).eq('status', 'active');
  } else {
    query = query.eq('id', id);
  }

  const { data: org, error } = await query.maybeSingle();

  if (error) return res.status(500).json({ error: 'Internal error' });
  if (!org) return res.status(404).json({ error: 'Organization not found' });

  const features = (org.features && typeof org.features === 'object' ? org.features : {}) as Record<string, unknown>;
  if (!features.custom_branding) {
    return res.status(404).json({ error: 'Branding not enabled' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    logo_url: org.logo_url,
    brand_color: org.brand_color || '#6366f1',
    brand_color_secondary: org.brand_color_secondary || '#8b5cf6',
    entity_type: org.entity_type,
  });
}
