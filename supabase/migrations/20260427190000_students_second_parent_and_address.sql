alter table public.students
  add column if not exists parent_secondary_name text,
  add column if not exists parent_secondary_email text,
  add column if not exists parent_secondary_phone text,
  add column if not exists payer_personal_code text,
  add column if not exists parent_secondary_personal_code text,
  add column if not exists contact_parent text default 'primary',
  add column if not exists student_address text,
  add column if not exists student_city text;

update public.students
set contact_parent = 'primary'
where contact_parent is null or contact_parent not in ('primary', 'secondary');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'students_contact_parent_check'
  ) then
    alter table public.students
      add constraint students_contact_parent_check
      check (contact_parent in ('primary', 'secondary'));
  end if;
end $$;

create table if not exists public.school_contract_completion_tokens (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.school_contracts(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists idx_school_contract_completion_tokens_contract
  on public.school_contract_completion_tokens(contract_id);
