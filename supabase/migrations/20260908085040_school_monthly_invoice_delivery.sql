-- Provider payloads and idempotency state must never be writable by organization
-- admins or students. The invoice table itself has broader organization policies.
ALTER TABLE public.school_monthly_invoices
  ADD COLUMN IF NOT EXISTS billing_model text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS billed_session_ids uuid[] NOT NULL DEFAULT '{}';

CREATE TABLE public.school_monthly_invoice_deliveries (
  id uuid PRIMARY KEY REFERENCES public.school_monthly_invoices(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payload jsonb,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  provider_message_id text,
  last_error text
);
ALTER TABLE public.school_monthly_invoice_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.school_monthly_invoice_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_monthly_invoice_deliveries TO service_role;

-- Older sends did not use a provider idempotency key. An absent sent stamp is
-- not proof that no email was delivered: never resend them automatically.
INSERT INTO public.school_monthly_invoice_deliveries
  (id, organization_id, attempted_at, sent_at, last_error)
SELECT id, organization_id, created_at, invoice_email_sent_at,
  CASE WHEN invoice_email_sent_at IS NULL THEN 'legacy_delivery_requires_review' ELSE NULL END
FROM public.school_monthly_invoices;

COMMENT ON TABLE public.school_monthly_invoice_deliveries IS
  'Server-only frozen Resend payload and delivery state; retries expire before Resend 24h deduplication window.';
