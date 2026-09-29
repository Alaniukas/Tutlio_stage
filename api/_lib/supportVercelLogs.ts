import { getSupportServiceClient } from './supportPersistence.js';

export interface SupportVercelLogEvent {
  project_id: string;
  log_id: string;
  vercel_id: string;
  occurred_at: string;
  level: 'warning' | 'error' | 'fatal';
  source: string;
  method: string | null;
  path: string | null;
  status_code: number | null;
  message: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeId(value: unknown): string | null {
  const id = typeof value === 'string' ? value.trim() : '';
  return /^[a-zA-Z0-9:_-]{1,128}$/.test(id) ? id : null;
}

function safePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let path = value.trim();
  if (/^https?:\/\//i.test(path)) {
    try { path = new URL(path).pathname; } catch { return null; }
  }
  const apiRoute = path.split(/[?#]/, 1)[0].match(/^\/api\/([a-z0-9-]{1,64})(?:\/|$)/);
  // Function names are static; later path segments can contain student IDs or names.
  return apiRoute ? `/api/${apiRoute[1]}` : null;
}

function safeMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const firstLine = value.split(/[\r\n]/, 1)[0].trim();
  // Reject structured dumps and fields that can carry request bodies or secrets.
  if (!firstLine || /[{}\[\]<>=&]|\b(?:body|payload|headers|authorization|cookie|password|secret|token|user-agent)\b\s*[:=]/i.test(firstLine)
    || /\b(?:mozilla|chrome|safari|firefox)\/[\d.]+/i.test(firstLine)) return null;
  const sanitized = firstLine
    .replace(/\?[^\s]*/g, '')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[ip]')
    .replace(/\b[0-9a-f]{1,4}(?::[0-9a-f]{0,4}){2,}\b/gi, '[ip]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\bBearer\s+\S+/gi, '[credential]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[credential]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, 500);
  return sanitized || null;
}

/** Keep only bounded warning/error metadata for this project and request IDs. */
export function parseSupportVercelLogBatch(payload: unknown, projectId: string): SupportVercelLogEvent[] {
  if (!Array.isArray(payload) || payload.length > 10_000) throw new Error('Invalid Vercel log batch.');
  const rows = new Map<string, SupportVercelLogEvent>();
  for (const item of payload) {
    const log = record(item);
    if (!log || log.projectId !== projectId) continue;
    const proxy = record(log.proxy);
    const vercelId = safeId(proxy?.vercelId);
    const logId = safeId(log.id);
    const level = log.level === 'warn' ? 'warning' : log.level;
    if (!vercelId || !logId || !['warning', 'error', 'fatal'].includes(String(level))) continue;
    const timestamp = typeof log.timestamp === 'number' ? log.timestamp : NaN;
    if (!Number.isFinite(timestamp) || timestamp < 1_577_836_800_000 || timestamp > Date.now() + 86_400_000) continue;
    const source = typeof log.source === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(log.source)
      ? log.source : 'unknown';
    const method = typeof proxy?.method === 'string' && /^[A-Z]{1,12}$/.test(proxy.method)
      ? proxy.method : null;
    const rawStatus = proxy?.statusCode ?? log.statusCode;
    const statusCode = typeof rawStatus === 'number' && Number.isInteger(rawStatus) && rawStatus >= 100 && rawStatus <= 599
      ? rawStatus : null;
    const path = safePath(proxy?.path ?? log.path);
    // The drain receives its own delivery requests. Never persist those rows:
    // they add no support context and can feed back into retries on failure.
    if (path === '/api/vercel-support-log-drain') continue;
    rows.set(logId, {
      project_id: projectId,
      log_id: logId,
      vercel_id: vercelId,
      occurred_at: new Date(timestamp).toISOString(),
      level: level as SupportVercelLogEvent['level'],
      source,
      method,
      path,
      status_code: statusCode,
      message: safeMessage(log.message),
    });
  }
  return [...rows.values()];
}

/** Server-only lookup. Call only after checking support/admin authorization. */
export async function getCorrelatedSupportVercelLogs(vercelIds: string[]): Promise<SupportVercelLogEvent[]> {
  const projectId = process.env.VERCEL_PROJECT_ID?.trim();
  if (!projectId) return [];
  const ids = [...new Set(vercelIds.map(safeId).filter((value): value is string => Boolean(value)))].slice(0, 20);
  if (ids.length === 0) return [];
  const db = getSupportServiceClient();
  const { data, error } = await db
    .from('support_vercel_log_events')
    .select('project_id, log_id, vercel_id, occurred_at, level, source, method, path, status_code, message')
    .eq('project_id', projectId)
    .in('vercel_id', ids)
    .order('occurred_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []) as SupportVercelLogEvent[];
}
