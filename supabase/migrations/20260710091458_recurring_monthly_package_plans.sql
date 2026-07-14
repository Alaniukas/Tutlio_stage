CREATE TABLE IF NOT EXISTS public.recurring_monthly_package_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  grade smallint NOT NULL CHECK (grade BETWEEN 1 AND 12),
  lessons_per_week smallint NOT NULL CHECK (lessons_per_week BETWEEN 1 AND 7),
  payment_method text NOT NULL CHECK (payment_method IN ('manual', 'stripe')),
  attach_sales_invoice boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  next_generation_date date NOT NULL,
  last_generated_period_start date,
  last_generated_period_end date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_monthly_package_plans_due
  ON public.recurring_monthly_package_plans (next_generation_date)
  WHERE active = true;

ALTER TABLE public.recurring_monthly_package_plans ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recurring_monthly_package_plans TO authenticated;
GRANT ALL ON TABLE public.recurring_monthly_package_plans TO service_role;

DROP POLICY IF EXISTS "Org admins manage recurring monthly package plans"
  ON public.recurring_monthly_package_plans;
CREATE POLICY "Org admins manage recurring monthly package plans"
  ON public.recurring_monthly_package_plans
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_admins oa
      WHERE oa.organization_id = recurring_monthly_package_plans.organization_id
        AND oa.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_admins oa
      WHERE oa.organization_id = recurring_monthly_package_plans.organization_id
        AND oa.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Plan participants view recurring monthly package plans"
  ON public.recurring_monthly_package_plans;
CREATE POLICY "Plan participants view recurring monthly package plans"
  ON public.recurring_monthly_package_plans
  FOR SELECT
  TO authenticated
  USING (
    tutor_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = recurring_monthly_package_plans.student_id
        AND s.linked_user_id = (SELECT auth.uid())
    )
  );

ALTER TABLE public.lesson_packages
  ADD COLUMN IF NOT EXISTS recurring_plan_id uuid
    REFERENCES public.recurring_monthly_package_plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_period_start date,
  ADD COLUMN IF NOT EXISTS billing_period_end date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_packages_recurring_plan_period
  ON public.lesson_packages (recurring_plan_id, billing_period_start)
  WHERE recurring_plan_id IS NOT NULL AND billing_period_start IS NOT NULL;

COMMENT ON TABLE public.recurring_monthly_package_plans IS
  'Monthly package instructions. The current partial month is generated immediately; subsequent calendar months are generated automatically on the first day.';
