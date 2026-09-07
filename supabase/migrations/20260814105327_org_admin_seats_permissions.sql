-- Organization admin seats and least-privilege access controls.
-- Existing organizations keep exactly one owner; any historical additional
-- admins become regular administrators with the full administrator preset.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER TABLE public.organization_admins
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS permissions jsonb,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS invited_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.organization_admins
SET permissions = COALESCE(permissions, '{}'::jsonb),
    status = COALESCE(status, 'active'),
    accepted_at = COALESCE(accepted_at, created_at, now()),
    updated_at = COALESCE(updated_at, created_at, now());

-- Keep one deterministic owner per organization if co-admin rows were ever
-- provisioned manually before this feature existed.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY organization_id
           ORDER BY created_at ASC, id ASC
         ) AS position
  FROM public.organization_admins
)
UPDATE public.organization_admins oa
SET role = CASE WHEN ranked.position = 1 THEN 'owner' ELSE 'admin' END,
    permissions = CASE
      WHEN ranked.position = 1 THEN '{}'::jsonb
      ELSE jsonb_build_object(
        'dashboard.view', true,
        'tutors.view', true, 'tutors.edit', true,
        'students.view', true, 'students.edit', true,
        'sessions.view', true, 'sessions.edit', true,
        'messages.view', true, 'messages.edit', true,
        'stats.view', true,
        'finance.view', true, 'finance.edit', true,
        'contracts.view', true, 'contracts.edit', true,
        'settings.view', true, 'settings.edit', true
      )
    END
FROM ranked
WHERE ranked.id = oa.id
  AND oa.role IS NULL;

ALTER TABLE public.organization_admins
  ALTER COLUMN role SET DEFAULT 'owner',
  ALTER COLUMN role SET NOT NULL,
  ALTER COLUMN permissions SET DEFAULT '{}'::jsonb,
  ALTER COLUMN permissions SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.organization_admins
  DROP CONSTRAINT IF EXISTS organization_admins_role_check,
  ADD CONSTRAINT organization_admins_role_check
    CHECK (role IN ('owner', 'admin', 'accountant', 'custom')),
  DROP CONSTRAINT IF EXISTS organization_admins_status_check,
  ADD CONSTRAINT organization_admins_status_check
    CHECK (status IN ('active', 'suspended')),
  DROP CONSTRAINT IF EXISTS organization_admins_permissions_object_check,
  ADD CONSTRAINT organization_admins_permissions_object_check
    CHECK (jsonb_typeof(permissions) = 'object');

CREATE UNIQUE INDEX IF NOT EXISTS organization_admins_one_active_owner_per_org
  ON public.organization_admins(organization_id)
  WHERE role = 'owner' AND status = 'active';

CREATE INDEX IF NOT EXISTS organization_admins_org_status_idx
  ON public.organization_admins(organization_id, status);

CREATE INDEX IF NOT EXISTS organization_admins_user_status_idx
  ON public.organization_admins(user_id, status);

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
  -- An UPDATE can move a seat between organizations, so assert both the old
  -- and new organization instead of checking only the destination.
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
    -- Organization deletion cascades its seats; there is nothing left to assert.
    IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org_id) THEN
      CONTINUE;
    END IF;

    SELECT COUNT(*) INTO v_owner_count
    FROM public.organization_admins
    WHERE organization_id = v_org_id
      AND role = 'owner'
      AND status = 'active';

    IF v_owner_count <> 1 THEN
      RAISE EXCEPTION 'Organization % must have exactly one active owner', v_org_id;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.assert_org_has_one_active_owner() FROM PUBLIC;
DROP TRIGGER IF EXISTS organization_admins_exactly_one_owner ON public.organization_admins;
CREATE CONSTRAINT TRIGGER organization_admins_exactly_one_owner
  AFTER INSERT OR UPDATE OR DELETE ON public.organization_admins
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.assert_org_has_one_active_owner();

COMMENT ON COLUMN public.organization_admins.role IS
  'Organization seat role: owner, administrator preset, accountant preset, or custom.';
COMMENT ON COLUMN public.organization_admins.permissions IS
  'Effective per-seat permission map. Owner access is unconditional and is not stored here.';
COMMENT ON COLUMN public.organization_admins.accepted_at IS
  'Null while the invited user has not yet completed their first authenticated portal visit.';

-- Audit membership and permission changes without exposing them through the
-- Data API. The management API uses service_role and returns only scoped data.
CREATE TABLE IF NOT EXISTS public.organization_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.organization_admin_audit FROM anon, authenticated;
GRANT ALL ON TABLE public.organization_admin_audit TO service_role;
CREATE INDEX IF NOT EXISTS organization_admin_audit_org_created_idx
  ON public.organization_admin_audit(organization_id, created_at DESC);

-- Supabase access JWTs remain valid until their expiry even after sign-out or
-- auth-user deletion. Keep a private revocation tombstone so a removed seat's
-- last JWT is denied immediately by every restrictive permission policy.
CREATE TABLE IF NOT EXISTS private.revoked_org_admin_users (
  user_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.revoked_org_admin_users FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE private.revoked_org_admin_users TO service_role;

-- A restrictive-policy gate. It returns true for users who are not organization
-- admins, preserving all existing tutor/student/parent policies. For an admin
-- seat it requires an active membership and at least one requested permission.
CREATE OR REPLACE FUNCTION private.org_admin_permission_gate(p_required text[] DEFAULT ARRAY[]::text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT CASE
    WHEN (SELECT auth.uid()) IS NULL THEN false
    WHEN EXISTS (
      SELECT 1
      FROM private.revoked_org_admin_users revoked
      WHERE revoked.user_id = (SELECT auth.uid())
    ) THEN false
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.organization_admins membership
      WHERE membership.user_id = (SELECT auth.uid())
    ) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.organization_admins membership
      WHERE membership.user_id = (SELECT auth.uid())
        AND membership.status = 'active'
        AND (
          membership.role = 'owner'
          OR cardinality(p_required) = 0
          OR EXISTS (
            SELECT 1
            FROM unnest(p_required) AS requested(permission_key)
            WHERE membership.permissions @> jsonb_build_object(requested.permission_key, true)
          )
        )
    )
  END;
$$;

REVOKE ALL ON FUNCTION private.org_admin_permission_gate(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.org_admin_permission_gate(text[]) TO authenticated, service_role;

-- Safe co-admin ID lookup used only to exclude administration seats from tutor
-- lists. Returning UUIDs avoids the recursive organization_admins SELECT
-- policy that previously caused production login hangs.
CREATE OR REPLACE FUNCTION public.get_my_org_admin_user_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT teammate.user_id
  FROM public.organization_admins caller
  JOIN public.organization_admins teammate
    ON teammate.organization_id = caller.organization_id
   AND teammate.status = 'active'
   AND teammate.accepted_at IS NOT NULL
  WHERE caller.user_id = (SELECT auth.uid())
    AND caller.status = 'active'
    AND caller.accepted_at IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_my_org_admin_user_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_org_admin_user_ids() TO authenticated, service_role;

-- Return only tutor profile IDs needed by organization UI. This avoids
-- granting messages-only seats SELECT access to tutor_invite secrets merely
-- so the inbox can identify accepted organization tutors.
CREATE OR REPLACE FUNCTION public.get_my_org_visible_tutor_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  WITH caller AS (
    SELECT admin.organization_id
    FROM public.organization_admins admin
    WHERE admin.user_id = (SELECT auth.uid())
      AND admin.status = 'active'
      AND private.org_admin_permission_gate(ARRAY[
        'dashboard.view', 'tutors.view', 'tutors.edit', 'students.view', 'students.edit',
        'sessions.view', 'sessions.edit', 'messages.view', 'messages.edit', 'stats.view',
        'finance.view', 'finance.edit', 'contracts.view', 'contracts.edit',
        'settings.view', 'settings.edit'
      ])
  )
  SELECT DISTINCT student.tutor_id AS user_id
  FROM caller
  JOIN public.students student ON student.organization_id = caller.organization_id
  WHERE student.tutor_id IS NOT NULL
  UNION
  SELECT DISTINCT invite.used_by_profile_id AS user_id
  FROM caller
  JOIN public.tutor_invites invite ON invite.organization_id = caller.organization_id
  WHERE invite.used_by_profile_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_my_org_visible_tutor_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_org_visible_tutor_ids() TO authenticated, service_role;

-- Atomic ownership transfer. Only service_role can execute it; the HTTP API
-- validates the acting owner before invoking the transaction.
CREATE OR REPLACE FUNCTION public.transfer_org_admin_ownership(
  p_org_id uuid,
  p_current_owner_user_id uuid,
  p_new_owner_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_admin_permissions jsonb := jsonb_build_object(
    'dashboard.view', true,
    'tutors.view', true, 'tutors.edit', true,
    'students.view', true, 'students.edit', true,
    'sessions.view', true, 'sessions.edit', true,
    'messages.view', true, 'messages.edit', true,
    'stats.view', true,
    'finance.view', true, 'finance.edit', true,
    'contracts.view', true, 'contracts.edit', true,
    'settings.view', true, 'settings.edit', true
  );
BEGIN
  PERFORM 1
  FROM public.organization_admins
  WHERE organization_id = p_org_id
    AND user_id IN (p_current_owner_user_id, p_new_owner_user_id)
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_admins
    WHERE organization_id = p_org_id
      AND user_id = p_current_owner_user_id
      AND role = 'owner'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Current owner membership not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_admins
    WHERE organization_id = p_org_id
      AND user_id = p_new_owner_user_id
      AND status = 'active'
      AND accepted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'New owner membership not found, inactive, or unaccepted';
  END IF;

  UPDATE public.organization_admins
  SET role = 'admin',
      permissions = v_admin_permissions,
      updated_at = now()
  WHERE organization_id = p_org_id
    AND user_id = p_current_owner_user_id;

  UPDATE public.organization_admins
  SET role = 'owner',
      permissions = '{}'::jsonb,
      updated_at = now()
  WHERE organization_id = p_org_id
    AND user_id = p_new_owner_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_org_admin_ownership(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_org_admin_ownership(uuid, uuid, uuid) TO service_role;

-- Revoke a seat before deleting its auth user. The private tombstone survives
-- the auth.users cascade and closes the otherwise-valid JWT immediately.
CREATE OR REPLACE FUNCTION public.revoke_org_admin_seat(
  p_org_id uuid,
  p_owner_user_id uuid,
  p_target_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
BEGIN
  PERFORM 1
  FROM public.organization_admins
  WHERE organization_id = p_org_id
    AND user_id IN (p_owner_user_id, p_target_user_id)
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_admins
    WHERE organization_id = p_org_id
      AND user_id = p_owner_user_id
      AND role = 'owner'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active owner membership not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_admins
    WHERE organization_id = p_org_id
      AND user_id = p_target_user_id
      AND role <> 'owner'
  ) THEN
    RAISE EXCEPTION 'Removable target membership not found';
  END IF;

  INSERT INTO private.revoked_org_admin_users (user_id, organization_id, revoked_at)
  VALUES (p_target_user_id, p_org_id, now())
  ON CONFLICT (user_id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id,
        revoked_at = EXCLUDED.revoked_at;

  UPDATE public.organization_admins
  SET status = 'suspended',
      revoked_at = now(),
      updated_at = now()
  WHERE organization_id = p_org_id
    AND user_id = p_target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_org_admin_seat(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_org_admin_seat(uuid, uuid, uuid) TO service_role;

-- Keep the login lookup non-recursive. A suspended/removed user can still see
-- only their own seat marker so account detection cannot misclassify the
-- profile as an organization tutor; all organization data stays gated below.
DROP POLICY IF EXISTS "Org admin reads own row" ON public.organization_admins;
DROP POLICY IF EXISTS "Org admin reads own active row" ON public.organization_admins;
CREATE POLICY "Org admin reads own row" ON public.organization_admins
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS org_admin_permission_select ON public.organization_admins;
CREATE POLICY org_admin_permission_select ON public.organization_admins
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR private.org_admin_permission_gate(ARRAY[]::text[])
  );

-- Organization identity is required by every portal seat. Mutations remain a
-- settings permission.
DROP POLICY IF EXISTS org_admin_permission_select ON public.organizations;
CREATE POLICY org_admin_permission_select ON public.organizations
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.org_admin_permission_gate(ARRAY[]::text[]));

DROP POLICY IF EXISTS org_admin_permission_update ON public.organizations;
CREATE POLICY org_admin_permission_update ON public.organizations
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (private.org_admin_permission_gate(ARRAY['settings.edit']))
  WITH CHECK (private.org_admin_permission_gate(ARRAY['settings.edit']));

-- Admin seats still need their own profile for locale/name. Reading or editing
-- other profiles is permission-gated.
DROP POLICY IF EXISTS org_admin_permission_select ON public.profiles;
CREATE POLICY org_admin_permission_select ON public.profiles
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR private.org_admin_permission_gate(ARRAY[
      'dashboard.view', 'tutors.view', 'tutors.edit', 'students.view', 'students.edit',
      'sessions.view', 'sessions.edit', 'messages.view', 'messages.edit', 'stats.view',
      'finance.view', 'finance.edit', 'contracts.view', 'contracts.edit',
      'settings.view', 'settings.edit'
    ])
  );

DROP POLICY IF EXISTS org_admin_permission_update ON public.profiles;
CREATE POLICY org_admin_permission_update ON public.profiles
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR private.org_admin_permission_gate(ARRAY['tutors.edit']))
  WITH CHECK (id = (SELECT auth.uid()) OR private.org_admin_permission_gate(ARRAY['tutors.edit']));

-- Apply the same least-privilege gate across existing data-domain policies.
-- Existing permissive policies continue to enforce organization ownership;
-- these restrictive policies add the seat permission as an AND condition.
DO $$
DECLARE
  permission_row record;
  operation_name text;
BEGIN
  FOR permission_row IN
    SELECT * FROM (VALUES
      ('tutor_invites', ARRAY['dashboard.view','tutors.view','tutors.edit']::text[], ARRAY['tutors.edit']::text[]),
      ('students', ARRAY['dashboard.view','students.view','students.edit','sessions.view','sessions.edit','messages.view','messages.edit','stats.view','finance.view','finance.edit','contracts.view','contracts.edit']::text[], ARRAY['students.edit']::text[]),
      ('waitlists', ARRAY['students.view','students.edit']::text[], ARRAY['students.edit']::text[]),
      ('parent_profiles', ARRAY['students.view','students.edit','messages.view','messages.edit','finance.view','finance.edit','contracts.view','contracts.edit']::text[], ARRAY['students.edit']::text[]),
      ('parent_students', ARRAY['students.view','students.edit','messages.view','messages.edit','finance.view','finance.edit','contracts.view','contracts.edit']::text[], ARRAY['students.edit']::text[]),
      ('parent_invites', ARRAY['students.view','students.edit']::text[], ARRAY['students.edit']::text[]),
      ('sessions', ARRAY['dashboard.view','sessions.view','sessions.edit','stats.view','finance.view','finance.edit']::text[], ARRAY['sessions.edit']::text[]),
      ('availability', ARRAY['sessions.view','sessions.edit']::text[], ARRAY['sessions.edit']::text[]),
      ('recurring_individual_sessions', ARRAY['sessions.view','sessions.edit']::text[], ARRAY['sessions.edit']::text[]),
      ('subjects', ARRAY['dashboard.view','tutors.view','tutors.edit','sessions.view','sessions.edit','stats.view','finance.view','finance.edit','contracts.view','contracts.edit','settings.view','settings.edit']::text[], ARRAY['settings.edit']::text[]),
      ('student_individual_pricing', ARRAY['students.view','students.edit','finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('student_payment_methods', ARRAY['students.view','students.edit','finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('tutor_subject_prices', ARRAY['tutors.view','tutors.edit','finance.view','finance.edit','settings.view','settings.edit']::text[], ARRAY['settings.edit','finance.edit']::text[]),
      ('organization_dynamic_pricing', ARRAY['finance.view','finance.edit','settings.view','settings.edit']::text[], ARRAY['finance.edit','settings.edit']::text[]),
      ('lesson_packages', ARRAY['dashboard.view','students.view','students.edit','sessions.view','sessions.edit','finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('lesson_package_items', ARRAY['dashboard.view','students.view','students.edit','sessions.view','sessions.edit','finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('recurring_monthly_package_plans', ARRAY['students.view','students.edit','finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('billing_batches', ARRAY['dashboard.view','finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('billing_batch_sessions', ARRAY['finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('invoice_profiles', ARRAY['finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('invoices', ARRAY['finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('invoice_line_items', ARRAY['finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('platform_invoices', ARRAY['finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('payments', ARRAY['finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('payouts', ARRAY['finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('payout_batches', ARRAY['finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('payout_fee_records', ARRAY['finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('perlas_ledger', ARRAY['finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('tutor_adjustments', ARRAY['tutors.view','tutors.edit','finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('school_contract_templates', ARRAY['contracts.view','contracts.edit']::text[], ARRAY['contracts.edit']::text[]),
      ('school_contracts', ARRAY['dashboard.view','contracts.view','contracts.edit','finance.view','finance.edit']::text[], ARRAY['contracts.edit']::text[]),
      ('school_contract_signatures', ARRAY['contracts.view','contracts.edit']::text[], ARRAY['contracts.edit']::text[]),
      ('school_payment_installments', ARRAY['dashboard.view','contracts.view','contracts.edit','finance.view','finance.edit']::text[], ARRAY['finance.edit']::text[]),
      ('chat_conversations', ARRAY['messages.view','messages.edit']::text[], ARRAY['messages.edit']::text[]),
      ('chat_participants', ARRAY['messages.view','messages.edit']::text[], ARRAY['messages.edit']::text[]),
      ('chat_messages', ARRAY['messages.view','messages.edit']::text[], ARRAY['messages.edit']::text[]),
      ('public_pages', ARRAY['settings.view','settings.edit']::text[], ARRAY['settings.edit']::text[])
    ) AS permissions(table_name, view_permissions, edit_permissions)
  LOOP
    IF to_regclass('public.' || permission_row.table_name) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS org_admin_permission_select ON public.%I', permission_row.table_name);
    EXECUTE format(
      'CREATE POLICY org_admin_permission_select ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (private.org_admin_permission_gate(%L::text[]))',
      permission_row.table_name,
      permission_row.view_permissions
    );

    FOREACH operation_name IN ARRAY ARRAY['insert', 'update', 'delete']
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS org_admin_permission_%s ON public.%I', operation_name, permission_row.table_name);
      IF operation_name = 'insert' THEN
        EXECUTE format(
          'CREATE POLICY org_admin_permission_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (private.org_admin_permission_gate(%L::text[]))',
          permission_row.table_name,
          permission_row.edit_permissions
        );
      ELSIF operation_name = 'update' THEN
        EXECUTE format(
          'CREATE POLICY org_admin_permission_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (private.org_admin_permission_gate(%L::text[])) WITH CHECK (private.org_admin_permission_gate(%L::text[]))',
          permission_row.table_name,
          permission_row.edit_permissions,
          permission_row.edit_permissions
        );
      ELSE
        EXECUTE format(
          'CREATE POLICY org_admin_permission_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (private.org_admin_permission_gate(%L::text[]))',
          permission_row.table_name,
          permission_row.edit_permissions
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Inactive seats must be denied across every bucket, including buckets whose
-- historical policies still look only at organization membership.
DROP POLICY IF EXISTS org_admin_active_seat_select ON storage.objects;
CREATE POLICY org_admin_active_seat_select ON storage.objects
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (private.org_admin_permission_gate(ARRAY[]::text[]));

DROP POLICY IF EXISTS org_admin_active_seat_insert ON storage.objects;
CREATE POLICY org_admin_active_seat_insert ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (private.org_admin_permission_gate(ARRAY[]::text[]));

DROP POLICY IF EXISTS org_admin_active_seat_update ON storage.objects;
CREATE POLICY org_admin_active_seat_update ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (private.org_admin_permission_gate(ARRAY[]::text[]))
  WITH CHECK (private.org_admin_permission_gate(ARRAY[]::text[]));

DROP POLICY IF EXISTS org_admin_active_seat_delete ON storage.objects;
CREATE POLICY org_admin_active_seat_delete ON storage.objects
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (private.org_admin_permission_gate(ARRAY[]::text[]));

-- Contract files follow the same contract permission as contract rows while
-- leaving every other bucket's existing policies untouched.
DROP POLICY IF EXISTS org_admin_permission_contract_files_select ON storage.objects;
CREATE POLICY org_admin_permission_contract_files_select ON storage.objects
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    bucket_id <> 'school-contracts'
    OR private.org_admin_permission_gate(ARRAY['contracts.view','contracts.edit'])
  );

DROP POLICY IF EXISTS org_admin_permission_contract_files_insert ON storage.objects;
CREATE POLICY org_admin_permission_contract_files_insert ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'school-contracts'
    OR private.org_admin_permission_gate(ARRAY['contracts.edit'])
  );

DROP POLICY IF EXISTS org_admin_permission_contract_files_update ON storage.objects;
CREATE POLICY org_admin_permission_contract_files_update ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    bucket_id <> 'school-contracts'
    OR private.org_admin_permission_gate(ARRAY['contracts.edit'])
  )
  WITH CHECK (
    bucket_id <> 'school-contracts'
    OR private.org_admin_permission_gate(ARRAY['contracts.edit'])
  );

DROP POLICY IF EXISTS org_admin_permission_contract_files_delete ON storage.objects;
CREATE POLICY org_admin_permission_contract_files_delete ON storage.objects
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    bucket_id <> 'school-contracts'
    OR private.org_admin_permission_gate(ARRAY['contracts.edit'])
  );

-- Other private organization file domains follow their corresponding module.
-- Non-admin tutors/students/parents continue through their existing policies
-- because the permission gate returns true for users without an admin seat.
DROP POLICY IF EXISTS org_admin_permission_domain_files_select ON storage.objects;
CREATE POLICY org_admin_permission_domain_files_select ON storage.objects
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    CASE bucket_id
      WHEN 'invoices' THEN private.org_admin_permission_gate(ARRAY['finance.view','finance.edit'])
      WHEN 'session-files' THEN private.org_admin_permission_gate(ARRAY['sessions.view','sessions.edit'])
      WHEN 'whiteboard-data' THEN private.org_admin_permission_gate(ARRAY['sessions.view','sessions.edit'])
      ELSE true
    END
  );

DROP POLICY IF EXISTS org_admin_permission_domain_files_insert ON storage.objects;
CREATE POLICY org_admin_permission_domain_files_insert ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    CASE bucket_id
      WHEN 'invoices' THEN private.org_admin_permission_gate(ARRAY['finance.edit'])
      WHEN 'session-files' THEN private.org_admin_permission_gate(ARRAY['sessions.edit'])
      WHEN 'whiteboard-data' THEN private.org_admin_permission_gate(ARRAY['sessions.edit'])
      WHEN 'public-pages' THEN private.org_admin_permission_gate(ARRAY['settings.edit'])
      ELSE true
    END
  );

DROP POLICY IF EXISTS org_admin_permission_domain_files_update ON storage.objects;
CREATE POLICY org_admin_permission_domain_files_update ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    CASE bucket_id
      WHEN 'invoices' THEN private.org_admin_permission_gate(ARRAY['finance.edit'])
      WHEN 'session-files' THEN private.org_admin_permission_gate(ARRAY['sessions.edit'])
      WHEN 'whiteboard-data' THEN private.org_admin_permission_gate(ARRAY['sessions.edit'])
      WHEN 'public-pages' THEN private.org_admin_permission_gate(ARRAY['settings.edit'])
      ELSE true
    END
  )
  WITH CHECK (
    CASE bucket_id
      WHEN 'invoices' THEN private.org_admin_permission_gate(ARRAY['finance.edit'])
      WHEN 'session-files' THEN private.org_admin_permission_gate(ARRAY['sessions.edit'])
      WHEN 'whiteboard-data' THEN private.org_admin_permission_gate(ARRAY['sessions.edit'])
      WHEN 'public-pages' THEN private.org_admin_permission_gate(ARRAY['settings.edit'])
      ELSE true
    END
  );

DROP POLICY IF EXISTS org_admin_permission_domain_files_delete ON storage.objects;
CREATE POLICY org_admin_permission_domain_files_delete ON storage.objects
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    CASE bucket_id
      WHEN 'invoices' THEN private.org_admin_permission_gate(ARRAY['finance.edit'])
      WHEN 'session-files' THEN private.org_admin_permission_gate(ARRAY['sessions.edit'])
      WHEN 'whiteboard-data' THEN private.org_admin_permission_gate(ARRAY['sessions.edit'])
      WHEN 'public-pages' THEN private.org_admin_permission_gate(ARRAY['settings.edit'])
      ELSE true
    END
  );

-- SECURITY DEFINER messaging helpers cannot rely on caller RLS. Keep their
-- seat checks centralized and do not expose this helper outside the database.
CREATE OR REPLACE FUNCTION private.org_admin_user_has_permission(
  p_user_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_admins oa
    WHERE oa.user_id = p_user_id
      AND oa.status = 'active'
      AND oa.accepted_at IS NOT NULL
      AND (
        oa.role = 'owner'
        OR COALESCE(oa.permissions ->> p_permission, 'false') = 'true'
      )
  );
$$;

REVOKE ALL ON FUNCTION private.org_admin_user_has_permission(uuid, text) FROM PUBLIC;

-- A tutor/student/parent must not be able to keep sending into an existing
-- conversation after the recipient admin seat loses message access.
CREATE OR REPLACE FUNCTION private.chat_recipients_allow_messages(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.chat_participants participant
    JOIN public.organization_admins admin
      ON admin.user_id = participant.user_id
    WHERE participant.conversation_id = p_conversation_id
      AND participant.user_id <> (SELECT auth.uid())
      AND NOT private.org_admin_user_has_permission(admin.user_id, 'messages.view')
  );
$$;

REVOKE ALL ON FUNCTION private.chat_recipients_allow_messages(uuid) FROM PUBLIC;

-- Viewing an inbox updates only the caller's read cursor. Keep that available
-- to read-only seats while inserts/deletes and message rows still require edit.
DROP POLICY IF EXISTS org_admin_permission_update ON public.chat_participants;
CREATE POLICY org_admin_permission_update ON public.chat_participants
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (private.org_admin_permission_gate(ARRAY['messages.view','messages.edit']))
  WITH CHECK (private.org_admin_permission_gate(ARRAY['messages.view','messages.edit']));

DROP POLICY IF EXISTS org_admin_permission_insert ON public.chat_messages;
CREATE POLICY org_admin_permission_insert ON public.chat_messages
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    private.org_admin_permission_gate(ARRAY['messages.edit'])
    AND private.chat_recipients_allow_messages(conversation_id)
  );

DROP POLICY IF EXISTS org_admin_permission_chat_files_select ON storage.objects;
CREATE POLICY org_admin_permission_chat_files_select ON storage.objects
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    bucket_id <> 'chat-files'
    OR private.org_admin_permission_gate(ARRAY['messages.view','messages.edit'])
  );

DROP POLICY IF EXISTS org_admin_permission_chat_files_insert ON storage.objects;
CREATE POLICY org_admin_permission_chat_files_insert ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id <> 'chat-files'
    OR private.org_admin_permission_gate(ARRAY['messages.edit'])
  );

DROP POLICY IF EXISTS org_admin_permission_chat_files_update ON storage.objects;
CREATE POLICY org_admin_permission_chat_files_update ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    bucket_id <> 'chat-files'
    OR private.org_admin_permission_gate(ARRAY['messages.edit'])
  )
  WITH CHECK (
    bucket_id <> 'chat-files'
    OR private.org_admin_permission_gate(ARRAY['messages.edit'])
  );

DROP POLICY IF EXISTS org_admin_permission_chat_files_delete ON storage.objects;
CREATE POLICY org_admin_permission_chat_files_delete ON storage.objects
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    bucket_id <> 'chat-files'
    OR private.org_admin_permission_gate(ARRAY['messages.edit'])
  );

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
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  WITH caller_allowed AS (
    SELECT
      NOT EXISTS (
        SELECT 1 FROM public.organization_admins membership
        WHERE membership.user_id = auth.uid()
      )
      OR private.org_admin_user_has_permission(auth.uid(), 'messages.view') AS allowed
  ),
  my_convs AS (
    SELECT
      participant.conversation_id,
      participant.last_read_at,
      participant.email_notify_enabled,
      participant.email_notify_delay_hours
    FROM public.chat_participants participant
    CROSS JOIN caller_allowed
    WHERE participant.user_id = auth.uid() AND caller_allowed.allowed
  ),
  other AS (
    SELECT
      mine.conversation_id,
      mine.last_read_at,
      mine.email_notify_enabled,
      mine.email_notify_delay_hours,
      participant.user_id AS other_uid
    FROM my_convs mine
    JOIN public.chat_participants participant
      ON participant.conversation_id = mine.conversation_id
     AND participant.user_id <> auth.uid()
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.organization_admins target_admin
      WHERE target_admin.user_id = participant.user_id
    )
    OR private.org_admin_user_has_permission(participant.user_id, 'messages.view')
  )
  SELECT
    other.conversation_id,
    conversation.last_message_at,
    other.other_uid,
    COALESCE(profile.full_name, student.full_name, parent.full_name, 'Unknown'),
    COALESCE(profile.email, student.email, parent.email, ''),
    last_message.content,
    last_message.message_type,
    last_message.sender_id,
    last_message.created_at,
    COALESCE(unread.count, 0),
    COALESCE(other.email_notify_enabled, true),
    COALESCE(other.email_notify_delay_hours, 12),
    CASE
      WHEN student.linked_user_id IS NOT NULL THEN 'student'
      WHEN parent.user_id IS NOT NULL THEN 'parent'
      WHEN admin.user_id IS NOT NULL THEN 'org_admin'
      ELSE 'tutor'
    END
  FROM other
  JOIN public.chat_conversations conversation ON conversation.id = other.conversation_id
  LEFT JOIN public.profiles profile ON profile.id = other.other_uid
  LEFT JOIN LATERAL (
    SELECT student_row.full_name, student_row.email, student_row.linked_user_id
    FROM public.students student_row
    WHERE student_row.linked_user_id = other.other_uid
    ORDER BY student_row.created_at DESC
    LIMIT 1
  ) student ON true
  LEFT JOIN LATERAL (
    SELECT parent_row.full_name, parent_row.email, parent_row.user_id
    FROM public.parent_profiles parent_row
    WHERE parent_row.user_id = other.other_uid
    LIMIT 1
  ) parent ON true
  LEFT JOIN LATERAL (
    SELECT admin_row.user_id
    FROM public.organization_admins admin_row
    WHERE admin_row.user_id = other.other_uid
    LIMIT 1
  ) admin ON true
  LEFT JOIN LATERAL (
    SELECT message_row.content, message_row.message_type, message_row.sender_id, message_row.created_at
    FROM public.chat_messages message_row
    WHERE message_row.conversation_id = other.conversation_id
    ORDER BY message_row.created_at DESC
    LIMIT 1
  ) last_message ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS count
    FROM public.chat_messages unread_row
    WHERE unread_row.conversation_id = other.conversation_id
      AND unread_row.sender_id <> auth.uid()
      AND unread_row.created_at > COALESCE(other.last_read_at, '1970-01-01'::timestamptz)
  ) unread ON true
  ORDER BY conversation.last_message_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_my_conversations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_conversations() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_parent_messageable_contacts()
RETURNS TABLE(user_id uuid, full_name text, email text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  WITH me_parent AS (
    SELECT public.get_my_parent_profile_id() AS parent_id
  ),
  linked AS (
    SELECT
      s.id AS student_id,
      s.tutor_id,
      s.linked_user_id,
      s.full_name AS student_name,
      s.email AS student_email,
      COALESCE(s.organization_id, p.organization_id) AS organization_id
    FROM public.parent_students ps
    JOIN public.students s ON s.id = ps.student_id
    LEFT JOIN public.profiles p ON p.id = s.tutor_id
    JOIN me_parent mp ON mp.parent_id = ps.parent_id
  ),
  tutors AS (
    SELECT DISTINCT l.tutor_id AS user_id, NULL::text AS full_name, NULL::text AS email, 'tutor'::text AS role
    FROM linked l
    WHERE l.tutor_id IS NOT NULL
  ),
  admins AS (
    SELECT DISTINCT oa.user_id, NULL::text AS full_name, NULL::text AS email, 'org_admin'::text AS role
    FROM linked l
    JOIN public.organization_admins oa ON oa.organization_id = l.organization_id
    WHERE l.organization_id IS NOT NULL
      AND private.org_admin_user_has_permission(oa.user_id, 'messages.view')
  ),
  children AS (
    SELECT DISTINCT ON (l.linked_user_id)
      l.linked_user_id AS user_id,
      l.student_name AS full_name,
      l.student_email AS email,
      'student'::text AS role
    FROM linked l
    WHERE l.linked_user_id IS NOT NULL
    ORDER BY l.linked_user_id
  )
  SELECT
    contact.user_id,
    COALESCE(NULLIF(profile.full_name, ''), contact.full_name, '') AS full_name,
    COALESCE(NULLIF(profile.email, ''), contact.email, '') AS email,
    contact.role
  FROM (
    SELECT * FROM tutors
    UNION
    SELECT * FROM admins
    UNION
    SELECT * FROM children
  ) contact
  LEFT JOIN public.profiles profile ON profile.id = contact.user_id
  WHERE contact.user_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_parent_messageable_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_parent_messageable_contacts() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_student_messageable_contacts()
RETURNS TABLE(user_id uuid, full_name text, email text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  WITH my_students AS (
    SELECT
      s.id AS student_id,
      s.tutor_id,
      s.organization_id AS student_org_id,
      p.organization_id AS tutor_org_id
    FROM public.students s
    LEFT JOIN public.profiles p ON p.id = s.tutor_id
    WHERE s.linked_user_id = auth.uid()
  )
  SELECT DISTINCT ON (profile.id)
    profile.id,
    profile.full_name,
    profile.email,
    'tutor'::text
  FROM my_students student
  JOIN public.profiles profile ON profile.id = student.tutor_id
  WHERE profile.id IS NOT NULL AND profile.id <> auth.uid()
  UNION ALL
  SELECT DISTINCT ON (admin.user_id)
    profile.id,
    profile.full_name,
    profile.email,
    'org_admin'::text
  FROM my_students student
  JOIN public.organization_admins admin
    ON admin.organization_id = COALESCE(student.student_org_id, student.tutor_org_id)
  JOIN public.profiles profile ON profile.id = admin.user_id
  WHERE admin.user_id <> auth.uid()
    AND private.org_admin_user_has_permission(admin.user_id, 'messages.view')
  UNION ALL
  SELECT DISTINCT ON (parent.user_id)
    parent.user_id,
    parent.full_name,
    parent.email,
    'parent'::text
  FROM my_students student
  JOIN public.parent_students link ON link.student_id = student.student_id
  JOIN public.parent_profiles parent ON parent.id = link.parent_id
  WHERE parent.user_id IS NOT NULL AND parent.user_id <> auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_student_messageable_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_messageable_contacts() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_tutor_messageable_admins()
RETURNS TABLE(user_id uuid, full_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  WITH my_org AS (
    SELECT profile.organization_id
    FROM public.profiles profile
    WHERE profile.id = auth.uid() AND profile.organization_id IS NOT NULL
  )
  SELECT DISTINCT ON (admin.user_id)
    profile.id,
    profile.full_name,
    profile.email
  FROM my_org
  JOIN public.organization_admins admin ON admin.organization_id = my_org.organization_id
  JOIN public.profiles profile ON profile.id = admin.user_id
  WHERE admin.user_id <> auth.uid()
    AND private.org_admin_user_has_permission(admin.user_id, 'messages.view');
$$;

REVOKE ALL ON FUNCTION public.get_tutor_messageable_admins() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tutor_messageable_admins() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_org_admin_messageable_parents()
RETURNS TABLE(user_id uuid, full_name text, email text, student_id uuid, student_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  WITH my_org AS (
    SELECT admin.organization_id
    FROM public.organization_admins admin
    WHERE admin.user_id = auth.uid()
      AND private.org_admin_user_has_permission(admin.user_id, 'messages.view')
  )
  SELECT DISTINCT ON (parent.user_id, student.id)
    parent.user_id,
    parent.full_name,
    parent.email,
    student.id,
    student.full_name
  FROM public.parent_students link
  JOIN public.parent_profiles parent ON parent.id = link.parent_id
  JOIN public.students student ON student.id = link.student_id
  JOIN my_org ON my_org.organization_id = student.organization_id
  WHERE parent.user_id IS NOT NULL AND parent.user_id <> auth.uid()
  ORDER BY parent.user_id, student.id, parent.full_name NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.get_org_admin_messageable_parents() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_org_admin_messageable_parents() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(p_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_my_id uuid := auth.uid();
  v_conv_id uuid;
  v_valid boolean := false;
BEGIN
  IF v_my_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF v_my_id = p_other_user_id THEN
    RAISE EXCEPTION 'Cannot create conversation with yourself';
  END IF;

  IF EXISTS (SELECT 1 FROM public.organization_admins WHERE user_id = v_my_id)
     AND NOT private.org_admin_user_has_permission(v_my_id, 'messages.edit') THEN
    RAISE EXCEPTION 'Insufficient organization permission';
  END IF;

  IF EXISTS (SELECT 1 FROM public.organization_admins WHERE user_id = p_other_user_id)
     AND NOT private.org_admin_user_has_permission(p_other_user_id, 'messages.view') THEN
    RAISE EXCEPTION 'The organization recipient cannot receive messages';
  END IF;

  SELECT mine.conversation_id INTO v_conv_id
  FROM public.chat_participants mine
  JOIN public.chat_participants other ON other.conversation_id = mine.conversation_id
  WHERE mine.user_id = v_my_id AND other.user_id = p_other_user_id
  LIMIT 1;
  IF v_conv_id IS NOT NULL THEN RETURN v_conv_id; END IF;

  IF EXISTS (
    SELECT 1 FROM public.students
    WHERE tutor_id = v_my_id AND linked_user_id = p_other_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.students
    WHERE linked_user_id = v_my_id AND tutor_id = p_other_user_id
  ) THEN
    v_valid := true;
  END IF;

  -- Admin and tutor relationships. If the target profile is also an admin seat,
  -- it must be an active message recipient.
  IF NOT v_valid AND EXISTS (
    SELECT 1
    FROM public.organization_admins admin
    JOIN public.profiles profile ON profile.organization_id = admin.organization_id
    WHERE admin.user_id = v_my_id
      AND profile.id = p_other_user_id
      AND private.org_admin_user_has_permission(admin.user_id, 'messages.edit')
      AND (
        NOT EXISTS (SELECT 1 FROM public.organization_admins target WHERE target.user_id = p_other_user_id)
        OR private.org_admin_user_has_permission(p_other_user_id, 'messages.view')
      )
  ) THEN v_valid := true; END IF;

  IF NOT v_valid AND EXISTS (
    SELECT 1
    FROM public.profiles profile
    JOIN public.organization_admins admin ON admin.organization_id = profile.organization_id
    WHERE profile.id = v_my_id
      AND admin.user_id = p_other_user_id
      AND private.org_admin_user_has_permission(admin.user_id, 'messages.view')
  ) THEN v_valid := true; END IF;

  IF NOT v_valid AND EXISTS (
    SELECT 1
    FROM public.organization_admins admin
    JOIN public.students student ON student.organization_id = admin.organization_id
    WHERE admin.user_id = v_my_id
      AND student.linked_user_id = p_other_user_id
      AND private.org_admin_user_has_permission(admin.user_id, 'messages.edit')
  ) THEN v_valid := true; END IF;

  IF NOT v_valid AND EXISTS (
    SELECT 1
    FROM public.students student
    JOIN public.organization_admins admin ON admin.organization_id = student.organization_id
    WHERE student.linked_user_id = v_my_id
      AND admin.user_id = p_other_user_id
      AND private.org_admin_user_has_permission(admin.user_id, 'messages.view')
  ) THEN v_valid := true; END IF;

  IF NOT v_valid AND EXISTS (
    SELECT 1 FROM public.parent_profiles parent
    JOIN public.parent_students link ON link.parent_id = parent.id
    JOIN public.students student ON student.id = link.student_id
    WHERE parent.user_id = v_my_id AND student.tutor_id = p_other_user_id
  ) THEN v_valid := true; END IF;

  IF NOT v_valid AND EXISTS (
    SELECT 1 FROM public.parent_profiles parent
    JOIN public.parent_students link ON link.parent_id = parent.id
    JOIN public.students student ON student.id = link.student_id
    WHERE parent.user_id = p_other_user_id AND student.tutor_id = v_my_id
  ) THEN v_valid := true; END IF;

  IF NOT v_valid AND EXISTS (
    SELECT 1 FROM public.parent_profiles parent
    JOIN public.parent_students link ON link.parent_id = parent.id
    JOIN public.students student ON student.id = link.student_id
    JOIN public.organization_admins admin ON admin.organization_id = student.organization_id
    WHERE parent.user_id = v_my_id
      AND admin.user_id = p_other_user_id
      AND private.org_admin_user_has_permission(admin.user_id, 'messages.view')
  ) THEN v_valid := true; END IF;

  IF NOT v_valid AND EXISTS (
    SELECT 1 FROM public.parent_profiles parent
    JOIN public.parent_students link ON link.parent_id = parent.id
    JOIN public.students student ON student.id = link.student_id
    JOIN public.organization_admins admin ON admin.organization_id = student.organization_id
    WHERE parent.user_id = p_other_user_id
      AND admin.user_id = v_my_id
      AND private.org_admin_user_has_permission(admin.user_id, 'messages.edit')
  ) THEN v_valid := true; END IF;

  IF NOT v_valid AND EXISTS (
    SELECT 1 FROM public.parent_profiles parent
    JOIN public.parent_students link ON link.parent_id = parent.id
    JOIN public.students student ON student.id = link.student_id
    WHERE parent.user_id = v_my_id AND student.linked_user_id = p_other_user_id
  ) THEN v_valid := true; END IF;

  IF NOT v_valid AND EXISTS (
    SELECT 1 FROM public.parent_profiles parent
    JOIN public.parent_students link ON link.parent_id = parent.id
    JOIN public.students student ON student.id = link.student_id
    WHERE parent.user_id = p_other_user_id AND student.linked_user_id = v_my_id
  ) THEN v_valid := true; END IF;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'No valid relationship exists between these users';
  END IF;

  INSERT INTO public.chat_conversations DEFAULT VALUES RETURNING id INTO v_conv_id;
  INSERT INTO public.chat_participants (conversation_id, user_id)
  VALUES (v_conv_id, v_my_id), (v_conv_id, p_other_user_id);
  RETURN v_conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated, service_role;

-- This RPC is SECURITY DEFINER and therefore needs an explicit seat check;
-- ordinary RLS cannot constrain its student/session repricing updates.
CREATE OR REPLACE FUNCTION public.set_student_pricing_frequency(
  p_student_id uuid,
  p_lessons_per_week smallint
)
RETURNS smallint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_tutor uuid;
  v_org uuid;
  v_allowed boolean := false;
  v_freq smallint;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_lessons_per_week IS NOT NULL AND p_lessons_per_week < 1 THEN
    RAISE EXCEPTION 'Lessons per week must be at least 1';
  END IF;

  SELECT student.tutor_id, COALESCE(student.organization_id, tutor.organization_id)
  INTO v_tutor, v_org
  FROM public.students student
  LEFT JOIN public.profiles tutor ON tutor.id = student.tutor_id
  WHERE student.id = p_student_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Student not found'; END IF;

  v_allowed := v_tutor IS NOT NULL AND v_tutor = v_caller;
  IF NOT v_allowed AND v_org IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.organization_admins admin
      WHERE admin.user_id = v_caller
        AND admin.organization_id = v_org
        AND (
          private.org_admin_user_has_permission(admin.user_id, 'finance.edit')
          OR private.org_admin_user_has_permission(admin.user_id, 'sessions.edit')
        )
    ) INTO v_allowed;
  END IF;
  IF NOT v_allowed THEN RAISE EXCEPTION 'Not allowed'; END IF;

  IF p_lessons_per_week IS NULL THEN
    SELECT NULLIF(COUNT(*), 0)::smallint INTO v_freq
    FROM public.recurring_individual_sessions recurring
    WHERE recurring.student_id = p_student_id AND recurring.active = true;

    UPDATE public.students
    SET pricing_lessons_per_week = v_freq,
        pricing_lessons_per_week_is_manual = false
    WHERE id = p_student_id;
  ELSE
    v_freq := p_lessons_per_week;
    UPDATE public.students
    SET pricing_lessons_per_week = v_freq,
        pricing_lessons_per_week_is_manual = true
    WHERE id = p_student_id;
  END IF;

  UPDATE public.sessions lesson_session
  SET price = tier.price
  FROM public.students student
  CROSS JOIN LATERAL (
    SELECT pricing.price
    FROM public.organization_dynamic_pricing pricing
    WHERE pricing.organization_id = COALESCE(student.organization_id, v_org)
      AND pricing.lessons_per_week = student.pricing_lessons_per_week
      AND (
        CASE
          WHEN substring(COALESCE(student.grade, '') FROM '([0-9]{1,2})') IS NULL THEN NULL
          ELSE substring(student.grade FROM '([0-9]{1,2})')::smallint
        END
      ) BETWEEN pricing.grade_min AND pricing.grade_max
    ORDER BY (pricing.grade_max - pricing.grade_min), pricing.grade_min
    LIMIT 1
  ) tier
  WHERE student.id = p_student_id
    AND lesson_session.student_id = student.id
    AND lesson_session.start_time > now()
    AND COALESCE(lesson_session.paid, false) = false
    AND (
      lesson_session.subject_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.subjects subject
        WHERE subject.id = lesson_session.subject_id
          AND (COALESCE(subject.is_trial, false) OR COALESCE(subject.is_group, false))
      )
    )
    AND (
      lesson_session.subject_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.student_individual_pricing individual
        WHERE individual.student_id = lesson_session.student_id
          AND individual.subject_id = lesson_session.subject_id
      )
    );

  RETURN v_freq;
END;
$$;

REVOKE ALL ON FUNCTION public.set_student_pricing_frequency(uuid, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_student_pricing_frequency(uuid, smallint) TO authenticated, service_role;
