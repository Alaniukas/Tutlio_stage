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
  organization_id uuid
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
    s.organization_id
  from public.students s
  where upper(s.invite_code) = upper(p_invite_code)
  limit 1;
$$;

revoke all on function public.get_student_by_invite_code(text) from public;
grant execute on function public.get_student_by_invite_code(text) to anon, authenticated, service_role;
