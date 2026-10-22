-- Restore an existing parent's access across Goda's two active tutor cards.
-- The existing RPC enforces the same child, organization and administrator permissions.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
DO $preflight$
DECLARE claims text;
BEGIN
  PERFORM id FROM public.students
  WHERE id IN ('b086aab1-901f-4ea5-aabc-3cf4d2e393d5','fbb7b3c9-c47a-43d4-94eb-d9b4987e5e9b')
  ORDER BY id FOR UPDATE;
  IF (SELECT count(*) FROM public.students s WHERE s.id IN (
    'b086aab1-901f-4ea5-aabc-3cf4d2e393d5','fbb7b3c9-c47a-43d4-94eb-d9b4987e5e9b')
    AND s.organization_id='2c4e4c2a-4e12-44ca-b327-d605bbb0d50b'
    AND s.linked_user_id='2954ceab-342c-4ebe-85f9-cff29dc8b11d'
    AND s.detached_at IS NULL AND COALESCE(s.enrollment_status,'active')='active') <> 2
    OR NOT EXISTS (SELECT 1 FROM public.students s JOIN public.parent_students ps ON ps.student_id=s.id
      JOIN public.parent_profiles pp ON pp.id=ps.parent_id
      WHERE s.id='fbb7b3c9-c47a-43d4-94eb-d9b4987e5e9b'
      AND s.parent_user_id='2b71af12-1270-4671-bd04-44783eec8067'
      AND pp.id='77b18707-5cb0-4c73-b0f1-a50ef730a36b' AND pp.user_id=s.parent_user_id)
    OR EXISTS (SELECT 1 FROM public.parent_students ps WHERE ps.student_id='b086aab1-901f-4ea5-aabc-3cf4d2e393d5'
      AND ps.parent_id<>'77b18707-5cb0-4c73-b0f1-a50ef730a36b')
  THEN RAISE EXCEPTION 'Active MK family repair: verified family state changed'; END IF;

  SELECT jsonb_build_object('sub',a.user_id,'role','authenticated','session_id',se.id)::text INTO STRICT claims
  FROM public.organization_admins a JOIN auth.sessions se ON se.user_id=a.user_id
  WHERE a.organization_id='2c4e4c2a-4e12-44ca-b327-d605bbb0d50b' AND a.role='owner'
    AND a.status='active' AND a.accepted_at IS NOT NULL AND (se.not_after IS NULL OR se.not_after>now())
  ORDER BY se.created_at DESC LIMIT 1;
  PERFORM set_config('request.jwt.claims',claims,true);
  PERFORM set_config('request.jwt.claim.sub',(claims::jsonb)->>'sub',true);
END;
$preflight$;
SET LOCAL ROLE authenticated;
SELECT public.copy_student_parent_links_for_tutor_pairing(
  'fbb7b3c9-c47a-43d4-94eb-d9b4987e5e9b','b086aab1-901f-4ea5-aabc-3cf4d2e393d5');
SELECT parent_user_id='2b71af12-1270-4671-bd04-44783eec8067'::uuid AS parent_pointer_restored,
  EXISTS (SELECT 1 FROM public.parent_students ps WHERE ps.student_id=s.id
    AND ps.parent_id='77b18707-5cb0-4c73-b0f1-a50ef730a36b') AS portal_link_restored
FROM public.students s WHERE s.id='b086aab1-901f-4ea5-aabc-3cf4d2e393d5';
COMMIT;
