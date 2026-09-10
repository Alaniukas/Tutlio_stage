-- School consultations: UŠ teacher consultations + help team + monthly invoice lines.

-- ─── students PPT flags ─────────────────────────────────────────────────────

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS ppt_adapted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ppt_individualized boolean NOT NULL DEFAULT false;

-- ─── specialist category on tutor profiles ──────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS help_team_category text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_help_team_category_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_help_team_category_check
      CHECK (
        help_team_category IS NULL
        OR help_team_category IN ('speech', 'psychologist', 'special_pedagogue', 'additional_help')
      );
  END IF;
END $$;

-- ─── sessions: joinable for UŠ consultation ─────────────────────────────────

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS consultation_joinable boolean NOT NULL DEFAULT false;

-- ─── UŠ consultation requests (need form) ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.school_consultation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  grade_snapshot text,
  topic text NOT NULL DEFAULT '',
  preferred_times jsonb NOT NULL DEFAULT '[]'::jsonb,
  contact_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN (
      'submitted', 'awaiting_proposal', 'proposed', 'awaiting_parent_confirm',
      'confirmed', 'cancelled_parent', 'cancelled_staff', 'completed'
    )),
  school_year text NOT NULL,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_consultation_requests_org
  ON public.school_consultation_requests(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_school_consultation_requests_student
  ON public.school_consultation_requests(student_id);

-- ─── consultations (UŠ + help team participation) ───────────────────────────

CREATE TABLE IF NOT EXISTS public.school_consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('teacher_subject', 'help_team')),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN (
      'submitted', 'awaiting_proposal', 'proposed', 'awaiting_parent_confirm',
      'confirmed', 'awaiting_payment', 'occurred', 'cancelled_parent',
      'cancelled_staff', 'no_show'
    )),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  family_key text,
  request_id uuid REFERENCES public.school_consultation_requests(id) ON DELETE SET NULL,
  tutor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  help_team_category text
    CHECK (
      help_team_category IS NULL
      OR help_team_category IN ('speech', 'psychologist', 'special_pedagogue', 'additional_help')
    ),
  audience_note text,
  mode text CHECK (mode IS NULL OR mode IN ('individual', 'group', 'join_lesson')),
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  start_time timestamptz,
  end_time timestamptz,
  planned_minutes integer,
  actual_minutes integer,
  reserved_minutes integer,
  charged_minutes integer,
  is_paid boolean NOT NULL DEFAULT false,
  paid_ack_at timestamptz,
  paid_ack_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  price_eur numeric(10,2),
  proposed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  proposed_at timestamptz,
  confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  late_cancel boolean NOT NULL DEFAULT false,
  school_year text NOT NULL,
  outcome text CHECK (outcome IS NULL OR outcome IN ('occurred', 'no_show', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_consultations_org_year
  ON public.school_consultations(organization_id, school_year, kind);
CREATE INDEX IF NOT EXISTS idx_school_consultations_student
  ON public.school_consultations(student_id);
CREATE INDEX IF NOT EXISTS idx_school_consultations_family
  ON public.school_consultations(organization_id, family_key, school_year)
  WHERE family_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_school_consultations_tutor
  ON public.school_consultations(tutor_id, start_time);
CREATE INDEX IF NOT EXISTS idx_school_consultations_session
  ON public.school_consultations(session_id)
  WHERE session_id IS NOT NULL;

-- ─── lesson discounts (pamokos, ne PK) ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.student_lesson_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  tutor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  percent numeric(5,2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  valid_from date NOT NULL,
  valid_until date,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_lesson_discounts_student
  ON public.student_lesson_discounts(student_id, subject_id);

-- ─── monthly invoice lines + PAM metadata ─────────────────────────────────────

ALTER TABLE public.school_monthly_invoices
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS pdf_path text;

ALTER TABLE public.school_monthly_invoices
  ALTER COLUMN contract_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_school_monthly_invoices_student_period
  ON public.school_monthly_invoices(student_id, period_start)
  WHERE contract_id IS NULL;

CREATE TABLE IF NOT EXISTS public.school_monthly_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.school_monthly_invoices(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  description text NOT NULL,
  unit_price_eur numeric(10,2) NOT NULL DEFAULT 0,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  amount_eur numeric(10,2) NOT NULL DEFAULT 0,
  source text NOT NULL
    CHECK (source IN (
      'extra_base', 'extra_overage', 'lesson', 'consultation_free',
      'consultation_paid', 'discount'
    )),
  consultation_id uuid REFERENCES public.school_consultations(id) ON DELETE SET NULL,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_monthly_invoice_lines_invoice
  ON public.school_monthly_invoice_lines(invoice_id, sort_order);

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.school_consultation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_consultations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_lesson_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_monthly_invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY school_consultation_requests_admin ON public.school_consultation_requests
  FOR ALL USING (public.is_school_admin(organization_id))
  WITH CHECK (public.is_school_admin(organization_id));

CREATE POLICY school_consultation_requests_parent ON public.school_consultation_requests
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    OR student_id IN (
      SELECT ps.student_id FROM public.parent_students ps
      JOIN public.parent_profiles pp ON pp.id = ps.parent_id
      WHERE pp.user_id = auth.uid()
    )
  );

CREATE POLICY school_consultation_requests_parent_insert ON public.school_consultation_requests
  FOR INSERT WITH CHECK (
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    OR student_id IN (
      SELECT ps.student_id FROM public.parent_students ps
      JOIN public.parent_profiles pp ON pp.id = ps.parent_id
      WHERE pp.user_id = auth.uid()
    )
  );

CREATE POLICY school_consultations_admin ON public.school_consultations
  FOR ALL USING (public.is_school_admin(organization_id))
  WITH CHECK (public.is_school_admin(organization_id));

CREATE POLICY school_consultations_tutor ON public.school_consultations
  FOR ALL USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY school_consultations_parent_select ON public.school_consultations
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    OR student_id IN (
      SELECT ps.student_id FROM public.parent_students ps
      JOIN public.parent_profiles pp ON pp.id = ps.parent_id
      WHERE pp.user_id = auth.uid()
    )
  );

CREATE POLICY school_consultations_parent_update ON public.school_consultations
  FOR UPDATE USING (
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    OR student_id IN (
      SELECT ps.student_id FROM public.parent_students ps
      JOIN public.parent_profiles pp ON pp.id = ps.parent_id
      WHERE pp.user_id = auth.uid()
    )
  );

CREATE POLICY student_lesson_discounts_admin ON public.student_lesson_discounts
  FOR ALL USING (public.is_school_admin(organization_id))
  WITH CHECK (public.is_school_admin(organization_id));

CREATE POLICY school_monthly_invoice_lines_admin ON public.school_monthly_invoice_lines
  FOR ALL USING (
    invoice_id IN (
      SELECT id FROM public.school_monthly_invoices
      WHERE public.is_school_admin(organization_id)
    )
  )
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM public.school_monthly_invoices
      WHERE public.is_school_admin(organization_id)
    )
  );

CREATE POLICY school_monthly_invoice_lines_parent ON public.school_monthly_invoice_lines
  FOR SELECT USING (
    invoice_id IN (
      SELECT id FROM public.school_monthly_invoices
      WHERE student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
         OR student_id IN (
           SELECT ps.student_id FROM public.parent_students ps
           JOIN public.parent_profiles pp ON pp.id = ps.parent_id
           WHERE pp.user_id = auth.uid()
         )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_consultation_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_consultations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_lesson_discounts TO authenticated;
GRANT SELECT ON public.school_monthly_invoice_lines TO authenticated;
