/**
 * Shape of a `public_pages` row as the endpoints read it.
 *
 * Declared explicitly because both endpoints build their column list by string
 * concatenation, which defeats supabase-js's literal-type inference and would
 * otherwise leave `data` typed as GenericStringError. Mirrors PublicPageRow in
 * src/lib/publicPage.ts — the browser-side counterpart.
 */

export interface PublicPageRow {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  slug: string;
  owner_type: 'tutor' | 'organization';
  locale: string;
  display_name: string;
  headline: string;
  bio: string;
  tagline_text: string | null;
  tagline_emphasis: string | null;
  photo_url: string | null;
  cover_url: string | null;
  city: string | null;
  languages: string[] | null;
  timezone: string;
  brand_color: string;
  brand_color_secondary: string;
  brand_color_tertiary: string;
  accent_color: string;
  accent_text_color: string;
  backdrop_theme: string;
  socials: Record<string, string> | null;
  published: boolean;
  booking_enabled: boolean;
}
