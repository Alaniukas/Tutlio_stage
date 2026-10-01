-- Laisvi vaikai + Demo Mokykla: canonical 45 EUR / conducted meeting for active teachers.
-- Individual lessons use the same rate when company_individual_commission_percent is null.

update public.organizations
set default_company_commission_percent = 45
where id in (
  '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17',
  'c3a00000-7e57-4000-8000-000000000001'
);

update public.profiles p
set
  company_commission_percent = 45,
  company_individual_commission_percent = null
where p.organization_id in (
  '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17',
  'c3a00000-7e57-4000-8000-000000000001'
)
and (
  exists (select 1 from public.sessions s where s.tutor_id = p.id)
  or exists (
    select 1 from public.students st
    where st.tutor_id = p.id and st.organization_id = p.organization_id
  )
  or exists (
    select 1 from public.school_class_groups g
    where g.tutor_id = p.id and g.organization_id = p.organization_id
  )
  or (
    p.email ilike '%@laisvivaikai.lt'
    and p.email <> 'info@laisvivaikai.lt'
  )
  or coalesce(p.company_commission_percent, 0) > 0
);
