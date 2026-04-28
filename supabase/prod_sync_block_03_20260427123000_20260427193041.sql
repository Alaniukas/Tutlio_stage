-- PROD sync block 03: 20260427123000..20260427193041


-- =============================
-- FILE: 20260427123000_student_payment_model_multi_select.sql
-- =============================

-- Allow multiple payment models per student (comma-separated)
-- and make per_lesson timing checks compatible with multi-select values.

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.students'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%payment_model%'
  LOOP
    EXECUTE format('ALTER TABLE public.students DROP CONSTRAINT %I', c.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.students
  ADD CONSTRAINT students_payment_model_check
  CHECK (
    payment_model IS NULL
    OR payment_model ~ '^(per_lesson|monthly_billing|prepaid_packages)(,(per_lesson|monthly_billing|prepaid_packages))*$'
  );

COMMENT ON COLUMN public.students.payment_model IS
  'Optional per-student payment model override(s). NULL = use default finance rules; otherwise comma-separated values: per_lesson, monthly_billing, prepaid_packages.';

CREATE OR REPLACE FUNCTION public.student_booking_blocked_overdue(p_student_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_tutor uuid;
  v_restrict boolean;
  v_timing text;
  v_deadline_h int;
  v_now timestamptz := now();
  st_email text;
  st_payer_email text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT s.tutor_id,
         nullif(lower(trim(coalesce(s.email, ''))), ''),
         nullif(lower(trim(coalesce(s.payer_email, ''))), '')
  INTO v_tutor, st_email, st_payer_email
  FROM public.students s
  WHERE s.id = p_student_id;

  IF v_tutor IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = p_student_id AND s.linked_user_id = v_uid
  ) THEN
    RETURN false;
  END IF;

  SELECT COALESCE(p.restrict_booking_on_overdue, false),
         COALESCE(p.payment_timing, 'before_lesson'),
         COALESCE(p.payment_deadline_hours, 24)
  INTO v_restrict, v_timing, v_deadline_h
  FROM public.profiles p
  WHERE p.id = v_tutor;

  IF NOT v_restrict THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.billing_batches bb
    WHERE bb.tutor_id = v_tutor
      AND bb.paid = false
      AND bb.payment_deadline_date < v_now
      AND (
        (st_email IS NOT NULL AND lower(trim(bb.payer_email)) = st_email)
        OR (st_payer_email IS NOT NULL AND lower(trim(bb.payer_email)) = st_payer_email)
      )
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sessions s
    INNER JOIN public.students st ON st.id = s.student_id
    WHERE s.student_id = p_student_id
      AND s.status <> 'cancelled'
      AND COALESCE(s.paid, false) = false
      AND COALESCE(s.payment_status, '') NOT IN ('paid', 'confirmed', 'paid_by_student')
      AND s.lesson_package_id IS NULL
      AND s.payment_batch_id IS NULL
      AND (
        CASE
          WHEN (
            CASE
              WHEN position('per_lesson' in coalesce(st.payment_model, '')) > 0 AND st.per_lesson_payment_timing IS NOT NULL
              THEN st.per_lesson_payment_timing
              ELSE v_timing
            END
          ) = 'before_lesson' THEN
            v_now > s.start_time - (
              (
                CASE
                  WHEN position('per_lesson' in coalesce(st.payment_model, '')) > 0 AND st.per_lesson_payment_deadline_hours IS NOT NULL
                  THEN st.per_lesson_payment_deadline_hours
                  ELSE v_deadline_h
                END
              ) * interval '1 hour'
            )
          ELSE
            v_now > s.end_time + (
              (
                CASE
                  WHEN position('per_lesson' in coalesce(st.payment_model, '')) > 0 AND st.per_lesson_payment_deadline_hours IS NOT NULL
                  THEN st.per_lesson_payment_deadline_hours
                  ELSE v_deadline_h
                END
              ) * interval '1 hour'
            )
        END
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.student_booking_blocked_overdue(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_booking_blocked_overdue(uuid) TO authenticated;

-- =============================
-- FILE: 20260427131500_school_contract_signed_upload.sql
-- =============================

-- Store uploaded signed contract file per school contract
ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS signed_contract_url text;

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS signed_uploaded_at timestamptz;

-- =============================
-- FILE: 20260427142000_school_installment_reminder_flags.sql
-- =============================

-- Track automatic reminder sends for school installments
ALTER TABLE public.school_payment_installments
  ADD COLUMN IF NOT EXISTS reminder_3d_sent_at timestamptz;

ALTER TABLE public.school_payment_installments
  ADD COLUMN IF NOT EXISTS reminder_1d_sent_at timestamptz;

-- =============================
-- FILE: 20260427150000_school_contracts_archive_soft_delete.sql
-- =============================

-- Soft-delete support for school contracts (archive instead of hard delete)
ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- =============================
-- FILE: 20260427154500_students_child_birth_date.sql
-- =============================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS child_birth_date date;

-- =============================
-- FILE: 20260427162000_school_contract_number.sql
-- =============================

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS contract_number text;

-- =============================
-- FILE: 20260427190000_students_second_parent_and_address.sql
-- =============================

alter table public.students
  add column if not exists parent_secondary_name text,
  add column if not exists parent_secondary_email text,
  add column if not exists parent_secondary_phone text,
  add column if not exists payer_personal_code text,
  add column if not exists parent_secondary_personal_code text,
  add column if not exists contact_parent text default 'primary',
  add column if not exists student_address text,
  add column if not exists student_city text;

update public.students
set contact_parent = 'primary'
where contact_parent is null or contact_parent not in ('primary', 'secondary');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'students_contact_parent_check'
  ) then
    alter table public.students
      add constraint students_contact_parent_check
      check (contact_parent in ('primary', 'secondary'));
  end if;
end $$;

create table if not exists public.school_contract_completion_tokens (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.school_contracts(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_school_contract_completion_tokens_contract
  on public.school_contract_completion_tokens(contract_id);
