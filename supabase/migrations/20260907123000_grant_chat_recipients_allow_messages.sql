-- Restore EXECUTE for the chat INSERT RLS helper, matching
-- private.org_admin_permission_gate().
--
-- Why this is required:
--   chat_messages INSERT uses a RESTRICTIVE policy that calls
--   private.chat_recipients_allow_messages(conversation_id). Postgres
--   evaluates that expression as the inserting role, so authenticated
--   must have EXECUTE. The Aug 14 seats migration revoked PUBLIC and
--   never granted it back.
--
-- Why this stays locked down:
--   - schema `private` is not in PostgREST `schemas` / extra_search_path,
--     so the browser cannot rpc() this function
--   - anon is not granted (guests cannot send chat)
--   - the helper returns only boolean and uses auth.uid() internally
--   - we still do not GRANT private.org_admin_user_has_permission, which
--     would let clients probe another user's seat flags
--   - chat_msg_insert still requires sender_id = auth.uid() AND
--     can_access_conversation(conversation_id)

REVOKE ALL ON FUNCTION private.chat_recipients_allow_messages(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.chat_recipients_allow_messages(uuid) TO authenticated, service_role;
