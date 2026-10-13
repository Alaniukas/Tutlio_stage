-- Server-only projection. Do not expose auth.users or account metadata to browsers.
CREATE OR REPLACE FUNCTION public.org_student_registration_states(
  p_organization_id uuid,
  p_tutor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  student_id uuid, full_name text, registration_pending boolean,
  pending_since timestamptz, next_session_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.id, s.full_name,
    NOT COALESCE(accounts.activated, false), s.created_at,
    upcoming.start_time
  FROM public.students s
  LEFT JOIN LATERAL (
    SELECT bool_or(
      u.last_sign_in_at IS NOT NULL
      OR NULLIF(u.raw_app_meta_data->>'mv_account_activated_at', '') IS NOT NULL
      -- Compatibility with activation links issued before the server-owned stamp.
      OR NULLIF(u.raw_user_meta_data->>'mv_account_activated_at', '') IS NOT NULL
      -- Self-registration creates a confirmed account; pre-provisioning does too,
      -- so email_confirmed_at alone must never activate a managed account.
      OR (NOT COALESCE(u.raw_app_meta_data ? 'provisioned_by_organization', false)
          AND u.email_confirmed_at IS NOT NULL)
    ) AS activated
    FROM (
        SELECT s.linked_user_id AS user_id
        UNION SELECT s.parent_user_id
        UNION
        SELECT p.user_id FROM public.parent_students ps
        JOIN public.parent_profiles p ON p.id = ps.parent_id
        WHERE ps.student_id = s.id
    ) links
    JOIN auth.users u ON u.id = links.user_id
  ) accounts ON true
  LEFT JOIN LATERAL (
    SELECT se.start_time FROM public.sessions se
    WHERE se.student_id = s.id AND se.tutor_id = s.tutor_id
      AND se.status = 'active' AND se.start_time > now()
    ORDER BY se.start_time LIMIT 1
  ) upcoming ON true
  WHERE s.organization_id = p_organization_id
    AND (p_tutor_id IS NULL OR s.tutor_id = p_tutor_id)
    AND s.detached_at IS NULL
    AND COALESCE(s.enrollment_status, 'active') NOT IN ('left', 'graduated')
  ORDER BY s.id;
$$;
REVOKE ALL ON FUNCTION public.org_student_registration_states(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.org_student_registration_states(uuid, uuid) TO service_role;

-- A confirmed delivery is remembered across cron runs and tutor assignments.
CREATE TABLE public.student_registration_reminders (
  delivery_key text PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.student_registration_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.student_registration_reminders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.student_registration_reminders TO service_role;

-- Reflect the default rollout in the platform feature controls; preserve an explicit opt-out.
UPDATE public.organizations
SET features = COALESCE(features, '{}'::jsonb) || '{"pending_registration_lessons":true}'::jsonb
WHERE id IN ('3422031d-6e21-424d-980b-35a9c6d7b8f1', 'b0a00000-7e57-4000-8000-000000000001')
  AND NOT (COALESCE(features, '{}'::jsonb) ? 'pending_registration_lessons');
