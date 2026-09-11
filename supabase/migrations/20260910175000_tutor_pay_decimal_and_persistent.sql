-- Tutor compensation is money, not a percentage. The admin UI already allows
-- half-euro steps, so keep decimals instead of rejecting/rounding them.
ALTER TABLE public.profiles
  ALTER COLUMN company_commission_percent TYPE numeric(10,2)
    USING company_commission_percent::numeric(10,2),
  ALTER COLUMN company_commission_percent SET DEFAULT 0;

ALTER TABLE public.tutor_invites
  ALTER COLUMN company_commission_percent TYPE numeric(10,2)
    USING company_commission_percent::numeric(10,2),
  ALTER COLUMN company_commission_percent SET DEFAULT 0;

ALTER TABLE public.organizations
  ALTER COLUMN default_company_commission_percent TYPE numeric(10,2)
    USING default_company_commission_percent::numeric(10,2),
  ALTER COLUMN default_company_commission_percent SET DEFAULT 0;

COMMENT ON COLUMN public.profiles.company_commission_percent IS
  'Tutor compensation in EUR per lesson. Legacy column name retained for compatibility.';

COMMENT ON COLUMN public.tutor_invites.company_commission_percent IS
  'Initial tutor compensation in EUR per lesson. Legacy column name retained for compatibility.';

COMMENT ON COLUMN public.organizations.default_company_commission_percent IS
  'Default tutor compensation in EUR per lesson. Legacy column name retained for compatibility.';
