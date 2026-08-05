-- Public tutor/organization landing pages ("vizitinė kortelė").
--
-- Replaces the localStorage prototype seam in src/lib/publicPageStore.ts. One
-- row per owner (a solo tutor profile OR an organization), addressed by a
-- globally unique slug served at /korepetitorius/<slug> on tutlio.lt and
-- /tutor/<slug> on tutlio.com / tutlio.pl.
--
-- Unpublished rows are invisible to anonymous readers: the owner previews them
-- through the authenticated admin endpoint, never through the public one.

CREATE TABLE IF NOT EXISTS public.public_pages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id       uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug                  text NOT NULL,
  owner_type            text NOT NULL CHECK (owner_type IN ('tutor', 'organization')),
  locale                text NOT NULL DEFAULT 'lt',

  display_name          text NOT NULL DEFAULT '',
  headline              text NOT NULL DEFAULT '',
  bio                   text NOT NULL DEFAULT '',
  tagline_text          text,
  tagline_emphasis      text,

  photo_url             text,
  cover_url             text,

  city                  text,
  languages             text[] NOT NULL DEFAULT ARRAY[]::text[],
  timezone              text NOT NULL DEFAULT 'Europe/Vilnius',

  brand_color           text NOT NULL DEFAULT '#3b1e6e',
  brand_color_secondary text NOT NULL DEFAULT '#8b5cf6',
  brand_color_tertiary  text NOT NULL DEFAULT '#f0a884',
  accent_color          text NOT NULL DEFAULT '#d9f08f',
  accent_text_color     text NOT NULL DEFAULT '#26331a',
  backdrop_theme        text NOT NULL DEFAULT 'plain'
                          CHECK (backdrop_theme IN ('math', 'language', 'music', 'plain')),

  socials               jsonb NOT NULL DEFAULT '{}'::jsonb,

  published             boolean NOT NULL DEFAULT false,
  published_at          timestamptz,
  -- Owner switch for the enquiry CTA. Off = the page is a pure business card.
  booking_enabled       boolean NOT NULL DEFAULT true,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT public_pages_one_owner CHECK (
    (user_id IS NOT NULL AND organization_id IS NULL) OR
    (user_id IS NULL AND organization_id IS NOT NULL)
  ),
  -- Mirrors isValidSlug() in src/lib/publicPage.ts. Enforced here too so a
  -- direct service-role write cannot create an unreachable URL.
  CONSTRAINT public_pages_slug_shape CHECK (
    slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 80
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS public_pages_slug_uniq
  ON public.public_pages (slug);

-- One page per owner. Partial so the NULL side of the owner CHECK never collides.
CREATE UNIQUE INDEX IF NOT EXISTS public_pages_user_uniq
  ON public.public_pages (user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS public_pages_org_uniq
  ON public.public_pages (organization_id) WHERE organization_id IS NOT NULL;

-- The public reader only ever looks up published rows.
CREATE INDEX IF NOT EXISTS public_pages_published_idx
  ON public.public_pages (slug) WHERE published;

COMMENT ON TABLE public.public_pages IS
  'Owner-editable public landing page. Offerings, free slots and ratings are NOT stored here — they are derived at read time from subjects/availability/sessions.';
COMMENT ON COLUMN public.public_pages.published IS
  'Go-live switch. False = 404 for anonymous visitors, still previewable by the owner.';

/* ------------------------------------------------------------------ */
/* updated_at                                                          */
/* ------------------------------------------------------------------ */

CREATE OR REPLACE FUNCTION public.public_pages_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  -- Stamp the first go-live so we can order "recently published" later.
  IF NEW.published AND (OLD.published IS DISTINCT FROM NEW.published) AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS public_pages_touch_updated_at ON public.public_pages;
CREATE TRIGGER public_pages_touch_updated_at
  BEFORE UPDATE ON public.public_pages
  FOR EACH ROW EXECUTE FUNCTION public.public_pages_touch_updated_at();

/* ------------------------------------------------------------------ */
/* Enquiry leads                                                       */
/* ------------------------------------------------------------------ */

-- The public CTA. Deliberately a lead, not a booking: real booking needs a
-- student account, a payment and a session row, none of which an anonymous
-- visitor has. The tutor gets an email and converts the lead by hand.
CREATE TABLE IF NOT EXISTS public.public_page_leads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_page_id   uuid NOT NULL REFERENCES public.public_pages(id) ON DELETE CASCADE,
  -- Snapshot, not a FK: the subject may be renamed or deleted afterwards.
  subject_id       uuid,
  offering_title   text,
  requested_start  timestamptz,
  name             text NOT NULL,
  email            text NOT NULL,
  phone            text,
  message          text,
  status           text NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'contacted', 'converted', 'archived')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS public_page_leads_page_idx
  ON public.public_page_leads (public_page_id, created_at DESC);

/* ------------------------------------------------------------------ */
/* RLS                                                                 */
/* ------------------------------------------------------------------ */

ALTER TABLE public.public_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_page_leads ENABLE ROW LEVEL SECURITY;

-- Anonymous visitors: published rows only.
DROP POLICY IF EXISTS public_pages_anon_select ON public.public_pages;
CREATE POLICY public_pages_anon_select ON public.public_pages
  FOR SELECT TO anon, authenticated
  USING (published);

DROP POLICY IF EXISTS public_pages_owner_select ON public.public_pages;
CREATE POLICY public_pages_owner_select ON public.public_pages
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_admins oa
      WHERE oa.user_id = auth.uid() AND oa.organization_id = public_pages.organization_id
    )
  );

DROP POLICY IF EXISTS public_pages_owner_insert ON public.public_pages;
CREATE POLICY public_pages_owner_insert ON public.public_pages
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_admins oa
      WHERE oa.user_id = auth.uid() AND oa.organization_id = public_pages.organization_id
    )
  );

DROP POLICY IF EXISTS public_pages_owner_update ON public.public_pages;
CREATE POLICY public_pages_owner_update ON public.public_pages
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_admins oa
      WHERE oa.user_id = auth.uid() AND oa.organization_id = public_pages.organization_id
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_admins oa
      WHERE oa.user_id = auth.uid() AND oa.organization_id = public_pages.organization_id
    )
  );

-- Leads are written by the service role only (the public endpoint), so there is
-- deliberately no INSERT policy: an anonymous client cannot forge them.
DROP POLICY IF EXISTS public_page_leads_owner_select ON public.public_page_leads;
CREATE POLICY public_page_leads_owner_select ON public.public_page_leads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.public_pages p
      WHERE p.id = public_page_leads.public_page_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.organization_admins oa
            WHERE oa.user_id = auth.uid() AND oa.organization_id = p.organization_id
          )
        )
    )
  );

DROP POLICY IF EXISTS public_page_leads_owner_update ON public.public_page_leads;
CREATE POLICY public_page_leads_owner_update ON public.public_page_leads
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.public_pages p
      WHERE p.id = public_page_leads.public_page_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.organization_admins oa
            WHERE oa.user_id = auth.uid() AND oa.organization_id = p.organization_id
          )
        )
    )
  );

/* ------------------------------------------------------------------ */
/* Image storage                                                       */
/* ------------------------------------------------------------------ */

-- Public bucket: these images are rendered into a page served to anonymous
-- visitors, so a signed URL would buy nothing. SVG is excluded on purpose —
-- it can carry script.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'public-pages',
  'public-pages',
  true,
  3145728,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public page images are readable" ON storage.objects;
CREATE POLICY "Public page images are readable" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'public-pages');

-- Uploads go through the API (service role), which namespaces every object
-- under the owner's id. This policy keeps a direct client upload honest too.
DROP POLICY IF EXISTS "Owners manage their public page images" ON storage.objects;
CREATE POLICY "Owners manage their public page images" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'public-pages'
    AND split_part(name, '/', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'public-pages'
    AND split_part(name, '/', 1) = auth.uid()::text
  );
