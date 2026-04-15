/**
 * Platform admin API secret — SERVER ONLY.
 * Use ADMIN_SECRET (not VITE_*). VITE_ADMIN_SECRET is kept only for migration from old deploys.
 */
export function getPlatformAdminSecret(): string {
  const s = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET;
  return (s && String(s).trim()) || '';
}
