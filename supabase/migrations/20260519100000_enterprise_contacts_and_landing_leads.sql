-- Enterprise contact form submissions
create table if not exists public.enterprise_contacts (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  license_count int not null,
  contact_name text not null,
  contact_surname text not null,
  email text not null,
  phone text,
  message text,
  created_at timestamptz not null default now()
);

alter table public.enterprise_contacts enable row level security;

create policy "service_role_all_enterprise_contacts"
  on public.enterprise_contacts for all
  using (true) with check (true);

grant all on public.enterprise_contacts to service_role;

-- Landing page email leads
create table if not exists public.landing_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null default 'landing_integrations',
  created_at timestamptz not null default now()
);

alter table public.landing_leads enable row level security;

create policy "service_role_all_landing_leads"
  on public.landing_leads for all
  using (true) with check (true);

grant all on public.landing_leads to service_role;

-- Index on email for dedup checks
create index if not exists idx_landing_leads_email on public.landing_leads (email);
create index if not exists idx_enterprise_contacts_created_at on public.enterprise_contacts (created_at desc);
