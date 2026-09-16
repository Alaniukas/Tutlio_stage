create table if not exists public.in_app_support_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  reporter_user_id uuid references auth.users(id) on delete set null,
  reporter_name text,
  reporter_email text not null,
  reporter_role text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  organization_name text,
  category text not null,
  title text not null,
  context text not null,
  steps jsonb not null default '[]'::jsonb,
  expected_outcome text not null,
  actual_outcome text,
  impact text not null,
  impact_details text not null,
  page text not null default '/',
  locale text not null default 'en',
  environment jsonb not null default '{}'::jsonb,
  transcript jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  status text not null default 'new',
  priority text not null default 'untriaged',
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint in_app_support_request_id_length check (char_length(request_id) between 8 and 100),
  constraint in_app_support_reporter_name_length check (reporter_name is null or char_length(reporter_name) <= 200),
  constraint in_app_support_reporter_email_length check (char_length(reporter_email) between 3 and 320),
  constraint in_app_support_reporter_role check (reporter_role in ('tutor', 'organization_admin', 'student', 'parent')),
  constraint in_app_support_category check (category in ('bug', 'feature')),
  constraint in_app_support_title_length check (char_length(title) between 5 and 180),
  constraint in_app_support_context_length check (char_length(context) between 10 and 4000),
  constraint in_app_support_steps_array check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) between 1 and 12),
  constraint in_app_support_expected_length check (char_length(expected_outcome) between 5 and 4000),
  constraint in_app_support_actual_length check (actual_outcome is null or char_length(actual_outcome) between 5 and 4000),
  constraint in_app_support_impact check (impact in ('blocking', 'high', 'medium', 'low')),
  constraint in_app_support_impact_details_length check (char_length(impact_details) between 3 and 2000),
  constraint in_app_support_status check (status in ('new', 'in_review', 'planned', 'resolved', 'closed')),
  constraint in_app_support_priority check (priority in ('untriaged', 'low', 'medium', 'high', 'urgent')),
  constraint in_app_support_json_shapes check (
    jsonb_typeof(environment) = 'object'
    and jsonb_typeof(transcript) = 'array'
    and jsonb_typeof(attachments) = 'array'
  )
);

comment on table public.in_app_support_requests is
  'Structured bug reports and feature requests created by signed-in Tutlio users.';

create index if not exists in_app_support_requests_created_idx
  on public.in_app_support_requests (created_at desc);
create index if not exists in_app_support_requests_status_created_idx
  on public.in_app_support_requests (status, created_at desc);
create index if not exists in_app_support_requests_org_created_idx
  on public.in_app_support_requests (organization_id, created_at desc)
  where organization_id is not null;
create index if not exists in_app_support_requests_reporter_created_idx
  on public.in_app_support_requests (reporter_user_id, created_at desc);

alter table public.in_app_support_requests enable row level security;
revoke all on table public.in_app_support_requests from public, anon, authenticated;
grant select, insert, update, delete on table public.in_app_support_requests to service_role;

create or replace function public.set_in_app_support_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists in_app_support_requests_updated_at on public.in_app_support_requests;
create trigger in_app_support_requests_updated_at
before update on public.in_app_support_requests
for each row execute function public.set_in_app_support_updated_at();
