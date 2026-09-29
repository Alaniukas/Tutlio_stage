alter table public.in_app_support_requests
  add column if not exists target_date timestamptz,
  add column if not exists status_updated_at timestamptz not null default now(),
  add column if not exists legacy_status text,
  add column if not exists trello_card_id text,
  add column if not exists trello_card_url text,
  add column if not exists trello_synced_at timestamptz,
  add column if not exists trello_sync_error text,
  add column if not exists status_notified_signature text,
  add column if not exists status_notified_at timestamptz,
  add column if not exists status_notification_email_id text,
  add column if not exists status_notification_error text;

-- Keep the previous workflow value for an administrator reviewing existing tickets.
update public.in_app_support_requests
set legacy_status = status
where status in ('new', 'in_review', 'planned', 'closed')
  and legacy_status is null;

alter table public.in_app_support_requests drop constraint if exists in_app_support_status;

update public.in_app_support_requests
set status = case
  when status in ('resolved', 'closed') then 'resolved'
  else 'registered'
end,
status_updated_at = created_at;

alter table public.in_app_support_requests
  alter column status set default 'registered',
  add constraint in_app_support_status
    check (status in ('registered', 'in_progress', 'resolved'));

create or replace function public.set_in_app_support_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  if new.status is distinct from old.status
    or new.target_date is distinct from old.target_date then
    new.status_updated_at = now();
  end if;
  return new;
end;
$$;

comment on column public.in_app_support_requests.target_date is
  'Customer-visible expected completion deadline while a ticket is in progress.';
comment on column public.in_app_support_requests.status_updated_at is
  'Time of the most recent customer-visible status or deadline change.';
comment on column public.in_app_support_requests.legacy_status is
  'Original workflow status retained when the three-state customer ticket lifecycle was introduced.';
comment on column public.in_app_support_requests.trello_card_id is
  'Server-only Trello card identifier for retry-safe backlog synchronization.';
comment on column public.in_app_support_requests.status_notified_signature is
  'Last status and deadline combination successfully emailed to the reporter.';
