-- PROD sync block 04: 20260427200000..20260428112000


-- =============================
-- FILE: 20260427200000_expand_student_invite_lookup_fields.sql
-- =============================

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

-- =============================
-- FILE: 20260427210000_students_parent_secondary_address.sql
-- =============================

alter table public.students
  add column if not exists parent_secondary_address text;

-- =============================
-- FILE: 20260428104000_fix_org_admins_rls_recursion.sql
-- =============================

-- Fix infinite recursion in organization_admins SELECT policy.
-- The previous policy queried organization_admins inside its own USING clause.

CREATE OR REPLACE FUNCTION public.is_org_admin_member(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_admins oa
    WHERE oa.user_id = p_user_id
      AND oa.organization_id = p_org_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_admin_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_admin_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Org admin reads co-admins same org" ON public.organization_admins;
CREATE POLICY "Org admin reads co-admins same org" ON public.organization_admins
  FOR SELECT
  USING (
    public.is_org_admin_member(auth.uid(), organization_id)
  );

