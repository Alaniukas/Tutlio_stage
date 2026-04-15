-- ============================================================
-- Migration: Chat / Messaging System
-- Tables: chat_conversations, chat_participants, chat_messages
-- Storage: chat-files bucket
-- RPC: get_or_create_conversation
-- ============================================================

-- ─── 1. TABLES ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_participants (
  conversation_id       uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at          timestamptz DEFAULT now(),
  email_notify_enabled  boolean NOT NULL DEFAULT true,
  email_notify_delay_hours int NOT NULL DEFAULT 12,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL,
  content         text,
  message_type    text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'file', 'lesson_proposal')),
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. INDEXES ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON public.chat_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON public.chat_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON public.chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_msg ON public.chat_conversations(last_message_at DESC);

-- ─── 3. RLS ──────────────────────────────────────────────────

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Helper: check if a user is a participant or an org_admin overseeing participants
CREATE OR REPLACE FUNCTION public.can_access_conversation(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Direct participant
    SELECT 1 FROM chat_participants
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
  )
  OR EXISTS (
    -- Org admin whose org contains one of the participants
    SELECT 1 FROM organization_admins oa
    JOIN profiles p ON p.organization_id = oa.organization_id
    JOIN chat_participants cp ON cp.user_id = p.id
    WHERE oa.user_id = auth.uid()
      AND cp.conversation_id = p_conversation_id
  )
  OR EXISTS (
    -- Org admin whose org contains a student (linked_user_id) participant
    SELECT 1 FROM organization_admins oa
    JOIN profiles tutor_p ON tutor_p.organization_id = oa.organization_id
    JOIN students s ON s.tutor_id = tutor_p.id
    JOIN chat_participants cp ON cp.user_id = s.linked_user_id
    WHERE oa.user_id = auth.uid()
      AND cp.conversation_id = p_conversation_id
  );
$$;

-- chat_conversations policies
DROP POLICY IF EXISTS "chat_conv_select" ON public.chat_conversations;
CREATE POLICY "chat_conv_select" ON public.chat_conversations
  FOR SELECT USING (public.can_access_conversation(id));

DROP POLICY IF EXISTS "chat_conv_insert" ON public.chat_conversations;
CREATE POLICY "chat_conv_insert" ON public.chat_conversations
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "chat_conv_update" ON public.chat_conversations;
CREATE POLICY "chat_conv_update" ON public.chat_conversations
  FOR UPDATE USING (public.can_access_conversation(id));

-- chat_participants policies
DROP POLICY IF EXISTS "chat_part_select" ON public.chat_participants;
CREATE POLICY "chat_part_select" ON public.chat_participants
  FOR SELECT USING (public.can_access_conversation(conversation_id));

DROP POLICY IF EXISTS "chat_part_insert" ON public.chat_participants;
CREATE POLICY "chat_part_insert" ON public.chat_participants
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "chat_part_update" ON public.chat_participants;
CREATE POLICY "chat_part_update" ON public.chat_participants
  FOR UPDATE USING (user_id = auth.uid());

-- chat_messages policies
DROP POLICY IF EXISTS "chat_msg_select" ON public.chat_messages;
CREATE POLICY "chat_msg_select" ON public.chat_messages
  FOR SELECT USING (public.can_access_conversation(conversation_id));

DROP POLICY IF EXISTS "chat_msg_update_proposal" ON public.chat_messages;
CREATE POLICY "chat_msg_update_proposal" ON public.chat_messages
  FOR UPDATE
  USING (
    message_type = 'lesson_proposal'
    AND sender_id != auth.uid()
    AND public.can_access_conversation(conversation_id)
  )
  WITH CHECK (
    message_type = 'lesson_proposal'
    AND sender_id != auth.uid()
    AND public.can_access_conversation(conversation_id)
  );

DROP POLICY IF EXISTS "chat_msg_insert" ON public.chat_messages;
CREATE POLICY "chat_msg_insert" ON public.chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND public.can_access_conversation(conversation_id)
  );

-- ─── 4. RPC: get_or_create_conversation ──────────────────────

CREATE OR REPLACE FUNCTION public.get_or_create_conversation(p_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_id uuid := auth.uid();
  v_conv_id uuid;
  v_valid boolean := false;
BEGIN
  IF v_my_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_my_id = p_other_user_id THEN
    RAISE EXCEPTION 'Cannot create conversation with yourself';
  END IF;

  -- Check if conversation already exists between these two users
  SELECT cp1.conversation_id INTO v_conv_id
  FROM chat_participants cp1
  JOIN chat_participants cp2 ON cp2.conversation_id = cp1.conversation_id
  WHERE cp1.user_id = v_my_id AND cp2.user_id = p_other_user_id
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  -- Validate relationship: tutor -> student
  IF EXISTS (
    SELECT 1 FROM students
    WHERE tutor_id = v_my_id AND linked_user_id = p_other_user_id
  ) THEN
    v_valid := true;
  END IF;

  -- Validate relationship: student -> tutor
  IF NOT v_valid AND EXISTS (
    SELECT 1 FROM students
    WHERE linked_user_id = v_my_id AND tutor_id = p_other_user_id
  ) THEN
    v_valid := true;
  END IF;

  -- Validate relationship: org_admin -> org tutor
  IF NOT v_valid AND EXISTS (
    SELECT 1 FROM organization_admins oa
    JOIN profiles p ON p.organization_id = oa.organization_id
    WHERE oa.user_id = v_my_id AND p.id = p_other_user_id
  ) THEN
    v_valid := true;
  END IF;

  -- Validate relationship: org tutor -> org_admin
  IF NOT v_valid AND EXISTS (
    SELECT 1 FROM profiles p
    JOIN organization_admins oa ON oa.organization_id = p.organization_id
    WHERE p.id = v_my_id AND oa.user_id = p_other_user_id
  ) THEN
    v_valid := true;
  END IF;

  -- Validate relationship: org_admin -> student in org
  IF NOT v_valid AND EXISTS (
    SELECT 1 FROM organization_admins oa
    JOIN profiles tutor_p ON tutor_p.organization_id = oa.organization_id
    JOIN students s ON s.tutor_id = tutor_p.id
    WHERE oa.user_id = v_my_id AND s.linked_user_id = p_other_user_id
  ) THEN
    v_valid := true;
  END IF;

  -- Validate relationship: student in org -> org_admin
  IF NOT v_valid AND EXISTS (
    SELECT 1 FROM students s
    JOIN profiles tutor_p ON tutor_p.id = s.tutor_id
    JOIN organization_admins oa ON oa.organization_id = tutor_p.organization_id
    WHERE s.linked_user_id = v_my_id AND oa.user_id = p_other_user_id
  ) THEN
    v_valid := true;
  END IF;

  IF NOT v_valid THEN
    RAISE EXCEPTION 'No valid relationship exists between these users';
  END IF;

  -- Create conversation
  INSERT INTO chat_conversations DEFAULT VALUES
  RETURNING id INTO v_conv_id;

  -- Add both participants
  INSERT INTO chat_participants (conversation_id, user_id) VALUES
    (v_conv_id, v_my_id),
    (v_conv_id, p_other_user_id);

  RETURN v_conv_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated;

-- ─── 5. HELPER: get conversations for current user ──────────

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
  unread_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_convs AS (
    SELECT cp.conversation_id, cp.last_read_at
    FROM chat_participants cp
    WHERE cp.user_id = auth.uid()
  ),
  other_participants AS (
    SELECT
      mc.conversation_id,
      mc.last_read_at,
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
  )
  ,
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
    COALESCE(u.cnt, 0) AS unread_count
  FROM other_participants op
  JOIN chat_conversations c ON c.id = op.conversation_id
  LEFT JOIN profiles p ON p.id = op.other_user_id
  LEFT JOIN student_info si ON si.linked_user_id = op.other_user_id
  LEFT JOIN last_msgs lm ON lm.conversation_id = op.conversation_id
  LEFT JOIN unread u ON u.conversation_id = op.conversation_id
  ORDER BY c.last_message_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_conversations() TO authenticated;

-- ─── 6. STORAGE BUCKET ──────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-files',
  'chat-files',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Chat participants manage files" ON storage.objects;
CREATE POLICY "Chat participants manage files" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'chat-files'
    AND public.can_access_conversation(split_part(name, '/', 1)::uuid)
  )
  WITH CHECK (
    bucket_id = 'chat-files'
    AND public.can_access_conversation(split_part(name, '/', 1)::uuid)
  );

-- ─── 7. GRANTS ───────────────────────────────────────────────

GRANT ALL ON public.chat_conversations TO authenticated, service_role;
GRANT ALL ON public.chat_participants TO authenticated, service_role;
GRANT ALL ON public.chat_messages TO authenticated, service_role;

-- ─── 8. REALTIME ─────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
