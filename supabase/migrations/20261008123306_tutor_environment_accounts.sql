-- A verified person can switch between existing tutor identities. Business
-- records and auth.uid()-based tenant policies keep their original owners.
CREATE TABLE public.tutor_environment_accounts (
  tutor_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  identity_id uuid NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tutor_environment_accounts_identity_idx
  ON public.tutor_environment_accounts(identity_id);
ALTER TABLE public.tutor_environment_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tutor_environment_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tutor_environment_accounts TO service_role;

-- Called only by the server after a platform admin verifies and assigns the
-- existing accounts to the same person. Tutors cannot manage these links.
-- Invoker privileges are intentional; this RPC does not bypass RLS for users.
CREATE FUNCTION public.link_tutor_environment_accounts(p_tutor_id uuid, p_other_tutor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  first_org uuid;
  other_org uuid;
  first_identity uuid;
  other_identity uuid;
  account_count integer;
BEGIN
  IF p_tutor_id IS NULL OR p_other_tutor_id IS NULL OR p_tutor_id = p_other_tutor_id THEN
    RAISE EXCEPTION 'Two different tutor accounts are required';
  END IF;

  -- Account linking is rare. Serialize group merges and unlinks so concurrent
  -- requests cannot split a verified identity or attach a partially merged one.
  LOCK TABLE public.tutor_environment_accounts IN SHARE ROW EXCLUSIVE MODE;
  PERFORM id FROM public.profiles
    WHERE id IN (p_tutor_id, p_other_tutor_id) ORDER BY id FOR SHARE;
  SELECT organization_id INTO first_org FROM public.profiles WHERE id = p_tutor_id;
  SELECT organization_id INTO other_org FROM public.profiles WHERE id = p_other_tutor_id;
  IF first_org IS NULL OR other_org IS NULL OR first_org = other_org
    OR EXISTS (SELECT 1 FROM public.organization_admins WHERE user_id IN (p_tutor_id, p_other_tutor_id)) THEN
    RAISE EXCEPTION 'Accounts must be tutors of different organizations';
  END IF;

  SELECT identity_id INTO first_identity FROM public.tutor_environment_accounts WHERE tutor_id = p_tutor_id;
  SELECT identity_id INTO other_identity FROM public.tutor_environment_accounts WHERE tutor_id = p_other_tutor_id;
  SELECT count(*) INTO account_count FROM (
    SELECT tutor_id FROM public.tutor_environment_accounts
      WHERE identity_id IN (first_identity, other_identity)
    UNION SELECT p_tutor_id
    UNION SELECT p_other_tutor_id
  ) accounts;
  IF account_count > 20 THEN RAISE EXCEPTION 'Too many linked accounts'; END IF;

  first_identity := coalesce(first_identity, other_identity, gen_random_uuid());
  IF other_identity IS NOT NULL AND other_identity <> first_identity THEN
    UPDATE public.tutor_environment_accounts SET identity_id = first_identity WHERE identity_id = other_identity;
  END IF;
  INSERT INTO public.tutor_environment_accounts(tutor_id, identity_id, organization_id)
    VALUES (p_tutor_id, first_identity, first_org), (p_other_tutor_id, first_identity, other_org)
    ON CONFLICT (tutor_id) DO UPDATE
      SET identity_id = EXCLUDED.identity_id, organization_id = EXCLUDED.organization_id, linked_at = now();
  INSERT INTO public.platform_admin_audit(action, organization_id, details)
    VALUES ('tutor_environments.assign', first_org, jsonb_build_object(
      'tutor_id', p_tutor_id, 'other_tutor_id', p_other_tutor_id,
      'other_organization_id', other_org, 'identity_id', first_identity));
END;
$$;
REVOKE ALL ON FUNCTION public.link_tutor_environment_accounts(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_tutor_environment_accounts(uuid, uuid) TO service_role;

CREATE FUNCTION public.unlink_tutor_environment_account(p_tutor_id uuid, p_other_tutor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  source_identity uuid;
  source_org uuid;
BEGIN
  IF p_tutor_id IS NULL OR p_other_tutor_id IS NULL OR p_tutor_id = p_other_tutor_id THEN
    RAISE EXCEPTION 'Two different tutor accounts are required';
  END IF;
  LOCK TABLE public.tutor_environment_accounts IN SHARE ROW EXCLUSIVE MODE;
  SELECT a.identity_id, a.organization_id INTO source_identity, source_org
    FROM public.tutor_environment_accounts a
    JOIN public.profiles p ON p.id = a.tutor_id AND p.organization_id = a.organization_id
    WHERE a.tutor_id = p_tutor_id;
  DELETE FROM public.tutor_environment_accounts
    WHERE tutor_id = p_other_tutor_id AND identity_id = source_identity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Accounts are not assigned to the same person'; END IF;
  INSERT INTO public.platform_admin_audit(action, organization_id, details)
    VALUES ('tutor_environments.remove', source_org, jsonb_build_object(
      'tutor_id', p_tutor_id, 'other_tutor_id', p_other_tutor_id));
END;
$$;
REVOKE ALL ON FUNCTION public.unlink_tutor_environment_account(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_tutor_environment_account(uuid, uuid) TO service_role;
