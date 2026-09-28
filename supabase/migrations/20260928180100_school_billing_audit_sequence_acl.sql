-- Keep audit identities monotonic: service code may allocate ids, but not call setval.
REVOKE ALL ON SEQUENCE public.school_session_billing_decisions_id_seq FROM service_role;
GRANT USAGE, SELECT ON SEQUENCE public.school_session_billing_decisions_id_seq TO service_role;
