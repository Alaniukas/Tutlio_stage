-- Disk IO optimizations: drop unused indexes, cache landing stats,
-- optimise get_my_conversations(), add targeted covering indexes.

-- ═══════════════════════════════════════════════════════════════════
-- 1. DROP UNUSED INDEXES ON sessions
-- ═══════════════════════════════════════════════════════════════════
-- pg_stat_user_indexes shows 0 scans for every one of these.
-- Each costs write IO on every INSERT/UPDATE to sessions.
-- sessions table: 520 KB data but 928 KB indexes (1.8× ratio).

DROP INDEX IF EXISTS idx_sessions_active_end;
DROP INDEX IF EXISTS idx_sessions_tutor_standalone_paid_recent;
DROP INDEX IF EXISTS idx_sessions_available_spots;
DROP INDEX IF EXISTS idx_sessions_hidden_from_calendar;
DROP INDEX IF EXISTS idx_sessions_cancelled_at;
DROP INDEX IF EXISTS idx_sessions_payment_batch;
DROP INDEX IF EXISTS idx_sessions_penalty_resolution;
DROP INDEX IF EXISTS idx_sessions_tutor_created_org_admin;
DROP INDEX IF EXISTS idx_sessions_tutor_cancelled_hide_sweep;
DROP INDEX IF EXISTS idx_sessions_payment_status;
DROP INDEX IF EXISTS idx_sessions_late_cancelled;
DROP INDEX IF EXISTS idx_sessions_lesson_package;
DROP INDEX IF EXISTS idx_sessions_tutor_start_include_student;

-- ═══════════════════════════════════════════════════════════════════
-- 2. DROP UNUSED INDEXES ON OTHER TABLES
-- ═══════════════════════════════════════════════════════════════════
-- Duplicate / never-hit indexes that only add write overhead.

DROP INDEX IF EXISTS idx_analytics_events_event_name;
DROP INDEX IF EXISTS idx_analytics_events_created;
DROP INDEX IF EXISTS idx_blog_posts_slug;            -- blog_posts_slug_key unique covers this
DROP INDEX IF EXISTS idx_availability_tutor_recurring_dow;
DROP INDEX IF EXISTS idx_availability_tutor_specific_date;
DROP INDEX IF EXISTS idx_availability_tutor_created_org_admin;
DROP INDEX IF EXISTS idx_profiles_subscription_status;
DROP INDEX IF EXISTS idx_profiles_stripe_customer_id;

-- ═══════════════════════════════════════════════════════════════════
-- 3. SINGLE-ROW CACHE FOR PUBLIC LANDING STATS
-- ═══════════════════════════════════════════════════════════════════
-- Avoids 4 full-table COUNT(*) on every anonymous landing page visit.

CREATE TABLE IF NOT EXISTS public.landing_stats_cache (
  id          int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  completed_lessons bigint NOT NULL DEFAULT 0,
  upcoming_lessons  bigint NOT NULL DEFAULT 0,
  total_tutors      bigint NOT NULL DEFAULT 0,
  total_students    bigint NOT NULL DEFAULT 0,
  refreshed_at      timestamptz NOT NULL DEFAULT '1970-01-01'
);

INSERT INTO public.landing_stats_cache (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE public.landing_stats_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can read landing cache" ON public.landing_stats_cache;
CREATE POLICY "Anon can read landing cache" ON public.landing_stats_cache
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Service role full access landing cache" ON public.landing_stats_cache;
CREATE POLICY "Service role full access landing cache" ON public.landing_stats_cache
  FOR ALL USING (
    (current_setting('request.jwt.claims', true)::json->>'role') = 'service_role'
  );

GRANT SELECT ON public.landing_stats_cache TO anon, authenticated;
GRANT ALL    ON public.landing_stats_cache TO service_role;

CREATE OR REPLACE FUNCTION public.get_public_landing_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cache landing_stats_cache%ROWTYPE;
BEGIN
  SELECT * INTO v_cache FROM landing_stats_cache WHERE id = 1;

  IF v_cache.refreshed_at > now() - interval '30 minutes' THEN
    RETURN jsonb_build_object(
      'completed_lessons', v_cache.completed_lessons,
      'upcoming_lessons',  v_cache.upcoming_lessons,
      'total_tutors',      v_cache.total_tutors,
      'total_students',    v_cache.total_students
    );
  END IF;

  UPDATE landing_stats_cache SET
    completed_lessons = (
      SELECT count(*) FROM sessions
      WHERE status IN ('completed', 'no_show')
         OR (status = 'active' AND end_time < now())
    ),
    upcoming_lessons = (
      SELECT count(*) FROM sessions
      WHERE status = 'active' AND start_time > now()
    ),
    total_tutors  = (SELECT count(*) FROM profiles),
    total_students = (SELECT count(*) FROM students),
    refreshed_at  = now()
  WHERE id = 1;

  SELECT * INTO v_cache FROM landing_stats_cache WHERE id = 1;

  RETURN jsonb_build_object(
    'completed_lessons', v_cache.completed_lessons,
    'upcoming_lessons',  v_cache.upcoming_lessons,
    'total_tutors',      v_cache.total_tutors,
    'total_students',    v_cache.total_students
  );
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 4. ANALYTICS unique-visitors RPC (replaces JS-side dedup)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_stats_unique_sessions(since_date timestamptz)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(DISTINCT session_id)
  FROM public.analytics_events
  WHERE event_name = 'pageview' AND created_at >= since_date;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_stats_unique_sessions(timestamptz) FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 5. OPTIMIZE get_my_conversations()
-- ═══════════════════════════════════════════════════════════════════
-- Old version: full DISTINCT ON scans of students + parent_profiles,
-- correlated EXISTS per row => 1.8 s avg.
-- New version: uses LATERAL index lookups, single-pass unread count.

CREATE OR REPLACE FUNCTION public.get_my_conversations()
RETURNS TABLE(
  conversation_id uuid,
  last_message_at timestamptz,
  other_user_id uuid,
  other_user_name text,
  other_user_email text,
  last_message_content text,
  last_message_type text,
  last_message_sender_id uuid,
  last_message_created_at timestamptz,
  unread_count bigint,
  my_email_notify_enabled boolean,
  my_email_notify_delay_hours integer,
  other_party_kind text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH my_convs AS (
    SELECT cp.conversation_id, cp.last_read_at,
           cp.email_notify_enabled, cp.email_notify_delay_hours
    FROM chat_participants cp
    WHERE cp.user_id = auth.uid()
  ),
  other AS (
    SELECT mc.conversation_id, mc.last_read_at,
           mc.email_notify_enabled, mc.email_notify_delay_hours,
           cp2.user_id AS other_uid
    FROM my_convs mc
    JOIN chat_participants cp2 ON cp2.conversation_id = mc.conversation_id
                               AND cp2.user_id != auth.uid()
  )
  SELECT
    o.conversation_id,
    c.last_message_at,
    o.other_uid,
    COALESCE(p.full_name, s.full_name, pp.full_name, 'Unknown'),
    COALESCE(p.email, s.email, pp.email, ''),
    lm.content,
    lm.message_type,
    lm.sender_id,
    lm.created_at,
    COALESCE(ur.cnt, 0),
    COALESCE(o.email_notify_enabled, true),
    COALESCE(o.email_notify_delay_hours, 12),
    CASE
      WHEN s.linked_user_id IS NOT NULL THEN 'student'
      WHEN pp.user_id       IS NOT NULL THEN 'parent'
      WHEN oa.user_id       IS NOT NULL THEN 'org_admin'
      ELSE 'tutor'
    END
  FROM other o
  JOIN chat_conversations c ON c.id = o.conversation_id
  LEFT JOIN profiles        p  ON p.id = o.other_uid
  LEFT JOIN LATERAL (
    SELECT s2.full_name, s2.email, s2.linked_user_id
    FROM students s2 WHERE s2.linked_user_id = o.other_uid
    ORDER BY s2.created_at DESC LIMIT 1
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT pp2.full_name, pp2.email, pp2.user_id
    FROM parent_profiles pp2 WHERE pp2.user_id = o.other_uid
    LIMIT 1
  ) pp ON true
  LEFT JOIN LATERAL (
    SELECT oa2.user_id
    FROM organization_admins oa2 WHERE oa2.user_id = o.other_uid
    LIMIT 1
  ) oa ON true
  LEFT JOIN LATERAL (
    SELECT m.content, m.message_type, m.sender_id, m.created_at
    FROM chat_messages m WHERE m.conversation_id = o.conversation_id
    ORDER BY m.created_at DESC LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM chat_messages m2
    WHERE m2.conversation_id = o.conversation_id
      AND m2.sender_id != auth.uid()
      AND m2.created_at > COALESCE(o.last_read_at, '1970-01-01'::timestamptz)
  ) ur ON true
  ORDER BY c.last_message_at DESC;
$function$;

-- ═══════════════════════════════════════════════════════════════════
-- 6. ADD TARGETED INDEXES
-- ═══════════════════════════════════════════════════════════════════
-- These cover the remaining seq-scan bottlenecks.

-- Sessions: active + unpaid (payment crons filter on this constantly)
CREATE INDEX IF NOT EXISTS idx_sessions_active_unpaid
  ON public.sessions (status, paid)
  WHERE status = 'active' AND paid = false;

-- Sessions: active + end_time (auto-complete cron)
CREATE INDEX IF NOT EXISTS idx_sessions_active_end_time
  ON public.sessions (end_time)
  WHERE status = 'active';

-- Chat messages: conversation lookup by recency (get_my_conversations)
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
  ON public.chat_messages (conversation_id, created_at DESC);

-- Students: linked_user_id lookup (get_my_conversations LATERAL)
CREATE INDEX IF NOT EXISTS idx_students_linked_user_id
  ON public.students (linked_user_id) WHERE linked_user_id IS NOT NULL;

-- Parent profiles: user_id lookup (RLS + get_my_conversations)
CREATE INDEX IF NOT EXISTS idx_parent_profiles_user_id
  ON public.parent_profiles (user_id);

-- Organization admins: user_id lookup (RLS + conversation kind)
CREATE INDEX IF NOT EXISTS idx_organization_admins_user_id
  ON public.organization_admins (user_id);

-- Analytics: pageview + created_at (admin stats RPCs filter on this)
CREATE INDEX IF NOT EXISTS idx_analytics_events_pageview_created
  ON public.analytics_events (created_at DESC)
  WHERE event_name = 'pageview';

-- Invoices: foreign key covering index (Supabase perf advisor flag)
CREATE INDEX IF NOT EXISTS idx_invoices_billing_batch
  ON public.invoices (billing_batch_id)
  WHERE billing_batch_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 7. ANALYZE TABLES after index changes
-- ═══════════════════════════════════════════════════════════════════
ANALYZE public.sessions;
ANALYZE public.chat_messages;
ANALYZE public.students;
ANALYZE public.parent_profiles;
ANALYZE public.organization_admins;
ANALYZE public.analytics_events;
ANALYZE public.invoices;
