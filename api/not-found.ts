import type { VercelRequest, VercelResponse } from './types';

/**
 * Proper 404 for bot requests to unknown URLs. Without this, crawlers get the
 * SPA shell with HTTP 200 + noindex — a soft 404 that pollutes Search Console
 * ("Crawled - currently not indexed") and wastes crawl budget.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  return res.status(404).send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>404 — Page not found | Tutlio</title>
<meta name="robots" content="noindex" />
</head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:80px 24px;color:#1a1a1a">
<h1>404</h1>
<p>Page not found.</p>
<p><a href="/" style="color:#4f46e5">Tutlio</a></p>
</body>
</html>`);
}
