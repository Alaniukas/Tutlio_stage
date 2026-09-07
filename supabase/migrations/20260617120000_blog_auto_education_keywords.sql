-- Broaden the auto-blog topic queue beyond platform/management toward general
-- education: studying, motivation, exams, school subjects, parents and the tutoring
-- craft. Added idempotently (skips any keyword already present, case-insensitive) so
-- it is safe to re-run and never duplicates admin-curated keywords.

INSERT INTO public.blog_auto_keywords (keyword, tag, enabled, sort_order)
SELECT d.keyword, d.tag, true, d.sort_order
FROM (
  VALUES
    ('kaip efektyviai mokytis', 'Mokymasis', 11),
    ('mokymosi technikos ir metodai', 'Mokymasis', 12),
    ('koncentracijos gerinimas mokantis', 'Mokymasis', 13),
    ('mokymosi motyvacija', 'Motyvacija', 14),
    ('kaip įveikti egzaminų stresą', 'Motyvacija', 15),
    ('pasiruošimas brandos egzaminams', 'Egzaminai', 16),
    ('kaip pasiruošti matematikos egzaminui', 'Egzaminai', 17),
    ('kaip išmokti matematiką', 'Dalykai', 18),
    ('anglų kalbos mokymasis', 'Dalykai', 19),
    ('kaip greičiau išmokti užsienio kalbą', 'Dalykai', 20),
    ('kaip pagerinti rašymo įgūdžius', 'Dalykai', 21),
    ('kaip padėti vaikui mokytis', 'Tėvams', 22),
    ('kaip motyvuoti vaiką mokytis', 'Tėvams', 23),
    ('kada vaikui reikia korepetitoriaus', 'Tėvams', 24),
    ('kaip tapti korepetitoriumi', 'Korepetitoriams', 25),
    ('kaip vesti įdomias pamokas', 'Korepetitoriams', 26),
    ('online korepeticijos privalumai', 'Švietimas', 27),
    ('dirbtinis intelektas mokymesi', 'Švietimas', 28)
) AS d(keyword, tag, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.blog_auto_keywords k
  WHERE lower(k.keyword) = lower(d.keyword)
);
