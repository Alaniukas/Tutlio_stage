-- Solo tutors: rankiniai studentų mokėjimai (be Stripe tarp studento ir mokėjimo) nepriklausomai nuo platformos subscription_plan.
-- Valdoma platform admin per /admin arba istoriškai subscription_only / manual_subscription_exempt.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS enable_manual_student_payments boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.enable_manual_student_payments IS
  'Solo tutor (organization_id null): when true, students use manual/off-platform lesson & package flows (same gates as subscription_only / manual_subscription_exempt for student-facing payments). Does not bypass platform Tutlio billing.';
