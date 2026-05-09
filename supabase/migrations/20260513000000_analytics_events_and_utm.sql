-- Analytics events table for lightweight client-side tracking (pageviews, sources)
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id   text NOT NULL,
  event_name   text NOT NULL,
  page_path    text,
  referrer     text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  locale       text,
  user_agent   text,
  country_code text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_created
  ON public.analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_name
  ON public.analytics_events (event_name);

-- Allow anonymous inserts (tracker fires before auth) but no reads for non-admins
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY analytics_events_insert_anon
  ON public.analytics_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

GRANT INSERT ON public.analytics_events TO anon, authenticated;
GRANT ALL    ON public.analytics_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.analytics_events_id_seq TO anon, authenticated, service_role;

-- UTM columns on profiles (populated at signup)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS utm_source   text,
  ADD COLUMN IF NOT EXISTS utm_medium   text,
  ADD COLUMN IF NOT EXISTS utm_campaign text;

-- =====================================================
-- RPC: admin_stats_locale_distribution
-- =====================================================
CREATE OR REPLACE FUNCTION public.admin_stats_locale_distribution()
RETURNS TABLE(locale text, user_count bigint) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    COALESCE(preferred_locale, 'unknown') AS locale,
    COUNT(*) AS user_count
  FROM public.profiles
  GROUP BY COALESCE(preferred_locale, 'unknown')
  ORDER BY user_count DESC;
$$;

-- =====================================================
-- RPC: admin_stats_signup_trends (weekly buckets)
-- =====================================================
CREATE OR REPLACE FUNCTION public.admin_stats_signup_trends(since_date timestamptz)
RETURNS TABLE(week text, signups bigint) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    to_char(date_trunc('week', created_at), 'YYYY-MM-DD') AS week,
    COUNT(*) AS signups
  FROM public.profiles
  WHERE created_at >= since_date
  GROUP BY date_trunc('week', created_at)
  ORDER BY date_trunc('week', created_at);
$$;

-- =====================================================
-- RPC: admin_stats_traffic_sources
-- =====================================================
CREATE OR REPLACE FUNCTION public.admin_stats_traffic_sources(since_date timestamptz)
RETURNS TABLE(source text, visits bigint) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    COALESCE(NULLIF(utm_source, ''), 'direct') AS source,
    COUNT(DISTINCT session_id) AS visits
  FROM public.analytics_events
  WHERE event_name = 'pageview' AND created_at >= since_date
  GROUP BY COALESCE(NULLIF(utm_source, ''), 'direct')
  ORDER BY visits DESC
  LIMIT 20;
$$;

-- =====================================================
-- RPC: admin_stats_top_pages
-- =====================================================
CREATE OR REPLACE FUNCTION public.admin_stats_top_pages(since_date timestamptz)
RETURNS TABLE(page_path text, views bigint, unique_visitors bigint) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    page_path,
    COUNT(*) AS views,
    COUNT(DISTINCT session_id) AS unique_visitors
  FROM public.analytics_events
  WHERE event_name = 'pageview' AND created_at >= since_date AND page_path IS NOT NULL
  GROUP BY page_path
  ORDER BY views DESC
  LIMIT 30;
$$;

-- Only service_role can call these RPCs
REVOKE EXECUTE ON FUNCTION public.admin_stats_locale_distribution() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_stats_signup_trends(timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_stats_traffic_sources(timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_stats_top_pages(timestamptz) FROM anon, authenticated;
