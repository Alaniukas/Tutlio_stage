-- Supabase revokes other auth.sessions rows when a password changes, but an
-- already-issued JWT can otherwise keep passing PostgREST/Storage RLS until exp.
-- Check the signed-in user's session at both entry points:
--   * PostgREST pre-request: includes SECURITY DEFINER RPCs that bypass RLS.
--   * Restrictive RLS: includes Storage and Postgres Changes, outside PostgREST.
-- Existing row/organization permissions still apply. This adds no access grants
-- to application data and does not revoke any currently valid sessions.

DO $check_existing_hook$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles r
    CROSS JOIN LATERAL unnest(r.rolconfig) setting
    WHERE r.rolname = 'authenticator'
      AND setting LIKE 'pgrst.db_pre_request=%'
      AND setting NOT IN ('pgrst.db_pre_request=', 'pgrst.db_pre_request=public.enforce_active_auth_session')
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_db_role_setting s
    CROSS JOIN LATERAL unnest(s.setconfig) setting
    WHERE s.setrole IN (0, (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticator'))
      AND s.setdatabase IN (0, (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database()))
      AND setting LIKE 'pgrst.db_pre_request=%'
      AND setting NOT IN ('pgrst.db_pre_request=', 'pgrst.db_pre_request=public.enforce_active_auth_session')
  ) THEN
    RAISE EXCEPTION 'An existing PostgREST pre-request hook must be composed with the active-session check before this migration is applied';
  END IF;
END;
$check_existing_hook$;

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_active_auth_session()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  caller_id uuid;
  caller_session_id uuid;
BEGIN
  -- Never accept user_metadata, an argument supplied by a client, or another
  -- user's live session as proof that this JWT still has a valid session.
  caller_id := auth.uid();
  caller_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  IF caller_id IS NULL OR caller_session_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM auth.sessions s
    WHERE s.id = caller_session_id
      AND s.user_id = caller_id
      AND (s.not_after IS NULL OR s.not_after > pg_catalog.statement_timestamp())
  );
EXCEPTION WHEN invalid_text_representation THEN
  -- Missing/malformed identities fail closed without exposing auth table data.
  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION private.has_active_auth_session() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_active_auth_session() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_active_auth_session()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  -- PostgREST invokes this after SET LOCAL ROLE. Public pages and service-role
  -- jobs keep their existing behavior; JWT metadata cannot select this branch.
  IF current_user <> 'authenticated' THEN
    RETURN;
  END IF;

  IF NOT private.has_active_auth_session() THEN
    RAISE SQLSTATE 'PGRST' USING
      MESSAGE = '{"code":"session_not_found","message":"Your session has ended. Please sign in again.","details":null,"hint":null}',
      DETAIL = '{"status":401,"headers":{"Cache-Control":"no-store"}}';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_active_auth_session() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_active_auth_session() TO anon, authenticated, service_role;

DO $add_session_guards$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT n.nspname, c.relname
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND c.relrowsecurity
      AND (
        n.nspname = 'public'
        OR (n.nspname = 'storage' AND c.relname IN ('objects', 'buckets'))
        OR (n.nspname = 'realtime' AND c.relname = 'messages')
      )
    ORDER BY n.nspname, c.relname
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS require_active_auth_session ON %I.%I', target.nspname, target.relname);
    -- The scalar subselect is an InitPlan, so the indexed session lookup is
    -- evaluated once per statement/table rather than once per application row.
    EXECUTE format(
      'CREATE POLICY require_active_auth_session ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT private.has_active_auth_session())) WITH CHECK ((SELECT private.has_active_auth_session()))',
      target.nspname, target.relname
    );
  END LOOP;
END;
$add_session_guards$;

ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.enforce_active_auth_session';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- Realtime Broadcast authorizations already cached on an open websocket and
-- previously issued signed download URLs have their own expiration lifecycle.
-- Chat broadcasts carry IDs only; fetching their content goes through the guard.
-- RLS checks apply to new private-channel authorizations and Postgres Changes.
