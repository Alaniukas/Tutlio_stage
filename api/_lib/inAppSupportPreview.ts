import type { VercelRequest } from '../types.js';

export const LOCAL_IN_APP_SUPPORT_PREVIEW_USER_ID = 'local-support-agent-preview';

/**
 * Lets the local-only preview exercise the real upload, persistence, and email path.
 * Both production and Vercel preview deployments run with NODE_ENV=production, so
 * the header can never bypass authentication outside local development.
 */
export function isLocalInAppSupportPreview(req: VercelRequest): boolean {
  const header = Array.isArray(req.headers['x-in-app-support-preview'])
    ? req.headers['x-in-app-support-preview'][0]
    : req.headers['x-in-app-support-preview'];
  return header === '1'
    && process.env.NODE_ENV !== 'production'
    && process.env.VERCEL_ENV !== 'production';
}
