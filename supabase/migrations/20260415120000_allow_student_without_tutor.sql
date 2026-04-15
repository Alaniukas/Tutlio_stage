-- Allow creating students without a tutor (org_admin creates code, assigns tutor later).
-- tutor_id becomes nullable; organization_id is used for RLS when tutor_id is NULL.
--
-- Safety notes:
--   • ALTER … DROP NOT NULL is non-destructive – existing rows with tutor_id are unaffected.
--   • RLS policies are replaced inside a single transaction (no exposure window).
--   • The original tutor_id-based condition is preserved verbatim; only an OR branch is added.
--   • write_blocked_by_org_suspension() is kept in every write policy.

ALTER TABLE public.students ALTER COLUMN tutor_id DROP NOT NULL;

-- ── SELECT ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admin can view org students" ON public.students;
CREATE POLICY "Org admin can view org students" ON public.students FOR SELECT
  USING (
    tutor_id IN (
      SELECT id FROM public.profiles
      WHERE organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
    )
    OR (
      tutor_id IS NULL
      AND organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
    )
  );

-- ── INSERT ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admin can insert org students" ON public.students;
CREATE POLICY "Org admin can insert org students" ON public.students FOR INSERT
  WITH CHECK (
    (
      tutor_id IN (
        SELECT id FROM public.profiles
        WHERE organization_id IN (
          SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
        )
      )
      AND NOT public.write_blocked_by_org_suspension()
    )
    OR (
      tutor_id IS NULL
      AND organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
      AND NOT public.write_blocked_by_org_suspension()
    )
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admin can update org students" ON public.students;
CREATE POLICY "Org admin can update org students" ON public.students FOR UPDATE
  USING (
    (
      tutor_id IN (
        SELECT id FROM public.profiles
        WHERE organization_id IN (
          SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
        )
      )
      AND NOT public.write_blocked_by_org_suspension()
    )
    OR (
      tutor_id IS NULL
      AND organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
      AND NOT public.write_blocked_by_org_suspension()
    )
  )
  WITH CHECK (
    (
      tutor_id IN (
        SELECT id FROM public.profiles
        WHERE organization_id IN (
          SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
        )
      )
      AND NOT public.write_blocked_by_org_suspension()
    )
    OR (
      tutor_id IS NULL
      AND organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
      AND NOT public.write_blocked_by_org_suspension()
    )
  );

-- ── DELETE ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org admin can delete org students" ON public.students;
CREATE POLICY "Org admin can delete org students" ON public.students FOR DELETE
  USING (
    (
      tutor_id IN (
        SELECT id FROM public.profiles
        WHERE organization_id IN (
          SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
        )
      )
      AND NOT public.write_blocked_by_org_suspension()
    )
    OR (
      tutor_id IS NULL
      AND organization_id IN (
        SELECT organization_id FROM public.organization_admins WHERE user_id = auth.uid()
      )
      AND NOT public.write_blocked_by_org_suspension()
    )
  );
