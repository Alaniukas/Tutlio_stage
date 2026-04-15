-- ============================================================
-- Migration: 20260407000001_invoice_issuance_system.sql
-- Invoice Issuance System (S.F. / Sąskaitų faktūrų išrašymas)
-- ============================================================

-- ─── 1. INVOICE_PROFILES TABLE ──────────────────────────────────────────
-- Stores business/entity details used as "seller" on invoices.
-- One per tutor or organization.

CREATE TABLE IF NOT EXISTS public.invoice_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id     UUID REFERENCES public.organizations(id) ON DELETE CASCADE,

  entity_type         TEXT NOT NULL CHECK (entity_type IN (
    'verslo_liudijimas', 'individuali_veikla', 'mb', 'uab', 'ii'
  )),

  -- Company fields (MB / UAB / IĮ)
  business_name       TEXT,
  company_code        TEXT,
  vat_code            TEXT,
  address             TEXT,

  -- Individual fields (verslo liudijimas / individuali veikla)
  activity_number     TEXT,
  personal_code       TEXT,

  -- Contact
  contact_email       TEXT,
  contact_phone       TEXT,

  -- Invoice numbering
  invoice_series      TEXT NOT NULL DEFAULT 'SF',
  next_invoice_number INT NOT NULL DEFAULT 1,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT one_owner CHECK (
    (user_id IS NOT NULL AND organization_id IS NULL) OR
    (user_id IS NULL AND organization_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_profiles_user
  ON public.invoice_profiles(user_id) WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_profiles_org
  ON public.invoice_profiles(organization_id) WHERE organization_id IS NOT NULL;

-- ─── 2. INVOICES TABLE ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number      TEXT NOT NULL,
  issued_by_user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id     UUID REFERENCES public.organizations(id) ON DELETE SET NULL,

  seller_snapshot     JSONB NOT NULL,
  buyer_snapshot      JSONB NOT NULL,

  issue_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  period_start        DATE,
  period_end          DATE,

  grouping_type       TEXT CHECK (grouping_type IN ('per_payment', 'per_week', 'single')),

  subtotal            NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount        NUMERIC(10,2) NOT NULL DEFAULT 0,

  status              TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'paid', 'cancelled')),

  pdf_storage_path    TEXT,
  billing_batch_id    UUID REFERENCES public.billing_batches(id) ON DELETE SET NULL,

  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_issued_by ON public.invoices(issued_by_user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON public.invoices(issue_date);

-- ─── 3. INVOICE_LINE_ITEMS TABLE ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id          UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description         TEXT NOT NULL,
  quantity            INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price          NUMERIC(10,2) NOT NULL,
  total_price         NUMERIC(10,2) NOT NULL,
  session_ids         UUID[] DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON public.invoice_line_items(invoice_id);

-- ─── 4. STORAGE BUCKET ────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoices',
  'invoices',
  false,
  5242880,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ─── 5. ROW LEVEL SECURITY ────────────────────────────────────────────

ALTER TABLE public.invoice_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

-- invoice_profiles: tutor manages own
DROP POLICY IF EXISTS "invoice_profiles_tutor_all" ON public.invoice_profiles;
CREATE POLICY "invoice_profiles_tutor_all" ON public.invoice_profiles
  FOR ALL USING (auth.uid() = user_id);

-- invoice_profiles: org admin manages org's
DROP POLICY IF EXISTS "invoice_profiles_org_admin_all" ON public.invoice_profiles;
CREATE POLICY "invoice_profiles_org_admin_all" ON public.invoice_profiles
  FOR ALL USING (
    organization_id IN (
      SELECT oa.organization_id FROM public.organization_admins oa WHERE oa.user_id = auth.uid()
    )
  );

-- invoices: tutor manages own
DROP POLICY IF EXISTS "invoices_tutor_all" ON public.invoices;
CREATE POLICY "invoices_tutor_all" ON public.invoices
  FOR ALL USING (auth.uid() = issued_by_user_id);

-- invoices: org admin sees org invoices
DROP POLICY IF EXISTS "invoices_org_admin_select" ON public.invoices;
CREATE POLICY "invoices_org_admin_select" ON public.invoices
  FOR SELECT USING (
    organization_id IN (
      SELECT oa.organization_id FROM public.organization_admins oa WHERE oa.user_id = auth.uid()
    )
  );

-- invoice_line_items: inherit via invoice ownership
DROP POLICY IF EXISTS "invoice_line_items_via_invoice" ON public.invoice_line_items;
CREATE POLICY "invoice_line_items_via_invoice" ON public.invoice_line_items
  FOR ALL USING (
    invoice_id IN (
      SELECT i.id FROM public.invoices i WHERE i.issued_by_user_id = auth.uid()
    )
  );

-- invoice_line_items: org admin read via org invoices
DROP POLICY IF EXISTS "invoice_line_items_org_admin_select" ON public.invoice_line_items;
CREATE POLICY "invoice_line_items_org_admin_select" ON public.invoice_line_items
  FOR SELECT USING (
    invoice_id IN (
      SELECT i.id FROM public.invoices i
      WHERE i.organization_id IN (
        SELECT oa.organization_id FROM public.organization_admins oa WHERE oa.user_id = auth.uid()
      )
    )
  );

-- Storage: tutor manages own invoice PDFs
DROP POLICY IF EXISTS "Tutor manages invoice PDFs" ON storage.objects;
CREATE POLICY "Tutor manages invoice PDFs" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'invoices'
    AND EXISTS (
      SELECT 1 FROM public.invoices inv
      WHERE inv.pdf_storage_path = name
        AND inv.issued_by_user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'invoices'
    AND EXISTS (
      SELECT 1 FROM public.invoices inv
      WHERE inv.pdf_storage_path = name
        AND inv.issued_by_user_id = auth.uid()
    )
  );

-- ─── 6. GRANTS ────────────────────────────────────────────────────────

GRANT ALL ON public.invoice_profiles TO service_role, authenticated;
GRANT ALL ON public.invoices TO service_role, authenticated;
GRANT ALL ON public.invoice_line_items TO service_role, authenticated;

-- ─── 7. COMMENTS ──────────────────────────────────────────────────────

COMMENT ON TABLE public.invoice_profiles IS 'Business entity details for invoice issuance (seller info)';
COMMENT ON TABLE public.invoices IS 'Formal S.F. (saskaita faktura) documents issued by tutors/orgs';
COMMENT ON TABLE public.invoice_line_items IS 'Line items for each issued invoice';
COMMENT ON COLUMN public.invoices.seller_snapshot IS 'Frozen seller details at time of issue';
COMMENT ON COLUMN public.invoices.buyer_snapshot IS 'Frozen buyer details at time of issue';
