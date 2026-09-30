-- Coordinate every Trello synchronization worker across serverless instances.
-- The creation marker is durable because an HTTP timeout can follow a successful
-- external card creation. A later worker must recover that card before retrying.
create table public.support_trello_sync_claims (
  ticket_id uuid primary key references public.in_app_support_requests(id) on delete cascade,
  lease_token uuid,
  lease_until timestamptz,
  creation_uncertain boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint support_trello_sync_lease_pair check ((lease_token is null) = (lease_until is null))
);

alter table public.support_trello_sync_claims enable row level security;
revoke all on public.support_trello_sync_claims from public, anon, authenticated;
grant select, insert, update, delete on public.support_trello_sync_claims to service_role;

create function public.claim_support_trello_sync(p_ticket_id uuid, p_lease_token uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_request public.in_app_support_requests%rowtype;
  v_claim public.support_trello_sync_claims%rowtype;
  v_now timestamptz;
begin
  if p_ticket_id is null or p_lease_token is null then
    raise exception 'Ticket and lease identifiers are required.' using errcode = '22023';
  end if;
  -- All four functions acquire the ticket before the ledger row. External HTTP
  -- runs after this short transaction has committed, never while holding locks.
  select * into v_request from public.in_app_support_requests where id = p_ticket_id for update;
  if not found then return jsonb_build_object('outcome', 'missing'); end if;
  insert into public.support_trello_sync_claims(ticket_id) values(p_ticket_id) on conflict do nothing;
  select * into v_claim from public.support_trello_sync_claims where ticket_id = p_ticket_id for update;
  v_now := clock_timestamp();
  if v_claim.lease_until > v_now then
    return jsonb_build_object('outcome', 'busy');
  end if;
  update public.support_trello_sync_claims
    set lease_token = p_lease_token, lease_until = v_now + interval '120 seconds', updated_at = v_now
    where ticket_id = p_ticket_id;
  return jsonb_build_object('outcome', 'claimed', 'request', to_jsonb(v_request),
    'creationUncertain', v_claim.creation_uncertain);
end;
$$;

create function public.current_support_trello_sync(p_ticket_id uuid, p_lease_token uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_request public.in_app_support_requests%rowtype;
  v_claim public.support_trello_sync_claims%rowtype;
begin
  select * into v_request from public.in_app_support_requests where id = p_ticket_id for update;
  if not found then return null; end if;
  select * into v_claim from public.support_trello_sync_claims where ticket_id = p_ticket_id for update;
  if not found or v_claim.lease_token is distinct from p_lease_token
    or v_claim.lease_until is null or v_claim.lease_until <= clock_timestamp() then return null; end if;
  return to_jsonb(v_request);
end;
$$;

create function public.mark_support_trello_creation(p_ticket_id uuid, p_lease_token uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_request public.in_app_support_requests%rowtype;
  v_claim public.support_trello_sync_claims%rowtype;
begin
  select * into v_request from public.in_app_support_requests where id = p_ticket_id for update;
  if not found then return false; end if;
  select * into v_claim from public.support_trello_sync_claims where ticket_id = p_ticket_id for update;
  if not found or v_claim.lease_token is distinct from p_lease_token
    or v_claim.lease_until is null or v_claim.lease_until <= clock_timestamp()
    or v_claim.creation_uncertain or v_request.trello_card_id is not null then return false; end if;
  update public.support_trello_sync_claims set creation_uncertain = true, updated_at = clock_timestamp()
    where ticket_id = p_ticket_id;
  return true;
end;
$$;

create function public.finish_support_trello_sync(
  p_ticket_id uuid, p_lease_token uuid, p_card_id text default null,
  p_card_url text default null, p_error text default null,
  p_expected_status_updated_at timestamptz default null, p_expected_priority text default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_request public.in_app_support_requests%rowtype;
  v_claim public.support_trello_sync_claims%rowtype;
  v_now timestamptz;
  v_stale boolean := false;
begin
  select * into v_request from public.in_app_support_requests where id = p_ticket_id for update;
  if not found then return jsonb_build_object('saved', false, 'stale', false); end if;
  select * into v_claim from public.support_trello_sync_claims where ticket_id = p_ticket_id for update;
  v_now := clock_timestamp();
  if not found or v_claim.lease_token is distinct from p_lease_token
    or v_claim.lease_until is null or v_claim.lease_until <= v_now then
    return jsonb_build_object('saved', false, 'stale', false);
  end if;
  if p_card_id is not null then
    if p_card_id = '' or length(p_card_id) > 200 or p_card_id !~ '^[a-zA-Z0-9_-]+$'
      or (p_card_url is not null and length(p_card_url) > 2000) then
      raise exception 'Invalid Trello card metadata.' using errcode = '22023';
    end if;
    v_stale := (p_expected_status_updated_at is not null
        and v_request.status_updated_at is distinct from p_expected_status_updated_at)
      or (p_expected_priority is not null and v_request.priority is distinct from p_expected_priority);
    -- Always retain the known provider ID, even if the ticket changed during HTTP.
    -- The retry repairs external status without risking a second card creation.
    update public.in_app_support_requests set trello_card_id = p_card_id,
      trello_card_url = p_card_url,
      trello_synced_at = case when v_stale then trello_synced_at else v_now end,
      trello_sync_error = case when v_stale then
        'Ticket changed during Trello synchronization. Retry to synchronize its current status.' else null end
      where id = p_ticket_id;
    update public.support_trello_sync_claims set creation_uncertain = false where ticket_id = p_ticket_id;
  elsif p_error is not null then
    update public.in_app_support_requests set trello_sync_error = left(p_error, 500) where id = p_ticket_id;
  end if;
  -- No card and no error means release only: preserve existing metadata/marker.
  update public.support_trello_sync_claims set lease_token = null, lease_until = null, updated_at = v_now
    where ticket_id = p_ticket_id;
  return jsonb_build_object('saved', true, 'stale', v_stale);
end;
$$;

revoke all on function public.claim_support_trello_sync(uuid, uuid) from public, anon, authenticated;
revoke all on function public.current_support_trello_sync(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_support_trello_creation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finish_support_trello_sync(uuid, uuid, text, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.claim_support_trello_sync(uuid, uuid) to service_role;
grant execute on function public.current_support_trello_sync(uuid, uuid) to service_role;
grant execute on function public.mark_support_trello_creation(uuid, uuid) to service_role;
grant execute on function public.finish_support_trello_sync(uuid, uuid, text, text, text, timestamptz, text) to service_role;

comment on table public.support_trello_sync_claims is
  'Private cross-instance Trello lease and durable ambiguous-creation marker; never customer-readable.';
