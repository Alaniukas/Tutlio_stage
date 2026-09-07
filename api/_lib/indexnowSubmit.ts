import { INDEXNOW_KEY } from '../indexnow-ping.js';

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

/** Submit one or more canonical URLs to IndexNow (Bing, Yandex, Copilot index). */
export async function submitIndexNowUrls(urls: string[]): Promise<Record<string, number>> {
  const unique = [...new Set(urls.filter(Boolean))];
  if (!unique.length) return {};

  const urlsByHost = new Map<string, string[]>();
  for (const url of unique) {
    try {
      const host = new URL(url).host;
      const list = urlsByHost.get(host) || [];
      list.push(url);
      urlsByHost.set(host, list);
    } catch {
      // skip invalid URLs
    }
  }

  const results: Record<string, number> = {};
  for (const [host, urlList] of urlsByHost) {
    try {
      const resp = await fetch(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host,
          key: INDEXNOW_KEY,
          keyLocation: `https://${host}/${INDEXNOW_KEY}.txt`,
          urlList,
        }),
      });
      results[host] = resp.status;
    } catch (e) {
      console.error(`[indexnow] submit failed for ${host}:`, e);
      results[host] = 0;
    }
  }
  return results;
}
