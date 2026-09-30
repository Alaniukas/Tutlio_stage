-- Teacher compensation is independent of a child's contract and school charges.
alter table public.school_group_attendance_attestations
  add column tutor_pay_eur_snapshot numeric(10,2),
  add constraint school_attendance_teacher_pay_nonnegative check (
    tutor_pay_eur_snapshot is null or (tutor_pay_eur_snapshot >= 0 and tutor_pay_eur_snapshot <> 'NaN'::numeric)
  );
comment on column public.school_group_attendance_attestations.tutor_pay_eur_snapshot is
  'Common teacher pay for the group meeting, captured once when attendance is saved. NULL means the rate remains unknown.';

alter table public.invoice_line_items add column school_attendance_ids uuid[] not null default '{}';
create index invoice_line_items_school_attendance_ids on public.invoice_line_items using gin (school_attendance_ids);
comment on column public.invoice_line_items.school_attendance_ids is
  'Standalone school attendance evidence paid on a teacher invoice; these IDs never represent child sessions or child billing.';

create or replace function public.save_school_group_attendance(p_record jsonb)
returns public.school_group_attendance_attestations
language plpgsql security invoker set search_path = '' as $$
declare
  attendance public.school_group_attendance_attestations;
  anchor public.sessions;
  saved public.school_group_attendance_attestations;
  v_pay numeric;
  v_distinct_rates integer;
  v_requires_confirmation boolean := false;
begin
  attendance := jsonb_populate_record(null::public.school_group_attendance_attestations, p_record);
  -- A delayed normal-session audit follows its current confirmed outcome.
  -- A sibling anchor only locates an independent factual attendance record.
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
  -- Serialize sibling saves for this meeting, including zero-session groups.
  -- Epoch seconds make the identity independent of a connection's time zone.
  perform pg_advisory_xact_lock(hashtextextended(
    coalesce(attendance.group_id::text, '') || '|' || coalesce(attendance.tutor_id::text, '')
      || '|' || coalesce(extract(epoch from attendance.start_time)::text, ''), 0));
  select tutor_pay_eur_snapshot into v_pay from public.school_group_attendance_attestations
    where organization_id = attendance.organization_id and group_id = attendance.group_id
      and tutor_id = attendance.tutor_id and start_time = attendance.start_time
      and tutor_pay_eur_snapshot is not null
    order by created_at, id limit 1;
  if v_pay is null then
    -- Mirror orgRequiresTutorStatusConfirmation, including its legacy organizations.
    select o.id in ('2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17'::uuid,
        '3422031d-6e21-424d-980b-35a9c6d7b8f1'::uuid, 'b0a00000-7e57-4000-8000-000000000001'::uuid)
      or coalesce(o.features -> 'tutor_lesson_status_confirmation' = 'true'::jsonb, false)
      into v_requires_confirmation from public.organizations o where o.id = attendance.organization_id;
    select count(distinct s.tutor_pay_eur_snapshot), min(s.tutor_pay_eur_snapshot)
      into v_distinct_rates, v_pay from public.sessions s
      where s.class_group_id = attendance.group_id and s.tutor_id = attendance.tutor_id
        and s.start_time = attendance.start_time and s.status in ('completed', 'no_show')
        and s.end_time > s.start_time and s.end_time <= clock_timestamp()
        and (not coalesce(v_requires_confirmation, false) or s.status_confirmed_at is not null)
        and not (s.status = 'no_show' and coalesce(s.no_show_reason, '') = 'missed_join' and s.status_confirmed_at is null)
        and s.tutor_pay_eur_snapshot is not null
        and s.tutor_pay_eur_snapshot >= 0 and s.tutor_pay_eur_snapshot <> 'NaN'::numeric;
    if v_distinct_rates > 1 then
      -- Do not hide conflicting historical teacher compensation with today's rate.
      v_pay := null;
    elsif v_distinct_rates = 0 then
      select round(p.company_commission_percent::numeric, 2) into v_pay from public.profiles p
        where p.id = attendance.tutor_id and p.organization_id = attendance.organization_id
          and p.company_commission_percent > 0 and p.company_commission_percent::numeric <> 'NaN'::numeric;
    end if;
  end if;
  -- The caller cannot inject a compensation snapshot.
  insert into public.school_group_attendance_attestations as previous
    (organization_id, group_id, student_id, tutor_id, anchor_session_id, start_time, end_time,
     status, contract_confirmed, confirmed_by, confirmed_at, student_name, tutor_name, group_name, tutor_pay_eur_snapshot)
  values (attendance.organization_id, attendance.group_id, attendance.student_id, attendance.tutor_id,
    attendance.anchor_session_id, attendance.start_time, attendance.end_time, attendance.status,
    attendance.contract_confirmed, attendance.confirmed_by, attendance.confirmed_at,
    attendance.student_name, attendance.tutor_name, attendance.group_name, v_pay)
  on conflict (group_id, student_id, start_time) do update set
    status = excluded.status,
    contract_confirmed = case when previous.status = excluded.status then previous.contract_confirmed else excluded.contract_confirmed end,
    confirmed_by = case when previous.status = excluded.status then previous.confirmed_by else excluded.confirmed_by end,
    confirmed_at = case when previous.status = excluded.status then previous.confirmed_at else excluded.confirmed_at end,
    reviewed_at = case when previous.status = excluded.status then previous.reviewed_at else null end,
    tutor_pay_eur_snapshot = coalesce(previous.tutor_pay_eur_snapshot, excluded.tutor_pay_eur_snapshot)
  returning previous.* into saved;
  return saved;
end;
$$;
revoke all on function public.save_school_group_attendance(jsonb) from public, anon, authenticated;
grant execute on function public.save_school_group_attendance(jsonb) to service_role;
