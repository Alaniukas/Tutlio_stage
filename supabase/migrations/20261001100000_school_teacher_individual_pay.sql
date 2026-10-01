-- School teachers can have a separate individual-meeting rate. Group meetings
-- keep using company_commission_percent. Historical snapshots are never rewritten.

alter table public.profiles
  add column if not exists company_individual_commission_percent numeric(10,2);

comment on column public.profiles.company_individual_commission_percent is
  'School teacher pay EUR / individual meeting. NULL or non-positive uses the group rate.';

create or replace function private.resolve_org_tutor_session_pay(
  p_tutor_id uuid,
  p_subject_id uuid,
  p_class_group_id uuid default null
) returns numeric
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_base_pay numeric;
  v_individual_pay numeric;
  v_subject_pay jsonb;
  v_org_id uuid;
  v_override_text text;
  v_subject_is_group boolean := false;
begin
  select
    p.company_commission_percent,
    p.company_individual_commission_percent,
    p.company_commission_by_subject,
    p.organization_id
  into v_base_pay, v_individual_pay, v_subject_pay, v_org_id
  from public.profiles p
  where p.id = p_tutor_id;

  if not found then
    return 0;
  end if;

  -- Mano korepetitorius supports a different fixed tutor rate per subject.
  if v_org_id = '2c4e4c2a-4e12-44ca-b327-d605bbb0d50b'::uuid
     and p_subject_id is not null then
    v_override_text := v_subject_pay ->> p_subject_id::text;
    if v_override_text is not null
       and v_override_text ~ '^[0-9]+([.][0-9]+)?$'
       and v_override_text::numeric > 0 then
      return round(v_override_text::numeric, 2);
    end if;
  end if;

  if p_subject_id is not null then
    select coalesce(s.is_group, false) into v_subject_is_group
    from public.subjects s where s.id = p_subject_id;
  end if;

  if p_class_group_id is null and v_subject_is_group is not true
     and v_individual_pay is not null and v_individual_pay > 0
     and v_individual_pay::numeric <> 'NaN'::numeric then
    return round(v_individual_pay, 2);
  end if;

  return greatest(round(coalesce(v_base_pay, 0), 2), 0);
end;
$$;

create or replace function private.capture_org_tutor_session_pay()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_pay numeric;
begin
  if new.status in ('completed', 'no_show')
     and (
       tg_op = 'insert'
       or new.tutor_pay_eur_snapshot is null
       or old.status not in ('completed', 'no_show')
       or new.tutor_id is distinct from old.tutor_id
       or new.subject_id is distinct from old.subject_id
       or new.class_group_id is distinct from old.class_group_id
     ) then
    v_pay := private.resolve_org_tutor_session_pay(new.tutor_id, new.subject_id, new.class_group_id);
    if v_pay > 0 then
      new.tutor_pay_eur_snapshot := v_pay;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sessions_capture_org_tutor_pay on public.sessions;
create trigger sessions_capture_org_tutor_pay
before insert or update of status, tutor_id, subject_id, class_group_id, tutor_pay_eur_snapshot
on public.sessions
for each row
execute function private.capture_org_tutor_session_pay();

create or replace function private.backfill_org_tutor_pay_after_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.company_commission_percent is distinct from old.company_commission_percent
     or new.company_individual_commission_percent is distinct from old.company_individual_commission_percent
     or new.company_commission_by_subject is distinct from old.company_commission_by_subject then
    update public.sessions s
    set tutor_pay_eur_snapshot = private.resolve_org_tutor_session_pay(s.tutor_id, s.subject_id, s.class_group_id)
    where s.tutor_id = new.id
      and s.status in ('completed', 'no_show')
      and s.tutor_pay_eur_snapshot is null
      and private.resolve_org_tutor_session_pay(s.tutor_id, s.subject_id, s.class_group_id) > 0;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_backfill_org_tutor_pay on public.profiles;
create trigger profiles_backfill_org_tutor_pay
after update of company_commission_percent, company_individual_commission_percent, company_commission_by_subject
on public.profiles
for each row
execute function private.backfill_org_tutor_pay_after_profile_change();

-- Adding a parameter creates a new overload. Drop the leftover 2-arg resolver
-- only after callers already use the 3-arg function.
drop function if exists private.resolve_org_tutor_session_pay(uuid, uuid);
