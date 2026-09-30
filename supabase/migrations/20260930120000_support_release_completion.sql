-- Only verified production-release handlers and recovery workers may use this ledger.
-- No ticket foreign key: a missing/deleted ticket must still be permanently skipped.
create table public.support_release_tickets (
  release_id uuid not null,
  ticket_id uuid not null,
  deployment_id text not null check (char_length(deployment_id) between 1 and 200),
  event_id text not null check (char_length(event_id) between 1 and 200),
  git_sha text not null check (git_sha ~ '^[0-9a-f]{40}$'),
  outcome text not null check (outcome in ('applied', 'skipped')),
  claimed_status_updated_at timestamptz,
  lease_token uuid,
  lease_until timestamptz,
  first_applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  primary key (release_id, ticket_id),
  constraint support_release_applied_revision check (
    outcome <> 'applied' or (claimed_status_updated_at is not null and first_applied_at is not null)
  ),
  constraint support_release_delivery_lease check ((lease_token is null) = (lease_until is null))
);

alter table public.support_release_tickets enable row level security;
revoke all on table public.support_release_tickets from public, anon, authenticated;
grant select, insert, update on table public.support_release_tickets to service_role;

create index support_release_tickets_pending_idx
  on public.support_release_tickets (updated_at)
  where outcome = 'applied' and completed_at is null;

create function public.claim_support_release_ticket(
  p_release_id uuid,
  p_ticket_id uuid,
  p_deployment_id text,
  p_event_id text,
  p_git_sha text,
  p_lease_token uuid,
  p_retry_only boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_row public.in_app_support_requests;
  ledger_row public.support_release_tickets;
  request_exists boolean;
  claimed_at timestamptz;
begin
  if p_release_id is null or p_ticket_id is null or p_lease_token is null
    or p_deployment_id is null or char_length(trim(p_deployment_id)) not between 1 and 200
    or p_event_id is null or char_length(trim(p_event_id)) not between 1 and 200
    or p_git_sha is null or p_git_sha !~ '^[0-9a-f]{40}$' then
    raise exception 'Invalid support release claim.' using errcode = '22023';
  end if;

  -- All claims lock the ticket before the ledger, including different releases.
  select * into request_row from public.in_app_support_requests
    where id = p_ticket_id for update;
  request_exists := found;
  select * into ledger_row from public.support_release_tickets
    where release_id = p_release_id and ticket_id = p_ticket_id for update;
  claimed_at := clock_timestamp();

  if found then
    if ledger_row.outcome = 'skipped' then
      return jsonb_build_object('outcome', 'skipped');
    end if;
    if ledger_row.completed_at is not null then
      return jsonb_build_object('outcome', 'complete');
    end if;
    -- Replaying an old release must never resolve a reopened or replaced status.
    if not request_exists or request_row.status <> 'resolved'
      or request_row.status_updated_at is distinct from ledger_row.claimed_status_updated_at then
      update public.support_release_tickets set outcome = 'skipped', completed_at = claimed_at,
        lease_token = null, lease_until = null, updated_at = claimed_at,
        last_error = 'The ticket status changed after this release was applied.'
        where release_id = p_release_id and ticket_id = p_ticket_id;
      return jsonb_build_object('outcome', 'skipped');
    end if;
    if ledger_row.lease_until is not null and ledger_row.lease_until > claimed_at then
      return jsonb_build_object('outcome', 'busy');
    end if;
    update public.support_release_tickets set lease_token = p_lease_token,
      lease_until = claimed_at + interval '120 seconds', updated_at = claimed_at, last_error = null
      where release_id = p_release_id and ticket_id = p_ticket_id;
    return jsonb_build_object('outcome', 'retry', 'request', to_jsonb(request_row));
  end if;

  -- The recovery worker can resume only claims previously authorized by a release.
  if p_retry_only then return jsonb_build_object('outcome', 'skipped'); end if;

  if not request_exists or request_row.status <> 'in_progress' then
    insert into public.support_release_tickets (
      release_id, ticket_id, deployment_id, event_id, git_sha, outcome, completed_at
    ) values (p_release_id, p_ticket_id, p_deployment_id, p_event_id, p_git_sha, 'skipped', claimed_at)
    on conflict (release_id, ticket_id) do nothing;
    return jsonb_build_object('outcome', 'skipped');
  end if;

  -- The existing support trigger stamps status_updated_at for this transition.
  update public.in_app_support_requests set status = 'resolved', target_date = null
    where id = p_ticket_id returning * into request_row;
  insert into public.support_release_tickets (
    release_id, ticket_id, deployment_id, event_id, git_sha, outcome,
    claimed_status_updated_at, first_applied_at, lease_token, lease_until
  ) values (
    p_release_id, p_ticket_id, p_deployment_id, p_event_id, p_git_sha, 'applied',
    request_row.status_updated_at, claimed_at, p_lease_token, claimed_at + interval '120 seconds'
  );
  return jsonb_build_object('outcome', 'applied', 'request', to_jsonb(request_row));
end;
$$;

revoke all on function public.claim_support_release_ticket(uuid, uuid, text, text, text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_support_release_ticket(uuid, uuid, text, text, text, uuid, boolean)
  to service_role;

create function public.admit_support_release(
  p_release_id uuid,
  p_ticket_ids uuid[],
  p_deployment_id text,
  p_event_id text,
  p_git_sha text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_ticket_id uuid;
  lease_id uuid;
  claimed jsonb;
  admissions jsonb := '[]'::jsonb;
begin
  if p_ticket_ids is null or cardinality(p_ticket_ids) > 20
    or array_position(p_ticket_ids, null) is not null then
    raise exception 'Invalid support release selection.' using errcode = '22023';
  end if;
  -- Deterministic row lock ordering makes simultaneous batch admissions safe.
  -- The transaction admits every selected ticket before external delivery begins.
  for selected_ticket_id in select distinct supplied.id from unnest(p_ticket_ids) as supplied(id) order by supplied.id loop
    lease_id := gen_random_uuid();
    claimed := public.claim_support_release_ticket(
      p_release_id, selected_ticket_id, p_deployment_id, p_event_id, p_git_sha, lease_id, false
    );
    if claimed->>'outcome' in ('applied', 'retry') then
      update public.support_release_tickets as ledger set lease_token = null, lease_until = null,
        updated_at = clock_timestamp()
        where ledger.release_id = p_release_id and ledger.ticket_id = selected_ticket_id
          and ledger.lease_token = lease_id;
    end if;
    admissions := admissions || jsonb_build_array(jsonb_build_object(
      'ticketId', selected_ticket_id, 'outcome', claimed->>'outcome'
    ));
  end loop;
  return jsonb_build_object('tickets', admissions);
end;
$$;

revoke all on function public.admit_support_release(uuid, uuid[], text, text, text)
  from public, anon, authenticated;
grant execute on function public.admit_support_release(uuid, uuid[], text, text, text) to service_role;

comment on table public.support_release_tickets is
  'Private production-release completion ledger. Release/ticket identity survives delivery retries and prevents replay from resolving reopened tickets.';
comment on column public.support_release_tickets.claimed_status_updated_at is
  'Exact status revision resolved by this release; external delivery retries are valid only while it remains current.';
