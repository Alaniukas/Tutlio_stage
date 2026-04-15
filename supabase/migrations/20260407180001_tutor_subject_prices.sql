-- Per-tutor default pricing for org subjects.
-- Allows different tutors in the same org to have different prices for the same subject.
-- Links to org_subject_templates[].id stored in organizations.org_subject_templates JSONB.

CREATE TABLE IF NOT EXISTS public.tutor_subject_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  org_subject_template_id TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  duration_minutes INT NOT NULL DEFAULT 60 CHECK (duration_minutes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tutor_id, org_subject_template_id)
);

ALTER TABLE public.tutor_subject_prices ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tutor_subject_prices_tutor
  ON public.tutor_subject_prices(tutor_id);
CREATE INDEX IF NOT EXISTS idx_tutor_subject_prices_org
  ON public.tutor_subject_prices(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tutor_subject_prices TO authenticated;
GRANT ALL ON TABLE public.tutor_subject_prices TO service_role;

-- Make migration idempotent if policies already exist
DROP POLICY IF EXISTS "Tutors can view own subject prices" ON public.tutor_subject_prices;
DROP POLICY IF EXISTS "Org admins can view org tutor subject prices" ON public.tutor_subject_prices;
DROP POLICY IF EXISTS "Tutors can insert own subject prices" ON public.tutor_subject_prices;
DROP POLICY IF EXISTS "Org admins can insert tutor subject prices" ON public.tutor_subject_prices;
DROP POLICY IF EXISTS "Tutors can update own subject prices" ON public.tutor_subject_prices;
DROP POLICY IF EXISTS "Org admins can update tutor subject prices" ON public.tutor_subject_prices;
DROP POLICY IF EXISTS "Tutors can delete own subject prices" ON public.tutor_subject_prices;
DROP POLICY IF EXISTS "Org admins can delete tutor subject prices" ON public.tutor_subject_prices;

-- ── SELECT ───────────────────────────────────────────────────────────────────
CREATE POLICY "Tutors can view own subject prices"
  ON public.tutor_subject_prices FOR SELECT
  USING (tutor_id = auth.uid());

CREATE POLICY "Org admins can view org tutor subject prices"
  ON public.tutor_subject_prices FOR SELECT
  USING (
    organization_id IN (
      SELECT oa.organization_id FROM public.organization_admins oa WHERE oa.user_id = auth.uid()
    )
  );

-- ── INSERT ───────────────────────────────────────────────────────────────────
CREATE POLICY "Tutors can insert own subject prices"
  ON public.tutor_subject_prices FOR INSERT
  WITH CHECK (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "Org admins can insert tutor subject prices"
  ON public.tutor_subject_prices FOR INSERT
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

-- ── UPDATE ───────────────────────────────────────────────────────────────────
CREATE POLICY "Tutors can update own subject prices"
  ON public.tutor_subject_prices FOR UPDATE
  USING (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension())
  WITH CHECK (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "Org admins can update tutor subject prices"
  ON public.tutor_subject_prices FOR UPDATE
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

-- ── DELETE ───────────────────────────────────────────────────────────────────
CREATE POLICY "Tutors can delete own subject prices"
  ON public.tutor_subject_prices FOR DELETE
  USING (tutor_id = auth.uid() AND NOT public.write_blocked_by_org_suspension());

CREATE POLICY "Org admins can delete tutor subject prices"
  ON public.tutor_subject_prices FOR DELETE
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

COMMENT ON TABLE public.tutor_subject_prices IS 'Per-tutor default pricing for org subject templates. Allows different tutors to charge different prices for the same org subject.';
