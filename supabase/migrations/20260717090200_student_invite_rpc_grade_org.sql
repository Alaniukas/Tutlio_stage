-- Invite lookup additions for the org onboarding page:
--  * grade — when the admin already set the class, registration skips the
--    grade step entirely;
--  * resolved_organization_id — students.organization_id falling back to the
--    tutor's org, so the unauthenticated registration page can fetch org
--    branding (logo) via /api/org-branding;
--  * tutor_full_name / tutor_cancellation_* — StudentOnboarding already reads
--    these fields but previous RPC versions never returned them.
-- Keeps every existing column so current callers are unaffected.

drop function if exists public.get_student_by_invite_code(text);

create or replace function public.get_student_by_invite_code(p_invite_code text)
returns table (
  id uuid,
  full_name text,
  email text,
  phone text,
  tutor_id uuid,
  linked_user_id uuid,
  payer_name text,
  payer_email text,
  payer_phone text,
  child_birth_date date,
  organization_id uuid,
  organization_entity_type text,
  grade text,
  resolved_organization_id uuid,
  tutor_full_name text,
  tutor_cancellation_hours integer,
  tutor_cancellation_fee_percent integer
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    s.full_name,
    s.email,
    s.phone,
    s.tutor_id,
    s.linked_user_id,
    s.payer_name,
    s.payer_email,
    s.payer_phone,
    s.child_birth_date,
    s.organization_id,
    o.entity_type::text as organization_entity_type,
    s.grade,
    coalesce(s.organization_id, p.organization_id) as resolved_organization_id,
    p.full_name as tutor_full_name,
    p.cancellation_hours as tutor_cancellation_hours,
    p.cancellation_fee_percent as tutor_cancellation_fee_percent
  from public.students s
  left join public.profiles p on p.id = s.tutor_id
  left join public.organizations o on o.id = coalesce(s.organization_id, p.organization_id)
  where upper(s.invite_code) = upper(p_invite_code)
  limit 1;
$$;

revoke all on function public.get_student_by_invite_code(text) from public;
grant execute on function public.get_student_by_invite_code(text) to anon, authenticated, service_role;
