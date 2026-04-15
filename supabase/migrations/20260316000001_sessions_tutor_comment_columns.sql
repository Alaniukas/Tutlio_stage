-- Add tutor comment columns to sessions (korepetitoriaus komentaras mokiniui ir ar rodyti mokiniui)
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS tutor_comment text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS show_comment_to_student boolean DEFAULT false;
