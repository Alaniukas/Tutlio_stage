-- Solo tutors: free-text bank / payment instructions shown to payers in manual package emails.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS manual_payment_bank_details text;

COMMENT ON COLUMN public.profiles.manual_payment_bank_details IS
  'Solo tutor: IBAN, bank name, reference text—included in manual_package_request emails when set.';
