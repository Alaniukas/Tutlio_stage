-- Durable, service-role-only acceptance snapshots. Never expose payer data or source bytes via RLS.
create table public.school_acceptance_jobs (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null unique references public.school_contracts(id) on delete restrict,
  organization_id uuid not null references public.organizations(id),
  token_id uuid not null references public.school_contract_completion_tokens(id),
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued','processing','completed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_id uuid,
  locked_until timestamptz,
  pdf_path text,
  finalized_at timestamptz,
  confirmation_sent boolean not null default false,
  invite_sent boolean not null default false,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.school_acceptance_jobs enable row level security;
revoke all on public.school_acceptance_jobs from anon, authenticated;
grant all on public.school_acceptance_jobs to service_role;
create index school_acceptance_jobs_due on public.school_acceptance_jobs(available_at) where status <> 'completed';

create function public.enqueue_school_acceptance(p_contract_id uuid, p_token_id uuid, p_payload jsonb)
returns public.school_acceptance_jobs language plpgsql security definer set search_path = public as $$
declare c public.school_contracts; j public.school_acceptance_jobs;
begin
  select * into c from public.school_contracts where id=p_contract_id for update;
  if not found or c.kind <> 'extra_lessons' then raise exception 'Invalid contract'; end if;
  select * into j from public.school_acceptance_jobs where contract_id=c.id;
  if found then return j; end if;
  if c.accepted_at is not null or c.withdrawal_requested_at is not null then raise exception 'Contract already closed'; end if;
  if not exists(select 1 from public.school_contract_completion_tokens where id=p_token_id and contract_id=c.id
    and (expires_at is null or expires_at > now())) then raise exception 'Invalid token'; end if;
  insert into public.school_acceptance_jobs(contract_id,organization_id,token_id,payload)
    values(c.id,c.organization_id,p_token_id,p_payload) returning * into j;
  return j;
end $$;

create function public.claim_school_acceptance()
returns setof public.school_acceptance_jobs language sql security definer set search_path = public as $$
  update public.school_acceptance_jobs set status='processing', attempts=attempts+1,
    lease_id=gen_random_uuid(), locked_until=now()+interval '5 minutes'
  where id=(select id from public.school_acceptance_jobs
    where status <> 'completed' and available_at <= now()
      and (locked_until is null or locked_until < now())
    order by available_at,created_at for update skip locked limit 1)
  returning *;
$$;

create function public.finalize_school_acceptance(p_job_id uuid,p_lease_id uuid,p_pdf_path text)
returns boolean language plpgsql security definer set search_path = public as $$
declare j public.school_acceptance_jobs; c public.school_contracts; a public.school_contracts;
begin
  select * into j from public.school_acceptance_jobs where id=p_job_id for update;
  if not found or j.lease_id is distinct from p_lease_id or j.locked_until < now() then return false; end if;
  if j.finalized_at is not null then return true; end if;
  if p_pdf_path not like j.organization_id::text || '/contracts/' || j.contract_id::text || '/%' then raise exception 'Invalid PDF path'; end if;
  select * into c from public.school_contracts where id=j.contract_id for update;
  if c.accepted_at is not null or c.withdrawal_requested_at is not null then raise exception 'Contract changed before finalization'; end if;
  a := jsonb_populate_record(null::public.school_contracts,j.payload->'acceptance');
  update public.school_contracts set
    accepted_at=a.accepted_at, accepted_terms=true, start_within_14_days=a.start_within_14_days,
    start_within_14_status=a.start_within_14_status, start_within_14_shown_text=a.start_within_14_shown_text,
    start_within_14_chosen_at=a.start_within_14_chosen_at, accepted_by_user_id=a.accepted_by_user_id,
    recording_consent=a.recording_consent, document_sha256=a.document_sha256, filled_body=a.filled_body,
    order_snapshot=a.order_snapshot, revision_label=a.revision_label, base_lessons_per_month=a.base_lessons_per_month,
    unit_price_eur=a.unit_price_eur, annual_fee=a.annual_fee,
    pdf_url=p_pdf_path,signed_contract_url=p_pdf_path,signing_status='signed',signed_at=a.accepted_at
    where id=j.contract_id;
  update public.school_contract_completion_tokens set used_at=a.accepted_at where id=j.token_id;
  update public.school_acceptance_jobs set pdf_path=p_pdf_path,finalized_at=now(),last_error=null where id=j.id;
  return true;
end $$;

revoke all on function public.enqueue_school_acceptance(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.claim_school_acceptance() from public,anon,authenticated;
revoke all on function public.finalize_school_acceptance(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.enqueue_school_acceptance(uuid,uuid,jsonb) to service_role;
grant execute on function public.claim_school_acceptance() to service_role;
grant execute on function public.finalize_school_acceptance(uuid,uuid,text) to service_role;

create table public.school_acceptance_deliveries (
  id text primary key,
  job_id uuid not null references public.school_acceptance_jobs(id),
  payload jsonb not null,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text
);
alter table public.school_acceptance_deliveries enable row level security;
revoke all on public.school_acceptance_deliveries from anon,authenticated;
grant all on public.school_acceptance_deliveries to service_role;
