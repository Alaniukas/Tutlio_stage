-- Cancellation and rescheduling have separate family-portal permissions.
-- Keep direct authenticated updates subject to the same cancellation rule as
-- /api/cancel-session, even inside the rescheduling RPC's column-guard bypass.
CREATE OR REPLACE FUNCTION public.guard_disable_student_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org_id uuid;
BEGIN
  IF v_actor IS NULL
     OR NEW.status IS DISTINCT FROM 'cancelled'
     OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.organization_id, s.organization_id)
  INTO v_org_id
  FROM public.students s
  LEFT JOIN public.profiles p ON p.id = OLD.tutor_id
  WHERE s.id = OLD.student_id;

  IF v_org_id IS NOT NULL
     AND public.org_has_feature(v_org_id, 'disable_student_cancel')
     AND v_actor IS DISTINCT FROM OLD.tutor_id
     AND NOT EXISTS (
       SELECT 1
       FROM public.organization_admins oa
       WHERE oa.organization_id = v_org_id
         AND oa.user_id = v_actor
         AND oa.status = 'active'
         AND oa.accepted_at IS NOT NULL
         AND (oa.role = 'owner' OR COALESCE(oa.permissions ->> 'sessions.edit', 'false') = 'true')
     ) THEN
    RAISE EXCEPTION 'disable_student_cancel' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_disable_student_cancel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_disable_student_cancel ON public.sessions;
CREATE TRIGGER guard_disable_student_cancel
  BEFORE UPDATE OF status ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_disable_student_cancel();

-- MV families can move lessons themselves, but cancellation goes through staff.
-- Preserve all unrelated organization settings, including contact/brand fields.
UPDATE public.organizations
SET features = COALESCE(features, '{}'::jsonb)
  || jsonb_build_object(
    'disable_student_cancel', true,
    'disable_student_reschedule', false,
    'disable_student_reschedule_cancel', false
  )
WHERE id IN (
  'c1f36796-c281-4650-bed2-1bd6874764f1', -- Mokslo vaisiai
  'c1b00000-7e57-4000-8000-000000000001'  -- demo Mokslo vaisiai
);
