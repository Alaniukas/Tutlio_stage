import type { SupabaseClient } from '@supabase/supabase-js';
import { pollAndAdvance, type ReturnResult } from './schoolContractSigning.js';

const DEFAULT_BATCH_SIZE = 12;
const DEFAULT_CONCURRENCY = 4;

type PendingSignature = {
  id: string;
  token: string;
  role: string;
};

export type ReconciledSignature = {
  id: string;
  role: string;
  status: ReturnResult['status'] | 'failed';
  done?: boolean;
  error?: string;
};

export type ReconcileSigningResult = {
  scanned: number;
  signed: number;
  inProgress: number;
  canceled: number;
  failed: number;
  results: ReconciledSignature[];
};

type AdvanceSignature = (
  supabase: SupabaseClient,
  token: string,
  appOrigin: string,
) => Promise<ReturnResult>;

/**
 * Server-side GoSign reconciliation. This is intentionally independent of the
 * browser response URL: once a transaction exists, GoSign's SigningResult API
 * is the source of truth and can return the signed PDF without another click.
 */
export async function reconcileInProgressContractSignatures(
  supabase: SupabaseClient,
  appOrigin: string,
  options: {
    limit?: number;
    concurrency?: number;
    advance?: AdvanceSignature;
  } = {},
): Promise<ReconcileSigningResult> {
  const limit = Math.max(1, Math.min(50, options.limit ?? DEFAULT_BATCH_SIZE));
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? DEFAULT_CONCURRENCY));
  const advance: AdvanceSignature = options.advance ?? ((client, token, origin) =>
    pollAndAdvance(client, token, origin, { attempts: 1, delayMs: 0 }));

  const { data, error } = await supabase
    .from('school_contract_signatures')
    .select('id, token, role')
    .eq('status', 'in_progress')
    .not('gosign_transaction_id', 'is', null)
    .not('token', 'is', null)
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Could not load in-progress contract signatures: ${error.message}`);
  const rows = (data || []) as PendingSignature[];
  const results: ReconciledSignature[] = [];

  for (let offset = 0; offset < rows.length; offset += concurrency) {
    const chunk = rows.slice(offset, offset + concurrency);
    const settled = await Promise.all(chunk.map(async (row): Promise<ReconciledSignature> => {
      try {
        const result = await advance(supabase, row.token, appOrigin);
        return { id: row.id, role: row.role, status: result.status, done: result.done };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[school-contract-sign-reconcile] signature failed:', row.id, message);
        return { id: row.id, role: row.role, status: 'failed', error: message };
      }
    }));
    results.push(...settled);
  }

  return {
    scanned: rows.length,
    signed: results.filter((item) => item.status === 'signed').length,
    inProgress: results.filter((item) => item.status === 'in_progress' || item.status === 'pending').length,
    canceled: results.filter((item) => item.status === 'canceled').length,
    failed: results.filter((item) => item.status === 'failed').length,
    results,
  };
}
