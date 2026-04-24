-- Add optional PDF support for school contract templates/contracts
ALTER TABLE public.school_contract_templates
  ADD COLUMN IF NOT EXISTS pdf_url text;

ALTER TABLE public.school_contracts
  ADD COLUMN IF NOT EXISTS pdf_url text;

-- Public bucket for school contract templates (PDF files)
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-contracts', 'school-contracts', true)
ON CONFLICT (id) DO NOTHING;

-- Basic authenticated access to school-contracts bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'school_contracts_authenticated_read'
  ) THEN
    CREATE POLICY "school_contracts_authenticated_read"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'school-contracts');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'school_contracts_authenticated_insert'
  ) THEN
    CREATE POLICY "school_contracts_authenticated_insert"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'school-contracts');
  END IF;
END$$;

