alter table public.landing_leads
  add column if not exists locale text,
  add column if not exists audience text,
  add column if not exists quiz_answers jsonb,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists consent_at timestamptz;

alter table public.landing_leads
  add constraint landing_leads_audience_check
  check (audience is null or audience in ('solo', 'company', 'school'));

create index if not exists landing_leads_source_created_at_idx
  on public.landing_leads (source, created_at desc);

alter table public.landing_leads enable row level security;

drop policy if exists service_role_all_landing_leads on public.landing_leads;
revoke all on table public.landing_leads from anon, authenticated;
grant select, insert, update, delete on table public.landing_leads to service_role;
