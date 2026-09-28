-- Each class group chooses its own viable roster size. Temporary individual
-- contract pauses retain the original membership for a later exact restore.
ALTER TABLE public.school_class_groups
  ADD COLUMN IF NOT EXISTS minimum_active_students integer NOT NULL DEFAULT 3;

ALTER TABLE public.school_class_groups
  DROP CONSTRAINT IF EXISTS school_class_groups_minimum_active_students_check;
ALTER TABLE public.school_class_groups
  ADD CONSTRAINT school_class_groups_minimum_active_students_check
  CHECK (minimum_active_students IN (2, 3));

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS suspended_group_membership jsonb;
ALTER TABLE public.school_contracts
  DROP CONSTRAINT IF EXISTS school_contracts_suspended_group_membership_check;
ALTER TABLE public.school_contracts
  ADD CONSTRAINT school_contracts_suspended_group_membership_check
  CHECK (suspended_group_membership IS NULL OR jsonb_typeof(suspended_group_membership) = 'object');

COMMENT ON COLUMN public.school_contracts.suspended_group_membership IS
  'Original group_id, student_id, enrolled_at and schedule_slots saved before an individual contract pause removes the child from the active roster. Restored only while that agreement remains eligible.';

-- Tutors may edit their own group, but only an organization administrator may
-- change the minimum. Service-role API calls enforce the same check in code.
CREATE OR REPLACE FUNCTION private.guard_school_group_minimum()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.minimum_active_students = 3)
    OR (TG_OP = 'UPDATE' AND NEW.minimum_active_students IS NOT DISTINCT FROM OLD.minimum_active_students)
    OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_admins oa
    WHERE oa.organization_id = NEW.organization_id AND oa.user_id = auth.uid()
      AND oa.status = 'active'
      AND (oa.role = 'owner' OR oa.permissions @> '{"sessions.edit": true}'::jsonb
        OR private.org_admin_role_grants_permission(oa.role, 'sessions.edit'))
  ) OR NOT private.org_admin_permission_gate(ARRAY['sessions.edit']) THEN
    RAISE EXCEPTION 'Only organization administrators may change the group minimum'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_school_group_minimum ON public.school_class_groups;
CREATE TRIGGER guard_school_group_minimum BEFORE INSERT OR UPDATE ON public.school_class_groups
  FOR EACH ROW EXECUTE FUNCTION private.guard_school_group_minimum();
