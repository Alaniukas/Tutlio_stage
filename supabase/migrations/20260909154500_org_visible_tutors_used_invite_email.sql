-- Confirmed org tutors include used invites matched by email when used_by_profile_id
-- was never stored (legacy claim path). Keeps the admin tutor list in sync with
-- tutors who already have an org profile.

CREATE OR REPLACE FUNCTION public.get_my_org_visible_tutor_ids()
RETURNS TABLE(user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $$
  WITH caller AS (
    SELECT admin.organization_id
    FROM public.organization_admins admin
    WHERE admin.user_id = (SELECT auth.uid())
      AND admin.status = 'active'
      AND private.org_admin_permission_gate(ARRAY[
        'dashboard.view', 'tutors.view', 'tutors.edit', 'students.view', 'students.edit',
        'sessions.view', 'sessions.edit', 'messages.view', 'messages.edit', 'stats.view',
        'finance.view', 'finance.edit', 'contracts.view', 'contracts.edit',
        'settings.view', 'settings.edit'
      ])
  )
  SELECT DISTINCT student.tutor_id AS user_id
  FROM caller
  JOIN public.students student ON student.organization_id = caller.organization_id
  WHERE student.tutor_id IS NOT NULL
  UNION
  SELECT DISTINCT invite.used_by_profile_id AS user_id
  FROM caller
  JOIN public.tutor_invites invite ON invite.organization_id = caller.organization_id
  WHERE invite.used_by_profile_id IS NOT NULL
  UNION
  SELECT DISTINCT profile.id AS user_id
  FROM caller
  JOIN public.tutor_invites invite ON invite.organization_id = caller.organization_id
  JOIN public.profiles profile
    ON profile.organization_id = caller.organization_id
   AND lower(trim(profile.email)) = lower(trim(invite.invitee_email))
  WHERE invite.used = true
    AND invite.invitee_email IS NOT NULL
    AND profile.email IS NOT NULL;
$$;
