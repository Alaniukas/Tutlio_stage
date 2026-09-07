-- Auto-blog: persist in-progress multi-locale generation and slower cadence.

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS generation_status text,
  ADD COLUMN IF NOT EXISTS generation_brief text;

COMMENT ON COLUMN public.blog_posts.generation_status IS 'in_progress | complete — auto-blog locale fill';
COMMENT ON COLUMN public.blog_posts.generation_brief IS 'JSON editorial brief shared across locale generations';

UPDATE public.blog_auto_settings
SET interval_days = 3, updated_at = now()
WHERE interval_days < 3;

ALTER TABLE public.blog_auto_settings
  ALTER COLUMN interval_days SET DEFAULT 3;

-- Product-pitch keywords → off. Education topics stay in the rotation.
UPDATE public.blog_auto_keywords
SET enabled = false
WHERE lower(keyword) IN (
  'korepetitoriaus platforma',
  'mokinių valdymas korepetitoriams',
  'mokėjimų valdymas korepetitoriams',
  'interaktyvi balta lenta pamokoms',
  'korepetitoriaus verslo augimas'
);

INSERT INTO public.blog_auto_keywords (keyword, tag, enabled, sort_order)
SELECT d.keyword, d.tag, true, d.sort_order
FROM (
  VALUES
    ('when a child needs a private tutor', 'Parents', 40),
    ('how to prepare for school-leaving exams without burnout', 'Exams', 41),
    ('study techniques that still work for teenagers', 'Learning', 42),
    ('how parents should talk to a struggling student', 'Parents', 43),
    ('online tutoring versus in-person lessons', 'Tutoring', 44),
    ('how independent tutors should set lesson prices', 'Tutors', 45),
    ('homework help without doing the work for the child', 'Parents', 46),
    ('phones, focus, and homework after school', 'Learning', 47),
    ('how to choose a maths tutor', 'Subjects', 48),
    ('learning a foreign language for school, not just apps', 'Subjects', 49),
    ('exam stress: what actually helps the week before', 'Exams', 50),
    ('summer learning without a packed timetable', 'Learning', 51),
    ('admin work that quietly eats a tutoring business', 'Tutors', 52),
    ('group tutoring versus one-to-one', 'Tutoring', 53),
    ('how to tell if tutoring is working after six weeks', 'Parents', 54),
    ('how to run a first tutoring lesson', 'Tutors', 55),
    ('when a child refuses to study', 'Parents', 56),
    ('tutoring for university entrance exams', 'Exams', 57),
    ('missed lessons and fair makeup rules', 'Tutors', 58),
    ('how tutors should communicate with parents', 'Tutors', 59),
    ('reading comprehension practice at home', 'Learning', 60),
    ('how schools and private tutors can cooperate', 'Education', 61),
    ('what to do after a failed mock exam', 'Exams', 62),
    ('building a weekly study plan that students keep', 'Learning', 63)
) AS d(keyword, tag, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.blog_auto_keywords k
  WHERE lower(k.keyword) = lower(d.keyword)
);
