-- Route chat updates through private Broadcast topics instead of Postgres
-- Changes. Postgres Changes authorizes every change against every subscriber;
-- these topics authorize only the affected inbox/conversation.

CREATE SCHEMA IF NOT EXISTS private;

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_cursor
  ON public.chat_messages (conversation_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION private.broadcast_chat_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  participant_row record;
BEGIN
  -- Keep inbox ordering transactionally consistent with the inserted message.
  UPDATE public.chat_conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;

  PERFORM realtime.send(
    -- Broadcast only identifiers. Receivers fetch the row through chat_messages
    -- RLS, so a permission revocation takes effect even while Realtime's topic
    -- authorization cache is still alive on an existing socket.
    jsonb_build_object(
      'conversation_id', NEW.conversation_id,
      'message_id', NEW.id
    ),
    'message_inserted',
    'conversation:' || NEW.conversation_id::text || ':messages',
    true
  );

  FOR participant_row IN
    SELECT participant.user_id
    FROM public.chat_participants participant
    WHERE participant.conversation_id = NEW.conversation_id
  LOOP
    PERFORM realtime.send(
      jsonb_build_object(
        'conversation_id', NEW.conversation_id,
        'message_id', NEW.id
      ),
      'inbox_changed',
      'user:' || participant_row.user_id::text || ':inbox',
      true
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.broadcast_chat_message_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_message_broadcast_insert ON public.chat_messages;
CREATE TRIGGER chat_message_broadcast_insert
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION private.broadcast_chat_message_insert();

CREATE OR REPLACE FUNCTION private.broadcast_chat_participant_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  affected_user_id uuid;
  affected_conversation_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_user_id := OLD.user_id;
    affected_conversation_id := OLD.conversation_id;
  ELSE
    affected_user_id := NEW.user_id;
    affected_conversation_id := NEW.conversation_id;
  END IF;

  PERFORM realtime.send(
    jsonb_build_object('conversation_id', affected_conversation_id),
    'inbox_changed',
    'user:' || affected_user_id::text || ':inbox',
    true
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.broadcast_chat_participant_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS chat_participant_broadcast_change ON public.chat_participants;
CREATE TRIGGER chat_participant_broadcast_change
AFTER INSERT OR UPDATE OR DELETE ON public.chat_participants
FOR EACH ROW
EXECUTE FUNCTION private.broadcast_chat_participant_change();

-- Realtime checks this policy when a client joins a private topic. The
-- conversation branch deliberately delegates to the same authorization helper
-- used by chat_messages RLS, including organization-admin access.
DROP POLICY IF EXISTS tutlio_private_chat_broadcasts ON realtime.messages;
CREATE POLICY tutlio_private_chat_broadcasts
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
  -- Mirror the restrictive organization-admin seat policy used by the chat
  -- tables. Non-admin portal users pass this gate; revoked, inactive, or
  -- message-disabled admin seats do not.
  AND (SELECT private.org_admin_permission_gate(
    ARRAY['messages.view', 'messages.edit']::text[]
  ))
  AND (
    (SELECT realtime.topic()) =
      'user:' || (SELECT auth.uid())::text || ':inbox'
    OR CASE
      WHEN (SELECT realtime.topic()) ~
        '^conversation:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:messages$'
      THEN public.can_access_conversation(
        split_part((SELECT realtime.topic()), ':', 2)::uuid
      )
      ELSE false
    END
  )
);

-- Keep the old publication entries for one rolling deployment so already-open
-- clients continue receiving Postgres Changes. New clients no longer subscribe
-- to them, so the authorization fan-out disappears without a flag day.
