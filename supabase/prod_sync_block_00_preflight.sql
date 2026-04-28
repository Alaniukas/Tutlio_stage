-- Preflight for missing school contract/installment chain
create table if not exists public.school_contract_templates (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid,
  name               text not null default 'Default template',
  body               text not null default '',
  annual_fee_default numeric(10,2),
  is_default         boolean not null default false,
  created_at         timestamptz not null default now()
);

create table if not exists public.school_contracts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid,
  template_id     uuid,
  student_id      uuid,
  filled_body     text not null default '',
  annual_fee      numeric(10,2) not null default 0,
  signing_status  text not null default 'draft',
  signed_at       timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create table if not exists public.school_payment_installments (
  id                         uuid primary key default gen_random_uuid(),
  contract_id                uuid not null,
  installment_number         int not null check (installment_number > 0),
  amount                     numeric(10,2) not null check (amount > 0),
  due_date                   date not null,
  payment_status             text not null default 'pending',
  stripe_payment_intent_id   text,
  stripe_checkout_session_id text,
  paid_at                    timestamptz,
  created_at                 timestamptz not null default now(),
  reminder_3d_sent_at        timestamptz,
  reminder_1d_sent_at        timestamptz
);

create table if not exists public.school_contract_completion_tokens (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null,
  token text not null unique,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_school_contract_templates_org
  on public.school_contract_templates(organization_id);

create index if not exists idx_school_contracts_org
  on public.school_contracts(organization_id);

create index if not exists idx_school_contracts_student
  on public.school_contracts(student_id);

create index if not exists idx_school_installments_contract
  on public.school_payment_installments(contract_id);

create index if not exists idx_school_contract_completion_tokens_contract
  on public.school_contract_completion_tokens(contract_id);
