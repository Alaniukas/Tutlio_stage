-- Two classification bugs in admin_stats_traffic_sources inflated "organic":
--
-- 1. Clicks from Gmail, Google Docs, Calendar, Drive and other Google apps
--    carry a *.google.com referrer and fell into the "google (organic)"
--    catch-all. Parents opening contract, invoice and booking emails are not
--    search traffic. They now land in their own bucket.
-- 2. ChatGPT appends `?utm_source=chatgpt.com` to the links it cites, so
--    those sessions surfaced as a raw "chatgpt.com" utm bucket instead of the
--    existing "ai: chatgpt" channel. AI utm sources are now normalised to the
--    same "ai: …" labels the referrer branch uses.
--
-- Return shape unchanged: (source text, visits bigint).
CREATE OR REPLACE FUNCTION public.admin_stats_traffic_sources(since_date timestamptz)
RETURNS TABLE(source text, visits bigint) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT bucket AS source, COUNT(DISTINCT session_id) AS visits
  FROM (
    SELECT
      session_id,
      CASE
        -- Explicit campaign tagging wins, but AI assistants tag their own
        -- outbound links; fold those into the AI channels.
        WHEN NULLIF(utm_source, '') IS NOT NULL THEN
          CASE
            WHEN utm_source ~* '(chatgpt|openai)' THEN 'ai: chatgpt'
            WHEN utm_source ~* 'perplexity' THEN 'ai: perplexity'
            WHEN utm_source ~* 'copilot' THEN 'ai: copilot'
            WHEN utm_source ~* 'gemini' THEN 'ai: gemini'
            WHEN utm_source ~* '(claude|anthropic)' THEN 'ai: claude'
            ELSE utm_source
          END
        WHEN COALESCE(referrer, '') = '' THEN 'direct'
        WHEN referrer ~* 'tutlio\.(lt|com|pl)' THEN 'direct'
        -- AI assistants (check gemini before the google catch-all)
        WHEN referrer ~* '(chatgpt\.com|chat\.openai\.com)' THEN 'ai: chatgpt'
        WHEN referrer ~* 'perplexity\.(ai|com)' THEN 'ai: perplexity'
        WHEN referrer ~* 'copilot\.microsoft\.com' THEN 'ai: copilot'
        WHEN referrer ~* 'gemini\.google\.com' THEN 'ai: gemini'
        WHEN referrer ~* '(claude\.ai|anthropic\.com)' THEN 'ai: claude'
        -- Google apps are not search: Gmail, Docs, Calendar, Drive, Classroom…
        WHEN referrer ~* '(mail|docs|calendar|accounts|drive|classroom|meet|sites|keep|chat|photos|translate|business)\.google\.' THEN 'google apps (mail/docs)'
        -- Search engines
        WHEN referrer ~* 'google\.' THEN 'google (organic)'
        WHEN referrer ~* 'bing\.com' THEN 'bing (organic)'
        WHEN referrer ~* 'duckduckgo\.com' THEN 'duckduckgo (organic)'
        WHEN referrer ~* 'yandex\.' THEN 'yandex (organic)'
        WHEN referrer ~* 'seznam\.cz' THEN 'seznam (organic)'
        WHEN referrer ~* 'ecosia\.org' THEN 'ecosia (organic)'
        WHEN referrer ~* 'search\.brave\.com' THEN 'brave (organic)'
        WHEN referrer ~* 'yahoo\.' THEN 'yahoo (organic)'
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
