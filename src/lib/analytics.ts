import { supabase } from '@/lib/supabase';

const SESSION_KEY = 'tutlio_analytics_sid';
const UTM_KEY = 'tutlio_utm';

function getSessionId(): string {
  let sid = sessionStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

export interface UtmParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

/** Read UTM params from the URL on first visit and cache them for the session. */
export function captureUtmParams(): UtmParams {
  const cached = sessionStorage.getItem(UTM_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch { /* fall through */ }
  }

  const sp = new URLSearchParams(window.location.search);
  const utm: UtmParams = {};
  const src = sp.get('utm_source');
  const med = sp.get('utm_medium');
  const cam = sp.get('utm_campaign');
  if (src) utm.utm_source = src;
  if (med) utm.utm_medium = med;
  if (cam) utm.utm_campaign = cam;

  if (Object.keys(utm).length > 0) {
    sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
  }
  return utm;
}

/** Get cached UTM params (already captured earlier in session). */
export function getStoredUtm(): UtmParams {
  try {
    const raw = sessionStorage.getItem(UTM_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

let lastTrackedPath = '';

/** Track a pageview. Deduplicates consecutive identical paths. */
export function trackPageview(pathname: string) {
  if (pathname === lastTrackedPath) return;
  lastTrackedPath = pathname;

  const utm = getStoredUtm();
  const locale = document.documentElement.lang || navigator.language?.slice(0, 2) || '';

  supabase.from('analytics_events').insert({
    session_id: getSessionId(),
    event_name: 'pageview',
    page_path: pathname,
    referrer: document.referrer || null,
    utm_source: utm.utm_source || null,
    utm_medium: utm.utm_medium || null,
    utm_campaign: utm.utm_campaign || null,
    locale: locale || null,
    user_agent: navigator.userAgent?.slice(0, 512) || null,
  }).then(({ error }) => {
    if (error && !String(error.message || '').includes('relation') && error.code !== '42P01') {
      console.warn('[analytics] insert error:', error.message);
    }
  });
}

/** Fire once on app boot — captures UTM + first pageview. */
export function initAnalytics() {
  if (typeof window === 'undefined') return;
  captureUtmParams();
  trackPageview(window.location.pathname);
}
