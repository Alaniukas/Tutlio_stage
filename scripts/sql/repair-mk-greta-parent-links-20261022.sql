-- Authorized incident repair: retain the verified parent on Greta's live card.
-- This changes family links only. The archived card and lessons stay in place.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
DO $repair$
DECLARE
  live public.students%ROWTYPE;
  archived public.students%ROWTYPE;
  guardian public.parent_profiles%ROWTYPE;
  live_before jsonb;
  archived_before jsonb;
  org_id constant uuid := '2c4e4c2a-4e12-44ca-b327-d605bbb0d50b';
  child_user constant uuid := '73d4b8b1-2ad8-4c8d-be65-c7ea7ff5c97c';
  parent_user constant uuid := '7196537a-c7a0-49eb-ad77-0442ac631372';
BEGIN
  PERFORM id FROM public.students
  WHERE id IN ('ab86d501-2dc9-44fe-93d9-51f4d3e56fb5','c40d3ff1-12c1-470a-b473-bd39a8bab430')
  ORDER BY id FOR UPDATE;
  SELECT * INTO STRICT live FROM public.students WHERE id='ab86d501-2dc9-44fe-93d9-51f4d3e56fb5';
  SELECT * INTO STRICT archived FROM public.students WHERE id='c40d3ff1-12c1-470a-b473-bd39a8bab430';
  SELECT * INTO STRICT guardian FROM public.parent_profiles
  WHERE id='7e7c652c-d9fa-4280-8e37-f20b2d0052e3' FOR SHARE;

  IF live.organization_id IS DISTINCT FROM org_id OR archived.organization_id IS DISTINCT FROM org_id
    OR live.linked_user_id IS DISTINCT FROM child_user OR archived.linked_user_id IS DISTINCT FROM child_user
    OR live.detached_at IS NOT NULL OR archived.detached_at IS NULL OR archived.tutor_id IS NOT NULL
    OR live.tutor_id IS DISTINCT FROM 'e1941de1-8232-4582-8c81-c0cee0af2ae7'::uuid
    OR COALESCE(live.enrollment_status,'active') <> 'active'
    OR COALESCE(lower(regexp_replace(trim(live.full_name),'\s+',' ','g')),'') = ''
    OR lower(regexp_replace(trim(archived.full_name),'\s+',' ','g'))
       IS DISTINCT FROM lower(regexp_replace(trim(live.full_name),'\s+',' ','g'))
    OR NULLIF(trim(live.email),'') IS NULL
    OR lower(trim(archived.email)) IS DISTINCT FROM lower(trim(live.email))
    OR archived.parent_user_id IS DISTINCT FROM parent_user
    OR guardian.user_id IS DISTINCT FROM parent_user
    OR NULLIF(trim(live.payer_email),'') IS NULL
    OR lower(trim(guardian.email)) IS DISTINCT FROM lower(trim(live.payer_email))
    OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id=parent_user
      AND lower(trim(u.email))=lower(trim(live.payer_email)) AND u.email_confirmed_at IS NOT NULL)
    OR NOT EXISTS (SELECT 1 FROM public.parent_students ps WHERE ps.student_id=archived.id AND ps.parent_id=guardian.id)
    OR (live.parent_user_id IS NOT NULL AND live.parent_user_id<>parent_user)
    OR EXISTS (SELECT 1 FROM public.parent_students ps WHERE ps.student_id=live.id AND ps.parent_id<>guardian.id)
  THEN
    RAISE EXCEPTION 'Greta parent-link repair: verified family state changed';
  END IF;

  live_before := to_jsonb(live) - 'parent_user_id';
  archived_before := to_jsonb(archived);
  UPDATE public.students SET parent_user_id=parent_user
  WHERE id=live.id AND parent_user_id IS NULL;
  INSERT INTO public.parent_students(parent_id,student_id) VALUES (guardian.id,live.id)
  ON CONFLICT(parent_id,student_id) DO NOTHING;

  IF (SELECT to_jsonb(s)-'parent_user_id' FROM public.students s WHERE s.id=live.id)
       IS DISTINCT FROM live_before
    OR (SELECT to_jsonb(s) FROM public.students s WHERE s.id=archived.id) IS DISTINCT FROM archived_before
    OR NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id=live.id AND s.parent_user_id=parent_user)
    OR NOT EXISTS (SELECT 1 FROM public.parent_students ps WHERE ps.student_id=live.id AND ps.parent_id=guardian.id)
  THEN
    RAISE EXCEPTION 'Greta parent-link repair: postcondition failed';
  END IF;
END;
$repair$;
COMMIT;
