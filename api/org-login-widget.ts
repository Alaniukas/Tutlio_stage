// GET /api/org-login-widget?slug=<slug>&locale=lt|en
// Returns JS that injects branded login buttons (safe to load from another site).
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { isMoksloVaisiaiOrg, isProKlaseOrg } from './_lib/marketMoney.js';
import { orgLoginButtonLabels } from './_lib/orgLoginDescription.js';

function requestOrigin(req: VercelRequest): string {
  const env = (process.env.APP_URL || process.env.VITE_APP_URL || '').replace(/\/$/, '');
  if (env) return env;
  const host = String(req.headers.host || 'tutlio.lt');
  const proto = host.includes('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).end('Method not allowed');
  }

  const slug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
  const locale = typeof req.query.locale === 'string' ? req.query.locale.trim() : 'lt';
  if (!slug) {
    res.status(400).setHeader('Content-Type', 'text/javascript; charset=utf-8');
    return res.end('console.warn("Tutlio org-login-widget: missing slug");');
  }

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    supabaseServiceRoleClientOptions() as any,
  ) as any;

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, slug, logo_url, brand_color, brand_color_secondary, features')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle();

  const features = (org?.features && typeof org.features === 'object' ? org.features : {}) as Record<string, unknown>;
  const proKlase = org ? (isProKlaseOrg(org.id) || isProKlaseOrg(org.slug)) : false;
  const moksloVaisiai = org ? (isMoksloVaisiaiOrg(org.id) || isMoksloVaisiaiOrg(org.slug)) : false;
  if (!org || (!features.custom_branding && !proKlase && !moksloVaisiai)) {
    res.status(404).setHeader('Content-Type', 'text/javascript; charset=utf-8');
    return res.end('console.warn("Tutlio org-login-widget: branding not found");');
  }

  const origin = requestOrigin(req);
  const labels = orgLoginButtonLabels(locale === 'en' ? 'en' : 'lt');
  const payload = {
    name: org.name,
    logo: org.logo_url || '',
    color: org.brand_color || '#6366f1',
    color2: org.brand_color_secondary || org.brand_color || '#8b5cf6',
    logoOnDark: moksloVaisiai,
    buttons: [
      { href: `${origin}/login?org=${encodeURIComponent(org.slug)}&portal=student`, label: labels.student },
      { href: `${origin}/login?org=${encodeURIComponent(org.slug)}&portal=parent`, label: labels.parent },
      { href: `${origin}/login?org=${encodeURIComponent(org.slug)}&portal=tutor`, label: labels.tutor },
    ],
  };

  const js = `(function(){
  var cfg = ${JSON.stringify(payload)};
  var s = document.currentScript;
  if (!s || !s.parentNode) return;
  var wrap = document.createElement('div');
  wrap.setAttribute('data-tutlio-org-login', '1');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px;max-width:320px;font-family:system-ui,-apple-system,Segoe UI,sans-serif';
  if (cfg.logo) {
    var logoWrap = document.createElement('div');
    logoWrap.style.cssText = 'display:inline-flex;border-radius:16px;overflow:hidden;background:' + (cfg.logoOnDark ? '#000' : '#fff') + ';padding:6px;margin-bottom:4px;width:fit-content';
    var img = document.createElement('img');
    img.src = cfg.logo;
    img.alt = cfg.name;
    img.style.cssText = 'height:40px;max-width:180px;object-fit:contain;border-radius:12px';
    logoWrap.appendChild(img);
    wrap.appendChild(logoWrap);
  }
  cfg.buttons.forEach(function(b){
    var a = document.createElement('a');
    a.href = b.href;
    a.textContent = b.label;
    a.style.cssText = 'display:block;text-align:center;text-decoration:none;color:#fff;background:' + cfg.color + ';padding:12px 16px;border-radius:12px;font-weight:600;font-size:14px';
    wrap.appendChild(a);
  });
  s.parentNode.insertBefore(wrap, s);
})();`;

  res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
  return res.status(200).end(js);
}
