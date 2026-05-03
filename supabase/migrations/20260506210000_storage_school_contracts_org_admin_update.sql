-- Upsert į school-contracts reikalauja UPDATE politikos storage.objects (buvo tik INSERT).
DROP POLICY IF EXISTS "school_contracts_org_admin_update" ON storage.objects;

CREATE POLICY "school_contracts_org_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'school-contracts'
    AND EXISTS (
      SELECT 1 FROM public.organization_admins oa WHERE oa.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'school-contracts'
    AND EXISTS (
      SELECT 1 FROM public.organization_admins oa WHERE oa.user_id = auth.uid()
    )
  );
