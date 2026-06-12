-- admin_stats_traffic_sources only bucketed by utm_source, so all organic
-- search and AI-assistant traffic (which arrives with a referrer but no UTM)
-- collapsed into "direct". Classify referrers so the admin panel can track
-- organic growth per channel — including ChatGPT/Perplexity/Copilot/Gemini
-- referrals, the signal for LLM-search visibility. Return shape unchanged.
CREATE OR REPLACE FUNCTION public.admin_stats_traffic_sources(since_date timestamptz)
RETURNS TABLE(source text, visits bigint) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT bucket AS source, COUNT(DISTINCT session_id) AS visits
  FROM (
    SELECT
      session_id,
      CASE
        WHEN NULLIF(utm_source, '') IS NOT NULL THEN utm_source
        WHEN COALESCE(referrer, '') = '' THEN 'direct'
        WHEN referrer ~* 'tutlio\.(lt|com|pl)' THEN 'direct'
        -- AI assistants (check gemini before the google catch-all)
        WHEN referrer ~* '(chatgpt\.com|chat\.openai\.com)' THEN 'ai: chatgpt'
        WHEN referrer ~* 'perplexity\.(ai|com)' THEN 'ai: perplexity'
        WHEN referrer ~* 'copilot\.microsoft\.com' THEN 'ai: copilot'
        WHEN referrer ~* 'gemini\.google\.com' THEN 'ai: gemini'
        WHEN referrer ~* '(claude\.ai|anthropic\.com)' THEN 'ai: claude'
        -- Search engines
        WHEN referrer ~* 'google\.' THEN 'google (organic)'
        WHEN referrer ~* 'bing\.com' THEN 'bing (organic)'
        WHEN referrer ~* 'duckduckgo\.com' THEN 'duckduckgo (organic)'
        WHEN referrer ~* 'yandex\.' THEN 'yandex (organic)'
        WHEN referrer ~* 'seznam\.cz' THEN 'seznam (organic)'
        -- Social
        WHEN referrer ~* '(facebook\.com|fb\.me)' THEN 'facebook'
        WHEN referrer ~* 'instagram\.com' THEN 'instagram'
        WHEN referrer ~* 'linkedin\.com' THEN 'linkedin'
        WHEN referrer ~* '(youtube\.com|youtu\.be)' THEN 'youtube'
        WHEN referrer ~* 'reddit\.com' THEN 'reddit'
        WHEN referrer ~* '(t\.co/|twitter\.com|//x\.com)' THEN 'x'
        -- Anything else: keep the bare referrer host
        ELSE substring(regexp_replace(referrer, '^https?://(www\.)?', '', 'i') from '^[^/]+')
      END AS bucket
    FROM public.analytics_events
    WHERE event_name = 'pageview' AND created_at >= since_date
  ) classified
  GROUP BY bucket
  ORDER BY visits DESC
  LIMIT 25;
$$;
