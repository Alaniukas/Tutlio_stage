-- Payment reconciliation and trial invoice line creation look up sessions by package.
-- Production had no index for this foreign key; avoid scanning all lessons per payment.
CREATE INDEX IF NOT EXISTS idx_sessions_lesson_package
  ON public.sessions (lesson_package_id)
  WHERE lesson_package_id IS NOT NULL;

-- Stable, paginated organization invoice retrieval, including complete CSV exports.
CREATE INDEX IF NOT EXISTS idx_invoices_org_created_id
  ON public.invoices (organization_id, created_at DESC, id DESC)
  WHERE organization_id IS NOT NULL;
