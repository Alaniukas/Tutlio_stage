-- Allow more than one active owner (e.g. director + operator super-admin).
-- Organizations must still keep at least one active owner.

DROP INDEX IF EXISTS public.organization_admins_one_active_owner_per_org;

CREATE OR REPLACE FUNCTION private.assert_org_has_one_active_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_org_id uuid;
  v_owner_count integer;
BEGIN
  FOR v_org_id IN
    SELECT DISTINCT candidate.organization_id
    FROM unnest(
      CASE TG_OP
        WHEN 'INSERT' THEN ARRAY[NEW.organization_id]
        WHEN 'DELETE' THEN ARRAY[OLD.organization_id]
        ELSE ARRAY[OLD.organization_id, NEW.organization_id]
      END
    ) AS candidate(organization_id)
    WHERE candidate.organization_id IS NOT NULL
  LOOP
    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org_id) THEN
      CONTINUE;
    END IF;

    SELECT COUNT(*) INTO v_owner_count
    FROM public.organization_admins
    WHERE organization_id = v_org_id
      AND role = 'owner'
      AND status = 'active';

    IF v_owner_count < 1 THEN
      RAISE EXCEPTION 'Organization % must have at least one active owner', v_org_id;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
