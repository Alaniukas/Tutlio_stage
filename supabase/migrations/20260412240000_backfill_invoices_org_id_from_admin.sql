-- Invoices issued by org admins had organization_id NULL (API used isOrgTutor flag only).
-- Company invoices list filters by organization_id, so those rows were invisible there.
-- Backfill from organization_admins for rows where the issuer is an org admin.

UPDATE public.invoices AS i
SET organization_id = oa.organization_id
FROM public.organization_admins AS oa
WHERE i.organization_id IS NULL
  AND i.issued_by_user_id = oa.user_id;
