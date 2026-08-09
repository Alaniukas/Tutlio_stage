-- Email-keyed opt-out for automated parent/payer reminder emails.
-- Covers unregistered payers (students.payer_email) who have no parent_profiles row.

CREATE TABLE IF NOT EXISTS public.email_reminder_opt_outs (
  email text PRIMARY KEY,
  opted_out_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'footer_page'
);

COMMENT ON TABLE public.email_reminder_opt_outs IS
  'Lowercased emails that opted out of automated Tutlio reminder emails (lesson, payment, school installment crons).';

ALTER TABLE public.email_reminder_opt_outs ENABLE ROW LEVEL SECURITY;

-- No public policies: only service-role API reads/writes this table.
