-- ─── Multi-subject lesson packages: lesson_package_items ──────────────────────
-- A lesson package can now contain multiple subjects, each with its own quantity
-- and per-lesson price. Counters (available / reserved / completed) live on the
-- item rows. The parent `lesson_packages` keeps the aggregate sums plus the
-- existing payment / Stripe / invoice metadata. `lesson_packages.subject_id`
-- and `lesson_packages.price_per_lesson` become nullable so the schema can
-- represent multi-subject packages cleanly; legacy single-subject reads still
-- work because we always seed `subject_id` with `items[0].subject_id` for
-- backward compatibility.

CREATE TABLE IF NOT EXISTS public.lesson_package_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.lesson_packages(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,

  total_lessons INT NOT NULL CHECK (total_lessons > 0),
  available_lessons INT NOT NULL CHECK (available_lessons >= 0),
  reserved_lessons INT NOT NULL DEFAULT 0 CHECK (reserved_lessons >= 0),
  completed_lessons INT NOT NULL DEFAULT 0 CHECK (completed_lessons >= 0),

  price_per_lesson NUMERIC(10,2) NOT NULL CHECK (price_per_lesson >= 0),
  total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),

  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT lesson_package_items_subject_unique UNIQUE (package_id, subject_id),
  CONSTRAINT lesson_package_items_counts_valid CHECK (
    available_lessons + reserved_lessons + completed_lessons <= total_lessons
  )
);

CREATE INDEX IF NOT EXISTS idx_lesson_package_items_package
  ON public.lesson_package_items(package_id);
CREATE INDEX IF NOT EXISTS idx_lesson_package_items_subject
  ON public.lesson_package_items(subject_id);
CREATE INDEX IF NOT EXISTS idx_lesson_package_items_package_subject_available
  ON public.lesson_package_items(package_id, subject_id)
  WHERE available_lessons > 0;

COMMENT ON TABLE public.lesson_package_items IS
  'Per-subject breakdown of a multi-subject lesson package. One row per subject in the package.';
COMMENT ON COLUMN public.lesson_package_items.available_lessons IS
  'Lessons of this subject still available for booking';
COMMENT ON COLUMN public.lesson_package_items.reserved_lessons IS
  'Lessons of this subject reserved for active/upcoming sessions';
COMMENT ON COLUMN public.lesson_package_items.completed_lessons IS
  'Lessons of this subject that have been completed';

-- ── Row Level Security: mirror lesson_packages exactly ────────────────────────
ALTER TABLE public.lesson_package_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lesson_package_items_tutor_select" ON public.lesson_package_items;
CREATE POLICY "lesson_package_items_tutor_select" ON public.lesson_package_items FOR SELECT
  USING (
    package_id IN (
      SELECT id FROM public.lesson_packages WHERE tutor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lesson_package_items_tutor_insert" ON public.lesson_package_items;
CREATE POLICY "lesson_package_items_tutor_insert" ON public.lesson_package_items FOR INSERT
  WITH CHECK (
    package_id IN (
      SELECT id FROM public.lesson_packages WHERE tutor_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "lesson_package_items_tutor_update" ON public.lesson_package_items;
CREATE POLICY "lesson_package_items_tutor_update" ON public.lesson_package_items FOR UPDATE
  USING (
    package_id IN (
      SELECT id FROM public.lesson_packages WHERE tutor_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    package_id IN (
      SELECT id FROM public.lesson_packages WHERE tutor_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "lesson_package_items_tutor_delete" ON public.lesson_package_items;
CREATE POLICY "lesson_package_items_tutor_delete" ON public.lesson_package_items FOR DELETE
  USING (
    package_id IN (
      SELECT id FROM public.lesson_packages WHERE tutor_id = auth.uid()
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "lesson_package_items_student_select" ON public.lesson_package_items;
CREATE POLICY "lesson_package_items_student_select" ON public.lesson_package_items FOR SELECT
  USING (
    package_id IN (
      SELECT lp.id FROM public.lesson_packages lp
      WHERE lp.student_id IN (
        SELECT id FROM public.students WHERE linked_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "lesson_package_items_parent_select" ON public.lesson_package_items;
CREATE POLICY "lesson_package_items_parent_select" ON public.lesson_package_items FOR SELECT
  USING (
    package_id IN (
      SELECT lp.id FROM public.lesson_packages lp
      WHERE lp.student_id IN (
        SELECT ps.student_id
        FROM public.parent_students ps
        JOIN public.parent_profiles pp ON pp.id = ps.parent_id AND pp.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "lesson_package_items_org_admin_select" ON public.lesson_package_items;
CREATE POLICY "lesson_package_items_org_admin_select" ON public.lesson_package_items FOR SELECT
  USING (
    package_id IN (
      SELECT lp.id FROM public.lesson_packages lp
      WHERE lp.tutor_id IN (
        SELECT p.id FROM public.profiles p
        INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
        WHERE oa.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "lesson_package_items_org_admin_insert" ON public.lesson_package_items;
CREATE POLICY "lesson_package_items_org_admin_insert" ON public.lesson_package_items FOR INSERT
  WITH CHECK (
    package_id IN (
      SELECT lp.id FROM public.lesson_packages lp
      WHERE lp.tutor_id IN (
        SELECT p.id FROM public.profiles p
        INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
        WHERE oa.user_id = auth.uid()
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "lesson_package_items_org_admin_update" ON public.lesson_package_items;
CREATE POLICY "lesson_package_items_org_admin_update" ON public.lesson_package_items FOR UPDATE
  USING (
    package_id IN (
      SELECT lp.id FROM public.lesson_packages lp
      WHERE lp.tutor_id IN (
        SELECT p.id FROM public.profiles p
        INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
        WHERE oa.user_id = auth.uid()
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  )
  WITH CHECK (
    package_id IN (
      SELECT lp.id FROM public.lesson_packages lp
      WHERE lp.tutor_id IN (
        SELECT p.id FROM public.profiles p
        INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
        WHERE oa.user_id = auth.uid()
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

DROP POLICY IF EXISTS "lesson_package_items_org_admin_delete" ON public.lesson_package_items;
CREATE POLICY "lesson_package_items_org_admin_delete" ON public.lesson_package_items FOR DELETE
  USING (
    package_id IN (
      SELECT lp.id FROM public.lesson_packages lp
      WHERE lp.tutor_id IN (
        SELECT p.id FROM public.profiles p
        INNER JOIN public.organization_admins oa ON oa.organization_id = p.organization_id
        WHERE oa.user_id = auth.uid()
      )
    )
    AND NOT public.write_blocked_by_org_suspension()
  );

-- Anon should never see lesson package items
REVOKE ALL ON public.lesson_package_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_package_items TO authenticated;
GRANT ALL ON public.lesson_package_items TO service_role;

-- ── Relax lesson_packages parent columns ──────────────────────────────────────
-- Multi-subject packages no longer require a single subject_id / price_per_lesson
-- at the parent level. The aggregates (total_lessons, available_lessons, etc.)
-- on the parent row still represent the sum across items.
ALTER TABLE public.lesson_packages
  ALTER COLUMN subject_id DROP NOT NULL;
ALTER TABLE public.lesson_packages
  ALTER COLUMN price_per_lesson DROP NOT NULL;
