-- Enable the staff-document flow only for VšĮ „Laisvi vaikai“.
-- The application still requires school_contract_esign and checks this org ID.
DO $$
BEGIN
  UPDATE public.organizations
  SET features = jsonb_set(
    coalesce(features, '{}'::jsonb),
    '{school_staff_documents}',
    'true'::jsonb,
    true
  )
  WHERE id = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17'
    AND entity_type = 'school'
    AND coalesce(features->>'school_contract_esign', 'false') = 'true';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Laisvi vaikai school with e-sign enabled was not found';
  END IF;
END $$;
