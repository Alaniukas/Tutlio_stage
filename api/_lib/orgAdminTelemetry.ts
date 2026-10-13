import { createHash, timingSafeEqual } from 'node:crypto';
import type { VercelRequest } from '../types.js';
import { getPlatformAdminSecret } from './adminSecret.js';
import { getSupportServiceClient } from './supportPersistence.js';
import type { TelemetryBatch } from '../../src/lib/orgAdminTelemetryShared.js';

export function isTelemetryPlatformAdmin(req: VercelRequest): boolean {
  const expected = getPlatformAdminSecret();
  const actual = req.headers['x-admin-secret'];
  if (!expected || typeof actual !== 'string') return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function telemetryRpcArgs(batch: TelemetryBatch, organizationId: string, userId: string, loginAt: string | null = null) {
  return {
    p_organization_id: organizationId, p_user_id: userId, p_client_id: batch.clientId, p_sequence: batch.sequence,
    p_active_at: batch.activeAt, p_last_module: batch.lastModule, p_last_action: batch.lastAction,
    p_modules: batch.modules, p_actions: batch.actions, p_release: batch.release, p_login_at: loginAt,
    p_errors: batch.errors.map(error => ({ ...error,
      fingerprint: createHash('sha256').update(JSON.stringify([
        error.kind, error.module, error.code, error.endpoint, error.operation || '',
        error.frames?.[0]?.replace(/-[a-zA-Z0-9_-]{6,}\.js/, '.js') || '',
      ])).digest('hex'),
    })),
  };
}
export { getSupportServiceClient as getTelemetryServiceClient };
