-- Teacher attestations are independent of sessions, contract acceptance and billing.
-- A group id is retained as historical evidence after an administrator deletes the group.
create table public.school_group_attendance_attestations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id uuid not null,
  student_id uuid not null references public.students(id) on delete cascade,
  tutor_id uuid references public.profiles(id) on delete set null,
  anchor_session_id uuid references public.sessions(id) on delete set null,
  start_time timestamptz not null,
  end_time timestamptz not null check (end_time > start_time),
  status text not null check (status in ('completed', 'no_show')),
  contract_confirmed boolean not null,
  confirmed_by uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  student_name text not null,
  tutor_name text not null,
  group_name text not null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, student_id, start_time)
);
alter table public.school_group_attendance_attestations enable row level security;
revoke all on public.school_group_attendance_attestations from public, anon, authenticated;
grant select, insert, update, delete on public.school_group_attendance_attestations to service_role;
create index school_group_attendance_alerts on public.school_group_attendance_attestations
  (organization_id, start_time desc) where status = 'completed' and not contract_confirmed and reviewed_at is null;

-- Concurrent repeated clicks preserve the first attestation. A changed outcome is a new attestation.
create function public.save_school_group_attendance(p_record jsonb)
returns public.school_group_attendance_attestations
language plpgsql security invoker set search_path = public as $$
declare
  attendance public.school_group_attendance_attestations;
  anchor public.sessions;
  saved public.school_group_attendance_attestations;
begin
  attendance := jsonb_populate_record(null::public.school_group_attendance_attestations, p_record);
  -- A normal lesson's delayed audit must follow its current confirmed outcome.
  -- A sibling anchor merely locates a standalone occurrence and supplies no outcome.
  if attendance.anchor_session_id is not null then
    select * into anchor from public.sessions
      where id = attendance.anchor_session_id and student_id = attendance.student_id for update;
    if found then
      if anchor.class_group_id is distinct from attendance.group_id
          or anchor.start_time is distinct from attendance.start_time
          or anchor.status not in ('completed', 'no_show') or anchor.status_confirmed_at is null then
        raise exception 'The confirmed lesson occurrence changed' using errcode = '23514';
      end if;
      attendance.status := anchor.status;
      attendance.confirmed_at := anchor.status_confirmed_at;
      attendance.confirmed_by := anchor.status_confirmed_by;
      attendance.end_time := anchor.end_time;
    end if;
  end if;
  insert into public.school_group_attendance_attestations as previous
    (organization_id, group_id, student_id, tutor_id, anchor_session_id, start_time, end_time,
     status, contract_confirmed, confirmed_by, confirmed_at, student_name, tutor_name, group_name)
  values (attendance.organization_id, attendance.group_id, attendance.student_id, attendance.tutor_id,
    attendance.anchor_session_id, attendance.start_time, attendance.end_time, attendance.status,
    attendance.contract_confirmed, attendance.confirmed_by, attendance.confirmed_at,
    attendance.student_name, attendance.tutor_name, attendance.group_name)
  on conflict (group_id, student_id, start_time) do update set
    status = excluded.status,
    contract_confirmed = case when previous.status = excluded.status then previous.contract_confirmed else excluded.contract_confirmed end,
    confirmed_by = case when previous.status = excluded.status then previous.confirmed_by else excluded.confirmed_by end,
    confirmed_at = case when previous.status = excluded.status then previous.confirmed_at else excluded.confirmed_at end,
    reviewed_at = case when previous.status = excluded.status then previous.reviewed_at else null end
  returning previous.* into saved;
  return saved;
end;
$$;
revoke all on function public.save_school_group_attendance(jsonb) from public, anon, authenticated;
grant execute on function public.save_school_group_attendance(jsonb) to service_role;
