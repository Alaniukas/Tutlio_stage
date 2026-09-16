-- Keep school-contracts private and restrict authenticated storage access to the
-- organization encoded in the first path segment.
--
-- Contract paths use either:
--   <org-id>/contracts/<contract-id>/...
--   <org-id>/signed/<contract-id>-...
-- Template paths use:
--   <org-id>/...
--
-- The previous policies only checked whether the caller was any organization
-- admin, which allowed an admin from one organization to access another
-- organization's contract files.

DROP POLICY IF EXISTS "school_contracts_org_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "school_contracts_org_admin_read" ON storage.objects;
DROP POLICY IF EXISTS "school_contracts_org_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "school_contracts_student_read" ON storage.objects;

CREATE POLICY "school_contracts_org_admin_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'school-contracts'
    AND EXISTS (
      SELECT 1
      FROM public.organization_admins oa
      WHERE oa.user_id = auth.uid()
        AND split_part(name, '/', 1) = oa.organization_id::text
    )
  );

CREATE POLICY "school_contracts_org_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'school-contracts'
    AND EXISTS (
      SELECT 1
      FROM public.organization_admins oa
      WHERE oa.user_id = auth.uid()
        AND split_part(name, '/', 1) = oa.organization_id::text
    )
  );

CREATE POLICY "school_contracts_org_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'school-contracts'
    AND EXISTS (
      SELECT 1
      FROM public.organization_admins oa
      WHERE oa.user_id = auth.uid()
        AND split_part(name, '/', 1) = oa.organization_id::text
    )
  )
  WITH CHECK (
    bucket_id = 'school-contracts'
    AND EXISTS (
      SELECT 1
      FROM public.organization_admins oa
      WHERE oa.user_id = auth.uid()
        AND split_part(name, '/', 1) = oa.organization_id::text
    )
  );

CREATE POLICY "school_contracts_student_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'school-contracts'
    AND EXISTS (
      SELECT 1
      FROM public.school_contracts sc
      JOIN public.students s ON s.id = sc.student_id
      WHERE s.linked_user_id = auth.uid()
        AND split_part(name, '/', 1) = sc.organization_id::text
        AND (
          (
            split_part(name, '/', 2) = 'contracts'
            AND split_part(name, '/', 3) = sc.id::text
          )
          OR (
            split_part(name, '/', 2) = 'signed'
            AND split_part(name, '/', 3) LIKE sc.id::text || '-%'
          )
        )
    )
  );
