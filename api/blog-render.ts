import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import {
  type Locale,
  type DomainKey,
  LOCALES,
  detectDomain,
  buildPath,
  buildFullUrl,
  hreflangTags,
} from './_lib/ssr-shell';

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) as any;
}

function resolve(post: Record<string, unknown>, field: string, locale: Locale): string {
  return (post[`${field}_${locale}`] as string) || (post[`${field}_en`] as string) || (post[`${field}_lt`] as string) || '';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mdToHtml(md: string): string {
  if (!md) return '';
  let html = '';
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      i++;
      const code: string[] = [];
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(esc(lines[i])); i++; }
      i++;
      html += `<pre><code>${code.join('\n')}</code></pre>\n`;
      continue;
    }
    if (line.trim() === '') { i++; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) { html += '<hr />\n'; i++; continue; }
    const hm = line.match(/^(#{1,6})\s+(.+)$/);
    if (hm) { html += `<h${hm[1].length}>${inl(hm[2])}</h${hm[1].length}>\n`; i++; continue; }
    if (line.startsWith('>')) {
      const ql: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) { ql.push(lines[i].replace(/^>\s?/, '')); i++; }
      html += `<blockquote>${ql.map(l => `<p>${inl(l)}</p>`).join('')}</blockquote>\n`;
      continue;
    }
    if (/^[-*+]\s/.test(line)) {
      html += '<ul>\n';
      while (i < lines.length && /^[-*+]\s/.test(lines[i])) { html += `<li>${inl(lines[i].replace(/^[-*+]\s/, ''))}</li>\n`; i++; }
      html += '</ul>\n'; continue;
    }
    if (/^\d+\.\s/.test(line)) {
      html += '<ol>\n';
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) { html += `<li>${inl(lines[i].replace(/^\d+\.\s/, ''))}</li>\n`; i++; }
      html += '</ol>\n'; continue;
    }
    const pl: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('#') && !lines[i].startsWith('>') && !lines[i].startsWith('```') && !/^[-*+]\s/.test(lines[i]) && !/^\d+\.\s/.test(lines[i])) { pl.push(lines[i]); i++; }
    if (pl.length) html += `<p>${inl(pl.join(' '))}</p>\n`;
  }
  return html;
}

function inl(t: string): string {
  return t
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" style="max-width:100%;border-radius:8px;margin:1em 0" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener">$1</a>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function fmtDate(d: string | null, locale: Locale): string {
  if (!d) return '';
  const map: Record<Locale, string> = {
    lt: 'lt-LT', en: 'en-GB', pl: 'pl-PL', lv: 'lv-LV', ee: 'et-EE',
    fr: 'fr-FR', es: 'es-ES', de: 'de-DE', se: 'sv-SE', dk: 'da-DK', fi: 'fi-FI', no: 'nb-NO',
  };
  return new Date(d).toLocaleDateString(map[locale] || 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
}

function detectLocaleFromQuery(req: VercelRequest): Locale {
  const q = typeof req.query.locale === 'string' ? req.query.locale : '';
  if (LOCALES.includes(q as Locale)) return q as Locale;
  const domain = detectDomain(req);
  return domain === 'com' ? 'en' : 'lt';
}

const LABELS: Record<Locale, { blog: string; back: string; home: string; read: string }> = {
  lt: { blog: 'Tinklaraštis', back: 'Visi straipsniai', home: 'Pagrindinis', read: 'Skaityti daugiau' },
  en: { blog: 'Blog', back: 'All articles', home: 'Home', read: 'Read more' },
  pl: { blog: 'Blog', back: 'Wszystkie artykuły', home: 'Strona główna', read: 'Czytaj więcej' },
  lv: { blog: 'Emuārs', back: 'Visi raksti', home: 'Sākumlapa', read: 'Lasīt vairāk' },
  ee: { blog: 'Blogi', back: 'Kõik artiklid', home: 'Avaleht', read: 'Loe edasi' },
  fr: { blog: 'Blog', back: 'Tous les articles', home: 'Accueil', read: 'Lire la suite' },
  es: { blog: 'Blog', back: 'Todos los artículos', home: 'Inicio', read: 'Leer más' },
  de: { blog: 'Blog', back: 'Alle Artikel', home: 'Startseite', read: 'Weiterlesen' },
  se: { blog: 'Blogg', back: 'Alla artiklar', home: 'Startsida', read: 'Läs mer' },
  dk: { blog: 'Blog', back: 'Alle artikler', home: 'Forside', read: 'Læs mere' },
  fi: { blog: 'Blogi', back: 'Kaikki artikkelit', home: 'Etusivu', read: 'Lue lisää' },
  no: { blog: 'Blogg', back: 'Alle artikler', home: 'Forside', read: 'Les mer' },
};

function shell(locale: Locale, domain: DomainKey, blogPath: string, title: string, description: string, url: string, image: string, body: string, jsonLd?: string): string {
  const l = LABELS[locale];
  const homePath = buildPath('/', locale, domain);
  const blogListPath = buildPath('/blog', locale, domain);
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(url)}" />
${hreflangTags(blogPath)}
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(url)}" />
<meta property="og:site_name" content="Tutlio" />
${image ? `<meta property="og:image" content="${esc(image)}" />` : ''}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
${image ? `<meta name="twitter:image" content="${esc(image)}" />` : ''}
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;color:#1a1a1a;line-height:1.7;background:#fff}
a{color:#4f46e5;text-decoration:none}
a:hover{text-decoration:underline}
.nav{display:flex;align-items:center;justify-content:space-between;max-width:1100px;margin:0 auto;padding:16px 24px}
.nav-logo{font-weight:700;font-size:1.3rem;color:#1a1a1a}
.nav-links{display:flex;gap:20px;font-size:.9rem}
.hero{max-width:1100px;margin:0 auto;padding:40px 24px 0}
.hero h1{font-size:2rem;font-weight:700;line-height:1.3;margin-bottom:8px}
.meta{color:#666;font-size:.9rem;margin-bottom:24px}
.tag{display:inline-block;background:#eef2ff;color:#4f46e5;padding:2px 10px;border-radius:999px;font-size:.8rem;font-weight:500;margin-right:8px}
.cover{width:100%;max-height:440px;object-fit:cover;border-radius:12px;margin-bottom:32px}
.content{max-width:760px;margin:0 auto;padding:0 24px 60px}
.content h2{font-size:1.5rem;font-weight:700;margin:2em 0 .6em}
.content h3{font-size:1.2rem;font-weight:600;margin:1.5em 0 .5em}
.content p{margin-bottom:1em}
.content ul,.content ol{margin:0 0 1em 1.5em}
.content li{margin-bottom:.4em}
.content blockquote{border-left:3px solid #4f46e5;padding:12px 20px;margin:1.5em 0;background:#f8f9ff;border-radius:0 8px 8px 0}
.content strong{font-weight:600}
.content pre{background:#f4f4f5;padding:16px;border-radius:8px;overflow-x:auto;margin:1.5em 0;font-size:.9rem}
.content code{font-size:.9em}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px;max-width:1100px;margin:0 auto;padding:0 24px 60px}
.card{border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;transition:box-shadow .2s}
.card:hover{box-shadow:0 4px 16px rgba(0,0,0,.08)}
.card img{width:100%;height:180px;object-fit:cover}
.card-body{padding:16px}
.card-body h2{font-size:1.1rem;font-weight:600;margin-bottom:6px;line-height:1.4}
.card-body p{color:#666;font-size:.9rem;margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.footer{border-top:1px solid #e5e7eb;text-align:center;padding:24px;color:#888;font-size:.85rem;margin-top:auto}
</style>
</head>
<body>
<nav class="nav">
  <a href="${homePath}" class="nav-logo">Tutlio</a>
  <div class="nav-links">
    <a href="${homePath}">${l.home}</a>
    <a href="${blogListPath}">${l.blog}</a>
  </div>
</nav>
${body}
<footer class="footer">&copy; ${new Date().getFullYear()} Tutlio</footer>
</body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const supabase = getSupabase();
  if (!supabase) return res.status(503).send('Database not configured');

  const domain = detectDomain(req);
  const locale = detectLocaleFromQuery(req);
  const slug = typeof req.query.slug === 'string' ? req.query.slug : '';
  const blogListPath = buildPath('/blog', locale, domain);
  const l = LABELS[locale];

  if (slug) {
    const { data: post } = await supabase
      .from('blog_posts').select('*').eq('slug', slug).eq('status', 'published').single();
    if (!post) return res.status(404).send('Not found');

    const title = resolve(post, 'title', locale);
    const excerpt = resolve(post, 'excerpt', locale);
    const content = resolve(post, 'content', locale);
    const date = fmtDate(post.published_at as string, locale);
    const blogPath = `/blog/${post.slug}`;
    const url = buildFullUrl(blogPath, locale, domain);
    const image = (post.cover_image as string) || '';

    const LANG_MAP: Record<Locale, string> = {
      lt: 'lt', en: 'en', pl: 'pl', lv: 'lv', ee: 'et',
      fr: 'fr', es: 'es', de: 'de', se: 'sv', dk: 'da', fi: 'fi', no: 'nb',
    };
    const jsonLd = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: title,
      description: excerpt,
      image: image || undefined,
      datePublished: post.published_at,
      inLanguage: LANG_MAP[locale],
      author: { '@type': 'Organization', name: 'Tutlio' },
      publisher: { '@type': 'Organization', name: 'Tutlio', url: 'https://www.tutlio.com', logo: { '@type': 'ImageObject', url: 'https://www.tutlio.com/pwa-512x512.png' } },
      url,
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    });

    const body = `
<div class="hero">
  ${image ? `<img class="cover" src="${esc(image)}" alt="${esc(title)}" />` : ''}
  <h1>${esc(title)}</h1>
  <div class="meta">${post.tag ? `<span class="tag">${esc(post.tag as string)}</span>` : ''}${date}</div>
</div>
<article class="content">
  ${mdToHtml(content)}
  <p style="margin-top:2em"><a href="${blogListPath}">&larr; ${l.back}</a></p>
</article>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(shell(locale, domain, blogPath, `${title} | Tutlio`, excerpt, url, image, body, jsonLd));
  }

  // Blog listing
  const { data: posts } = await supabase
    .from('blog_posts')
    .select('slug, cover_image, tag, published_at, title_lt, title_en, title_pl, title_lv, title_ee, title_fr, title_es, title_de, title_se, title_dk, title_fi, title_no, excerpt_lt, excerpt_en, excerpt_pl, excerpt_lv, excerpt_ee, excerpt_fr, excerpt_es, excerpt_de, excerpt_se, excerpt_dk, excerpt_fi, excerpt_no')
    .eq('status', 'published')
    .order('published_at', { ascending: false });

  const items = posts || [];
  const blogPath = '/blog';
  const url = buildFullUrl(blogPath, locale, domain);

  const cards = items.map((p: Record<string, unknown>) => {
    const t = resolve(p, 'title', locale);
    const e = resolve(p, 'excerpt', locale);
    const img = (p.cover_image as string) || '';
    const href = `${buildPath(`/blog/${p.slug}`, locale, domain)}`;
    return `<a href="${href}" class="card" style="text-decoration:none;color:inherit">
  ${img ? `<img src="${esc(img)}" alt="${esc(t)}" loading="lazy" />` : ''}
  <div class="card-body">
    ${p.tag ? `<span class="tag">${esc(p.tag as string)}</span>` : ''}
    <h2>${esc(t)}</h2>
    <p>${esc(e)}</p>
    <span style="color:#4f46e5;font-size:.9rem;font-weight:500">${l.read} &rarr;</span>
  </div>
</a>`;
  }).join('\n');

  const body = `
<div class="hero">
  <h1>${l.blog}</h1>
</div>
<div class="cards">
  ${cards || `<p style="padding:24px;color:#888">No posts yet.</p>`}
</div>`;

  const BLOG_DESC: Record<Locale, string> = {
    lt: 'Tutlio tinklaraštis – patarimai korepetitoriams, pamokų valdymo strategijos ir produkto naujienos.',
    en: 'Tutlio blog – tips for tutors, lesson management strategies, and product updates.',
    pl: 'Blog Tutlio – porady dla korepetytorów, strategie zarządzania lekcjami i aktualności.',
    lv: 'Tutlio emuārs – padomi pasniedzējiem, nodarbību pārvaldības stratēģijas un produkta jaunumi.',
    ee: 'Tutlio blogi – nõuanded õpetajatele, tundide haldamise strateegiad ja tooteuudised.',
    fr: 'Blog Tutlio – conseils pour les tuteurs, stratégies de gestion des cours et actualités produit.',
    es: 'Blog Tutlio – consejos para tutores, estrategias de gestión de clases y novedades del producto.',
    de: 'Tutlio Blog – Tipps für Tutoren, Strategien zur Unterrichtsverwaltung und Produktneuheiten.',
    se: 'Tutlio blogg – tips för lärare, strategier för lektionshantering och produktnyheter.',
    dk: 'Tutlio blog – tips til undervisere, strategier til lektionsstyring og produktnyheder.',
    fi: 'Tutlio blogi – vinkkejä opettajille, tuntien hallinnan strategioita ja tuoteuutisia.',
    no: 'Tutlio blogg – tips for tutorer, strategier for timeadministrasjon og produktnyheter.',
  };
  const blogDesc = BLOG_DESC[locale];

  const blogListJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: `${l.blog} | Tutlio`,
    description: blogDesc,
    url,
    publisher: { '@type': 'Organization', name: 'Tutlio', url: 'https://www.tutlio.com' },
  });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(shell(locale, domain, blogPath, `${l.blog} | Tutlio`, blogDesc, url, '', body, blogListJsonLd));
}
