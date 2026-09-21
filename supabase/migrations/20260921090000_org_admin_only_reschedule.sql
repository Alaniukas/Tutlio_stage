-- Mokslo vaisiai: only organization admins with lesson-edit permission may
-- change the time of an existing lesson. Cancellation remains independent.
UPDATE public.organizations
SET features = COALESCE(features, '{}'::jsonb)
  || jsonb_build_object('org_admin_only_reschedule', true)
WHERE id IN (
  'c1f36796-c281-4650-bed2-1bd6874764f1', -- Mokslo vaisiai
  'c1b00000-7e57-4000-8000-000000000001'  -- demo Mokslo vaisiai
);

-- A trigger covers the student/parent RPC as well as direct tutor updates.
-- Service-role jobs have no auth.uid() and retain their existing behavior.
CREATE OR REPLACE FUNCTION public.guard_org_admin_only_reschedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_org_id uuid;
BEGIN
  IF v_actor IS NULL
     OR (NEW.start_time IS NOT DISTINCT FROM OLD.start_time
         AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(p.organization_id, s.organization_id)
  INTO v_org_id
  FROM public.students s
  LEFT JOIN public.profiles p ON p.id = OLD.tutor_id
  WHERE s.id = OLD.student_id;

  IF v_org_id IS NOT NULL
     AND public.org_has_feature(v_org_id, 'org_admin_only_reschedule')
     AND NOT EXISTS (
       SELECT 1
       FROM public.organization_admins oa
       WHERE oa.organization_id = v_org_id
         AND oa.user_id = v_actor
         AND oa.status = 'active'
         AND oa.accepted_at IS NOT NULL
         AND (oa.role = 'owner' OR COALESCE(oa.permissions ->> 'sessions.edit', 'false') = 'true')
     ) THEN
    RAISE EXCEPTION 'org_admin_only_reschedule'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_org_admin_only_reschedule ON public.sessions;
CREATE TRIGGER guard_org_admin_only_reschedule
  BEFORE UPDATE OF start_time, end_time ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_org_admin_only_reschedule();
