-- Improve Supabase Realtime delivery for filtered postgres_changes on chat_messages.
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
