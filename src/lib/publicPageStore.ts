/**
 * Client for the owner side of the public page.
 *
 * Backed by /api/public-page-admin — the localStorage prototype seam is gone.
 * The one thing still kept in localStorage is a revision counter used purely to
 * tell the editor's preview iframe (a separate document) that it should refetch.
 *
 * Image handling stays client-side on purpose: downscale and re-encode before
 * upload so we never ship a 12 MP phone photo, and so the canvas round-trip
 * strips EXIF (including GPS) from a picture destined for the open web.
 */

import { authHeaders } from './apiHelpers';
import type {
  BackdropTheme, PublicPageDerived, PublicPageRow, PublicPageSocials,
} from './publicPage';

/** The subset an owner can edit. Everything else is derived or comes from lessons. */
export interface PublicPageDraft {
  slug?: string;
  displayName?: string;
  headline?: string;
  bio?: string;
  taglineText?: string;
  taglineEmphasis?: string;
  photoUrl?: string | null;
  coverUrl?: string | null;
  city?: string;
  languages?: string[];
  timezone?: string;
  brandColor?: string;
  brandColorSecondary?: string;
  brandColorTertiary?: string;
  accentColor?: string;
  accentTextColor?: string;
  backdropTheme?: BackdropTheme;
  socials?: PublicPageSocials;
  published?: boolean;
  bookingEnabled?: boolean;
}

export interface PublicPagePayload {
  page: PublicPageRow;
  derived: PublicPageDerived;
}

/** Field-level failures the editor renders inline rather than as a banner. */
export type SaveErrorCode = 'slug-invalid' | 'slug-reserved' | 'slug-taken' | 'unknown';

export interface SaveResult {
  ok: boolean;
  page?: PublicPageRow;
  code?: SaveErrorCode;
}

const ENDPOINT = '/api/public-page-admin';

/** Why the API refused. Drives the explanatory copy in the editor. */
export type LoadErrorCode = 'org-tutor' | 'org-excluded' | 'not-a-tutor' | 'unknown';

export class PublicPageLoadError extends Error {
  constructor(readonly code: LoadErrorCode, readonly forbidden: boolean) {
    super(code);
  }
}

/**
 * Loads the caller's page, creating it on first visit, so the editor never has
 * to render an empty state. Which page that is — a solo tutor's or their
 * organization's — is decided server-side from the session.
 */
export async function loadMyPage(): Promise<PublicPagePayload> {
  const res = await fetch(ENDPOINT, { headers: await authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const code = (body as { error?: string }).error;
    const known: LoadErrorCode[] = ['org-tutor', 'org-excluded', 'not-a-tutor'];
    throw new PublicPageLoadError(
      known.includes(code as LoadErrorCode) ? (code as LoadErrorCode) : 'unknown',
      res.status === 403,
    );
  }
  return res.json() as Promise<PublicPagePayload>;
}

export async function savePage(patch: PublicPageDraft): Promise<SaveResult> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify(patch),
    });
  } catch {
    return { ok: false, code: 'unknown' };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const code = (body as { error?: string }).error;
    const known: SaveErrorCode[] = ['slug-invalid', 'slug-reserved', 'slug-taken'];
    return { ok: false, code: known.includes(code as SaveErrorCode) ? (code as SaveErrorCode) : 'unknown' };
  }

  const { page } = (await res.json()) as { page: PublicPageRow };
  notifyPreview();
  return { ok: true, page };
}

export function setPublished(published: boolean): Promise<SaveResult> {
  return savePage({ published });
}

/** Uploads a processed image and returns its public URL. */
export async function uploadImage(file: File, kind: ImageKind): Promise<string> {
  const dataUrl = await processImage(file, kind);
  const [meta, base64] = dataUrl.split(',');
  const contentType = /data:([^;]+)/.exec(meta ?? '')?.[1] ?? 'image/jpeg';

  const res = await fetch(`${ENDPOINT}?action=image`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ base64, contentType, kind }),
  });
  if (!res.ok) throw new Error('upload-failed');
  const { url } = (await res.json()) as { url: string };
  return url;
}

/* ---------------------------------------------------------------- */
/* Preview sync                                                     */
/* ---------------------------------------------------------------- */

const REV_KEY = 'tutlio.publicPageRev';

/**
 * Bumps a localStorage counter after every save. `storage` only fires in *other*
 * documents, which is exactly what we want: the editor's preview iframe hears
 * it and refetches, while the editor itself already has the new state.
 */
export function notifyPreview(): void {
  try {
    localStorage.setItem(REV_KEY, String(Date.now()));
  } catch {
    // Private mode / quota. The preview just won't auto-refresh.
  }
}

export function subscribeToPreview(onChange: () => void): () => void {
  const handler = (e: StorageEvent) => { if (e.key === REV_KEY) onChange(); };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

/* ---------------------------------------------------------------- */
/* Image intake                                                     */
/* ---------------------------------------------------------------- */

/** Raster only — SVG can carry script and these are shown to anonymous visitors. */
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_INPUT_BYTES = 8 * 1024 * 1024;

export type ImageKind = 'avatar' | 'cover';

const TARGET: Record<ImageKind, { maxEdge: number; quality: number }> = {
  avatar: { maxEdge: 320, quality: 0.85 },
  cover: { maxEdge: 1400, quality: 0.78 },
};

/**
 * Downscale + re-encode to a data URL. Re-encoding through a canvas also strips
 * EXIF (including GPS), which matters for a photo published to the open web.
 */
export function processImage(file: File, kind: ImageKind): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      reject(new Error('unsupported-type'));
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      reject(new Error('too-large'));
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { maxEdge, quality } = TARGET[kind];
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas-unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode-failed'));
    };
    img.src = url;
  });
}

/* ---------------------------------------------------------------- */
/* Theme presets                                                    */
/* ---------------------------------------------------------------- */

export interface BrandPreset {
  id: string;
  label: string;
  brandColor: string;
  brandColorSecondary: string;
  brandColorTertiary: string;
  accentColor: string;
  accentTextColor: string;
}

/**
 * Presets rather than free hex pickers: every combination here is checked for
 * legible contrast, so an owner cannot ship an unreadable page.
 */
export const BRAND_PRESETS: BrandPreset[] = [
  { id: 'violet', label: 'Violetinė', brandColor: '#3b1e6e', brandColorSecondary: '#8b5cf6', brandColorTertiary: '#f0a884', accentColor: '#d9f08f', accentTextColor: '#26331a' },
  { id: 'ocean', label: 'Jūros', brandColor: '#0f3b5c', brandColorSecondary: '#3b9fd4', brandColorTertiary: '#8fd4c8', accentColor: '#bde8ff', accentTextColor: '#0d3247' },
  { id: 'rose', label: 'Rožinė', brandColor: '#7a1435', brandColorSecondary: '#d9557f', brandColorTertiary: '#f6b48f', accentColor: '#ffd9e2', accentTextColor: '#4a0f22' },
  { id: 'forest', label: 'Miško', brandColor: '#14432c', brandColorSecondary: '#3f8f63', brandColorTertiary: '#c8d98f', accentColor: '#d8f0b8', accentTextColor: '#1c3d13' },
  { id: 'amber', label: 'Gintaro', brandColor: '#6b3410', brandColorSecondary: '#d98a3b', brandColorTertiary: '#f2c98f', accentColor: '#ffe2a8', accentTextColor: '#4a2708' },
  { id: 'slate', label: 'Grafito', brandColor: '#1f2937', brandColorSecondary: '#64748b', brandColorTertiary: '#cbd5e1', accentColor: '#e2e8f0', accentTextColor: '#1f2937' },
];

export const BACKDROP_THEMES: { id: BackdropTheme; label: string }[] = [
  { id: 'math', label: 'Matematika' },
  { id: 'language', label: 'Kalbos' },
  { id: 'music', label: 'Muzika' },
  { id: 'plain', label: 'Be rašto' },
];

export const SOCIAL_FIELDS: { key: keyof PublicPageSocials; label: string }[] = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'x', label: 'X' },
];
