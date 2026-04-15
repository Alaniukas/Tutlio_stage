-- Throttled email notifications per conversation: track when we last emailed this participant.
ALTER TABLE public.chat_participants
  ADD COLUMN IF NOT EXISTS email_notify_last_sent_at timestamptz;

COMMENT ON COLUMN public.chat_participants.email_notify_last_sent_at IS
  'Last time an email was sent to this user about new messages in this conversation (server updates only).';

DROP FUNCTION IF EXISTS public.get_my_conversations();

CREATE OR REPLACE FUNCTION public.get_my_conversations()
RETURNS TABLE (
  conversation_id uuid,
  last_message_at timestamptz,
  other_user_id uuid,
  other_user_name text,
  other_user_email text,
  last_message_content text,
  last_message_type text,
  last_message_sender_id uuid,
  last_message_created_at timestamptz,
  unread_count bigint,
  my_email_notify_enabled boolean,
  my_email_notify_delay_hours int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_convs AS (
    SELECT
      cp.conversation_id,
      cp.last_read_at,
      cp.email_notify_enabled,
      cp.email_notify_delay_hours
    FROM chat_participants cp
    WHERE cp.user_id = auth.uid()
  ),
  other_participants AS (
    SELECT
      mc.conversation_id,
      mc.last_read_at,
      mc.email_notify_enabled,
      mc.email_notify_delay_hours,
      cp2.user_id AS other_user_id
    FROM my_convs mc
    JOIN chat_participants cp2 ON cp2.conversation_id = mc.conversation_id
    WHERE cp2.user_id != auth.uid()
  ),
  last_msgs AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id,
      m.content,
      m.message_type,
      m.sender_id,
      m.created_at
    FROM chat_messages m
    JOIN my_convs mc ON mc.conversation_id = m.conversation_id
    ORDER BY m.conversation_id, m.created_at DESC
  ),
  unread AS (
    SELECT
      m.conversation_id,
      COUNT(*) AS cnt
    FROM chat_messages m
    JOIN my_convs mc ON mc.conversation_id = m.conversation_id
    WHERE m.sender_id != auth.uid()
      AND m.created_at > COALESCE(mc.last_read_at, '1970-01-01'::timestamptz)
    GROUP BY m.conversation_id
  ),
  student_info AS (
    SELECT DISTINCT ON (s.linked_user_id)
      s.linked_user_id,
      s.full_name,
      s.email
    FROM students s
    ORDER BY s.linked_user_id, s.created_at DESC
  )
  SELECT
    op.conversation_id,
    c.last_message_at,
    op.other_user_id,
    COALESCE(p.full_name, si.full_name, 'Unknown') AS other_user_name,
    COALESCE(p.email, si.email, '') AS other_user_email,
    lm.content AS last_message_content,
    lm.message_type AS last_message_type,
    lm.sender_id AS last_message_sender_id,
    lm.created_at AS last_message_created_at,
    COALESCE(u.cnt, 0) AS unread_count,
    COALESCE(op.email_notify_enabled, true) AS my_email_notify_enabled,
    COALESCE(op.email_notify_delay_hours, 12) AS my_email_notify_delay_hours
  FROM other_participants op
  JOIN chat_conversations c ON c.id = op.conversation_id
  LEFT JOIN profiles p ON p.id = op.other_user_id
  LEFT JOIN student_info si ON si.linked_user_id = op.other_user_id
  LEFT JOIN last_msgs lm ON lm.conversation_id = op.conversation_id
  LEFT JOIN unread u ON u.conversation_id = op.conversation_id
  ORDER BY c.last_message_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_conversations() TO authenticated;
