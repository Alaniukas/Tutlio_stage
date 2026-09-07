-- Extra-lessons contracts, year-long class groups, monthly credit invoices,
-- join no-show reason, and Drive recording visibility (school orgs).

-- ─── school_contracts extra-lessons columns ─────────────────────────────────

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'annual';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'school_contracts_kind_check'
      AND conrelid = 'public.school_contracts'::regclass
  ) THEN
    ALTER TABLE public.school_contracts
      ADD CONSTRAINT school_contracts_kind_check
      CHECK (kind IN ('annual', 'extra_lessons'));
  END IF;
END $$;

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS order_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_terms boolean,
  ADD COLUMN IF NOT EXISTS start_within_14_days boolean,
  ADD COLUMN IF NOT EXISTS recording_consent boolean,
  ADD COLUMN IF NOT EXISTS document_sha256 text,
  ADD COLUMN IF NOT EXISTS revision_label text,
  ADD COLUMN IF NOT EXISTS base_lessons_per_month integer,
  ADD COLUMN IF NOT EXISTS unit_price_eur numeric(10,2),
  ADD COLUMN IF NOT EXISTS class_group_id uuid,
  ADD COLUMN IF NOT EXISTS withdrawal_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawal_reason text;

CREATE INDEX IF NOT EXISTS idx_school_contracts_kind
  ON public.school_contracts(organization_id, kind);

COMMENT ON COLUMN public.school_contracts.kind IS
  'annual = ugdymo šeimoje metinė sutartis; extra_lessons = nuotolinių papildomų pamokų klik-akceptas';
COMMENT ON COLUMN public.school_contracts.order_snapshot IS
  'Frozen extra-lessons order fields shown to the parent before accept';
COMMENT ON COLUMN public.school_contracts.document_sha256 IS
  'SHA-256 of the exact contract redaction + order snapshot accepted by the parent';

-- ─── year-long class groups ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.school_class_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tutor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  name text NOT NULL,
  school_year_start date NOT NULL,
  school_year_end date NOT NULL,
  platform text NOT NULL DEFAULT 'Google Meet',
  duration_minutes integer NOT NULL DEFAULT 45,
  meeting_link text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.school_class_group_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.school_class_groups(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL
);

CREATE TABLE IF NOT EXISTS public.school_class_group_members (
  group_id uuid NOT NULL REFERENCES public.school_class_groups(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_school_class_groups_org
  ON public.school_class_groups(organization_id);
CREATE INDEX IF NOT EXISTS idx_school_class_groups_tutor
  ON public.school_class_groups(tutor_id);
CREATE INDEX IF NOT EXISTS idx_school_class_group_members_student
  ON public.school_class_group_members(student_id);

ALTER TABLE public.school_contracts
  DROP CONSTRAINT IF EXISTS school_contracts_class_group_id_fkey;
ALTER TABLE public.school_contracts
  ADD CONSTRAINT school_contracts_class_group_id_fkey
  FOREIGN KEY (class_group_id) REFERENCES public.school_class_groups(id) ON DELETE SET NULL;

ALTER TABLE public.school_class_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_class_group_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_class_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY school_class_groups_admin_all ON public.school_class_groups
  FOR ALL USING (public.is_school_admin(organization_id))
  WITH CHECK (public.is_school_admin(organization_id));

CREATE POLICY school_class_groups_tutor_select ON public.school_class_groups
  FOR SELECT USING (tutor_id = auth.uid());

CREATE POLICY school_class_groups_tutor_insert ON public.school_class_groups
  FOR INSERT WITH CHECK (
    tutor_id = auth.uid()
    AND organization_id IN (SELECT organization_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY school_class_groups_tutor_update ON public.school_class_groups
  FOR UPDATE USING (tutor_id = auth.uid())
  WITH CHECK (tutor_id = auth.uid());

CREATE POLICY school_class_group_slots_admin ON public.school_class_group_slots
  FOR ALL USING (
    group_id IN (SELECT id FROM public.school_class_groups WHERE public.is_school_admin(organization_id) OR tutor_id = auth.uid())
  )
  WITH CHECK (
    group_id IN (SELECT id FROM public.school_class_groups WHERE public.is_school_admin(organization_id) OR tutor_id = auth.uid())
  );

CREATE POLICY school_class_group_members_admin ON public.school_class_group_members
  FOR ALL USING (
    group_id IN (SELECT id FROM public.school_class_groups WHERE public.is_school_admin(organization_id))
  )
  WITH CHECK (
    group_id IN (SELECT id FROM public.school_class_groups WHERE public.is_school_admin(organization_id))
  );

CREATE POLICY school_class_group_members_tutor_select ON public.school_class_group_members
  FOR SELECT USING (
    group_id IN (SELECT id FROM public.school_class_groups WHERE tutor_id = auth.uid())
  );

CREATE POLICY school_class_group_members_student_select ON public.school_class_group_members
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    OR student_id IN (
      SELECT ps.student_id FROM public.parent_students ps
      JOIN public.parent_profiles pp ON pp.id = ps.parent_id
      WHERE pp.user_id = auth.uid()
    )
  );

-- ─── sessions extras / group / no-show reason ───────────────────────────────

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS school_billing_kind text,
  ADD COLUMN IF NOT EXISTS class_group_id uuid REFERENCES public.school_class_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS no_show_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_school_billing_kind_check'
      AND conrelid = 'public.sessions'::regclass
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_school_billing_kind_check
      CHECK (school_billing_kind IS NULL OR school_billing_kind IN ('base', 'extra'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sessions_class_group
  ON public.sessions(class_group_id)
  WHERE class_group_id IS NOT NULL;

-- ─── monthly extra-lessons invoices ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.school_monthly_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.school_contracts(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  unit_price_eur numeric(10,2) NOT NULL,
  base_lessons integer NOT NULL DEFAULT 0,
  base_amount_eur numeric(10,2) NOT NULL DEFAULT 0,
  extra_lessons integer NOT NULL DEFAULT 0,
  extra_amount_eur numeric(10,2) NOT NULL DEFAULT 0,
  total_eur numeric(10,2) NOT NULL,
  extra_session_ids uuid[] NOT NULL DEFAULT '{}',
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'cancelled')),
  due_date date,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, period_start)
);

ALTER TABLE public.school_monthly_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY school_monthly_invoices_admin ON public.school_monthly_invoices
  FOR ALL USING (public.is_school_admin(organization_id))
  WITH CHECK (public.is_school_admin(organization_id));

CREATE POLICY school_monthly_invoices_student_select ON public.school_monthly_invoices
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
    OR student_id IN (
      SELECT ps.student_id FROM public.parent_students ps
      JOIN public.parent_profiles pp ON pp.id = ps.parent_id
      WHERE pp.user_id = auth.uid()
    )
  );

-- ─── lesson recordings (Drive ingest + group visibility) ────────────────────

CREATE TABLE IF NOT EXISTS public.school_lesson_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  drive_file_id text NOT NULL,
  drive_file_name text,
  drive_web_view_link text,
  recorded_at timestamptz,
  duration_minutes integer,
  meet_conference_id text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, drive_file_id)
);

CREATE TABLE IF NOT EXISTS public.school_lesson_recording_groups (
  recording_id uuid NOT NULL REFERENCES public.school_lesson_recordings(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.school_class_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (recording_id, group_id)
);

ALTER TABLE public.school_lesson_recordings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_lesson_recording_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY school_lesson_recordings_admin ON public.school_lesson_recordings
  FOR ALL USING (public.is_school_admin(organization_id))
  WITH CHECK (public.is_school_admin(organization_id));

CREATE POLICY school_lesson_recordings_tutor_select ON public.school_lesson_recordings
  FOR SELECT USING (
    session_id IN (SELECT id FROM public.sessions WHERE tutor_id = auth.uid())
  );

CREATE POLICY school_lesson_recordings_tutor_update ON public.school_lesson_recordings
  FOR UPDATE USING (
    session_id IN (SELECT id FROM public.sessions WHERE tutor_id = auth.uid())
  );

CREATE POLICY school_lesson_recording_groups_admin ON public.school_lesson_recording_groups
  FOR ALL USING (
    recording_id IN (
      SELECT id FROM public.school_lesson_recordings WHERE public.is_school_admin(organization_id)
    )
  )
  WITH CHECK (
    recording_id IN (
      SELECT id FROM public.school_lesson_recordings WHERE public.is_school_admin(organization_id)
    )
  );

CREATE POLICY school_lesson_recording_groups_tutor ON public.school_lesson_recording_groups
  FOR ALL USING (
    recording_id IN (
      SELECT r.id FROM public.school_lesson_recordings r
      JOIN public.sessions s ON s.id = r.session_id
      WHERE s.tutor_id = auth.uid()
    )
  )
  WITH CHECK (
    recording_id IN (
      SELECT r.id FROM public.school_lesson_recordings r
      JOIN public.sessions s ON s.id = r.session_id
      WHERE s.tutor_id = auth.uid()
    )
  );

CREATE POLICY school_lesson_recordings_member_select ON public.school_lesson_recordings
  FOR SELECT USING (
    id IN (
      SELECT rg.recording_id
      FROM public.school_lesson_recording_groups rg
      JOIN public.school_class_group_members m ON m.group_id = rg.group_id
      WHERE m.student_id IN (SELECT id FROM public.students WHERE linked_user_id = auth.uid())
         OR m.student_id IN (
           SELECT ps.student_id FROM public.parent_students ps
           JOIN public.parent_profiles pp ON pp.id = ps.parent_id
           WHERE pp.user_id = auth.uid()
         )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_class_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_class_group_slots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_class_group_members TO authenticated;
GRANT SELECT ON public.school_monthly_invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_lesson_recordings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_lesson_recording_groups TO authenticated;
