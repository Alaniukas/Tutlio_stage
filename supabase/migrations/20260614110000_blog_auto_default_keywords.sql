-- Default SEO keywords for Tutlio auto blog (insert only when queue is empty).

INSERT INTO public.blog_auto_keywords (keyword, tag, enabled, sort_order)
SELECT keyword, tag, enabled, sort_order
FROM (
  VALUES
    ('korepetitoriaus platforma', 'Platforma', true, 0),
    ('online pamokų organizavimas', 'Pamokos', true, 1),
    ('mokinių valdymas korepetitoriams', 'Platforma', true, 2),
    ('pamokų tvarkaraštis ir planavimas', 'Produktyvumas', true, 3),
    ('tėvų ir korepetitorių bendravimas', 'Bendravimas', true, 4),
    ('online mokymosi įrankiai', 'Įrankiai', true, 5),
    ('mokėjimų valdymas korepetitoriams', 'Verslas', true, 6),
    ('korepetitoriaus verslo augimas', 'Verslas', true, 7),
    ('interaktyvi balta lenta pamokoms', 'Įrankiai', true, 8),
    ('grupinių pamokų planavimas', 'Pamokos', true, 9)
) AS defaults(keyword, tag, enabled, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.blog_auto_keywords LIMIT 1);
