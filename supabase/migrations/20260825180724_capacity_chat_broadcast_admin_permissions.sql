-- The initial Broadcast policy delegates conversation membership to
-- can_access_conversation(), an older helper that predates scoped organization
-- admin seats. Apply the same restrictive permission gate as chat table reads
-- so a revoked, inactive, or message-disabled admin cannot keep a Realtime
-- subscription alive with an unexpired JWT.

CREATE OR REPLACE FUNCTION private.broadcast_chat_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  participant_row record;
BEGIN
  UPDATE public.chat_conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;

  -- Realtime caches topic authorization on an open socket. Keep sensitive
  -- content out of the event and make every receiver read the message through
  -- the current chat_messages RLS policy instead.
  PERFORM realtime.send(
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

REVOKE ALL ON FUNCTION private.broadcast_chat_message_insert()
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS tutlio_private_chat_broadcasts ON realtime.messages;
CREATE POLICY tutlio_private_chat_broadcasts
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.messages.extension = 'broadcast'
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
