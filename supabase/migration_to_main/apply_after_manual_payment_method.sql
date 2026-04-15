-- =============================================================================
-- VIENAS FAILAS: migracijos PO „20260330100001_manual_payment_method“
-- Paleiskite TIK jei Dashboard rodo Last Migration: manual_payment_method
-- ir diagnostikos SQL patvirtina, kad šių versijų dar NĖRA schema_migrations.
--
-- KAS DARO: RLS politikos + vienas stulpelis (jsonb default []).
-- KAS NEDARO: netrina vartotojų, auth.users, profiles, students eilučių.
-- =============================================================================

-- ─── 20260330100002_students_delete_org_tutor_requires_org_admin ───────────
-- Org korepetitoriai (profiles.organization_id IS NOT NULL), kurie nėra organization_admins,
-- nebegali trinti students eilučių. Solo korepetitoriai ir org adminai – gali kaip anksčiau.

-- =============================================================================
-- SAFETY: jei DB dar neturi ankstesnės migracijos su org flag’u pagalbinių
-- funkcijų apibrėžimais, šitas failas pats susikuria minimalų
-- `public.org_has_feature(uuid, text)` variantą, kad policy kūrimas nepasileistų.
--
-- Funkcija grąžina `false`, jei `public.organizations.features` stulpelio nėra
-- arba jei jis nėra jsonb.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.org_has_feature(org_id uuid, feature_id text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  has_features_col boolean;
  result boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'features'
      AND data_type = 'jsonb'
  ) INTO has_features_col;

  IF NOT has_features_col THEN
    RETURN false;
  END IF;

  EXECUTE
    'SELECT COALESCE((features->>$1)::boolean, false)
     FROM public.organizations
     WHERE id = $2'
  INTO result
  USING feature_id, org_id;

  RETURN COALESCE(result, false);
END;
$$;

DROP POLICY IF EXISTS students_delete ON public.students;

CREATE POLICY students_delete ON public.students
FOR DELETE
USING (
  (auth.uid() = tutor_id)
  AND (NOT public.write_blocked_by_org_suspension())
  AND (
    (SELECT p.organization_id FROM public.profiles p WHERE p.id = auth.uid()) IS NULL
    OR EXISTS (
      SELECT 1 FROM public.organization_admins oa WHERE oa.user_id = auth.uid()
    )
  )
);

-- ─── 20260330120000_org_subject_templates ──────────────────────────────────
-- Org-level subject definitions when no tutor is assigned yet (CompanySettings).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS org_subject_templates jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.organizations.org_subject_templates IS
  'JSON array of {id, name, duration_minutes, price, color, ...} — dalykai be priskirto korepetitoriaus; vėliau galima priskirti ar kopijuoti į subjects.';

-- ─── 20260330130000_org_admin_subjects_mutate ───────────────────────────────
-- Org admins may insert/update/delete subjects for tutors in their organization

DROP POLICY IF EXISTS "subjects_org_admin_insert" ON public.subjects;
CREATE POLICY "subjects_org_admin_insert" ON public.subjects
  FOR INSERT
  WITH CHECK (
    NOT public.write_blocked_by_org_suspension()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      INNER JOIN public.organization_admins oa
        ON oa.organization_id = p.organization_id
       AND oa.user_id = auth.uid()
      WHERE p.id = tutor_id
    )
  );

DROP POLICY IF EXISTS "subjects_org_admin_update" ON public.subjects;
CREATE POLICY "subjects_org_admin_update" ON public.subjects
  FOR UPDATE
  USING (
    NOT public.write_blocked_by_org_suspension()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      INNER JOIN public.organization_admins oa
        ON oa.organization_id = p.organization_id
       AND oa.user_id = auth.uid()
      WHERE p.id = tutor_id
    )
  )
  WITH CHECK (
    NOT public.write_blocked_by_org_suspension()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      INNER JOIN public.organization_admins oa
        ON oa.organization_id = p.organization_id
       AND oa.user_id = auth.uid()
      WHERE p.id = tutor_id
    )
  );

DROP POLICY IF EXISTS "subjects_org_admin_delete" ON public.subjects;
CREATE POLICY "subjects_org_admin_delete" ON public.subjects
  FOR DELETE
  USING (
    NOT public.write_blocked_by_org_suspension()
    AND EXISTS (
      SELECT 1
      FROM public.profiles p
      INNER JOIN public.organization_admins oa
        ON oa.organization_id = p.organization_id
       AND oa.user_id = auth.uid()
      WHERE p.id = tutor_id
    )
  );

-- ─── 20260331120000_org_admin_calendar_rls_fix ───────────────────────────────
-- Reinforce org admin RLS for sessions & availability (WITH CHECK + suspension)
-- and allow org admins with full_control to manage recurring templates for org tutors.

DROP POLICY IF EXISTS "Org admin can update org tutor sessions" ON public.sessions;
CREATE POLICY "Org admin can update org tutor sessions" ON public.sessions
  FOR UPDATE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "Org admin can delete org tutor sessions" ON public.sessions;
CREATE POLICY "Org admin can delete org tutor sessions" ON public.sessions
  FOR DELETE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "Org admin can create org tutor sessions" ON public.sessions;
CREATE POLICY "Org admin can create org tutor sessions" ON public.sessions
  FOR INSERT
  WITH CHECK (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND (
          public.org_has_feature(p.organization_id, 'org_admin_calendar_view')
          OR public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
        )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "Org admin can update org tutor availability" ON public.availability;
CREATE POLICY "Org admin can update org tutor availability" ON public.availability
  FOR UPDATE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "Org admin can create org tutor availability" ON public.availability;
CREATE POLICY "Org admin can create org tutor availability" ON public.availability
  FOR INSERT
  WITH CHECK (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "Org admin can delete org tutor availability" ON public.availability;
CREATE POLICY "Org admin can delete org tutor availability" ON public.availability
  FOR DELETE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "Org admin recurring insert" ON public.recurring_individual_sessions;
CREATE POLICY "Org admin recurring insert" ON public.recurring_individual_sessions
  FOR INSERT
  WITH CHECK (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "Org admin recurring update" ON public.recurring_individual_sessions;
CREATE POLICY "Org admin recurring update" ON public.recurring_individual_sessions
  FOR UPDATE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "Org admin recurring delete" ON public.recurring_individual_sessions;
CREATE POLICY "Org admin recurring delete" ON public.recurring_individual_sessions
  FOR DELETE
  USING (
    tutor_id IN (
      SELECT p.id
      FROM public.profiles p
      INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
      WHERE oa.user_id = auth.uid()
        AND public.org_has_feature(p.organization_id, 'org_admin_calendar_full_control')
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

-- =============================================================================
-- Po sėkmės: jei naudojate Supabase CLI migracijas, istoriją atnaujinkite pagal
-- savo projekto lentelės struktūrą (pirmiau SQL Editor: \d supabase_migrations.schema_migrations
-- arba information_schema). Rankinis SQL insert – tik jei žinote tikslias stulpelių roles.
