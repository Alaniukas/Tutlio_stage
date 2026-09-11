-- RLS INSERT on chat_messages calls this SECURITY DEFINER helper. REVOKE ALL
-- FROM PUBLIC without GRANT left only postgres able to execute it, so every
-- authenticated send failed with: permission denied for function
-- chat_recipients_allow_messages.
GRANT EXECUTE ON FUNCTION private.chat_recipients_allow_messages(uuid) TO authenticated, service_role;;
