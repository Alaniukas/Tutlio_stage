// GET /api/org-branding?slug=<slug> — public endpoint, returns org branding for whitelabel login
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
  if (!slug) return res.status(400).json({ error: 'Missing slug param' });

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  );

  const { data: org, error } = await supabase
    .from('organizations')
    .select('id, name, slug, logo_url, brand_color, brand_color_secondary, features, entity_type')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle();

  if (error) return res.status(500).json({ error: 'Internal error' });
  if (!org) return res.status(404).json({ error: 'Organization not found' });

  const features = (org.features && typeof org.features === 'object' ? org.features : {}) as Record<string, unknown>;
  if (!features.custom_branding) {
    return res.status(404).json({ error: 'Organization not found' });
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
