import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest } from '../types';
import { convertDocxBufferToPdfWithFallbacks } from './docxConverter.js';
import { sendFirstLessonInvite } from './extraLessonsFirstLessonInvite.js';
import { internalApiOrigin } from './extraLessonsContractShared.js';
import { SCHOOL_CONTRACTS_BUCKET } from './schoolContractPdfPath.js';

export async function getAcceptanceJob(db: SupabaseClient, contractId: string) {
  const { data, error } = await db.from('school_acceptance_jobs')
    .select('id,contract_id,status,attempts,created_at,finalized_at').eq('contract_id', contractId).maybeSingle();
  if (error) throw error;
  return data;
}
export function acceptanceJobStatus(job: any) {
  return { ok: true, contractId: job.contract_id, pending: !job.finalized_at,
    alreadyAccepted: Boolean(job.finalized_at), needsAttention: job.attempts >= 10,
    submittedAt: job.created_at };
}

export function acceptanceRetrySeconds(attempt: number) {
  return Math.min(3600, 30 * 2 ** Math.min(Math.max(0, attempt - 1), 7));
}

/** One leased job per invocation; all work is awaited, never fire-and-forget. */
export async function processAcceptanceJob(db: SupabaseClient, req: VercelRequest, job: any) {
  const stamp = async (values: Record<string, unknown>) => {
    const { data, error } = await db.from('school_acceptance_jobs').update(values)
      .eq('id', job.id).eq('lease_id', job.lease_id).gt('locked_until', new Date().toISOString()).select('id');
    if (error || !data?.length) throw new Error('Acceptance lease lost or state save failed');
  };
  try {
    const p = job.payload;
    if (!job.finalized_at) {
      const source = Buffer.from(p.source.base64, 'base64');
      const pdf = p.source.kind === 'docx' ? await convertDocxBufferToPdfWithFallbacks(source) : source;
      if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid final PDF');
      const hash = createHash('sha256').update(pdf).digest('hex');
      const path = `${job.organization_id}/contracts/${job.contract_id}/accepted-${hash}.pdf`;
      const uploaded = await db.storage.from(SCHOOL_CONTRACTS_BUCKET).upload(path, pdf, { upsert: true, contentType: 'application/pdf' });
      if (uploaded.error) throw uploaded.error;
      const finalized = await db.rpc('finalize_school_acceptance', { p_job_id: job.id, p_lease_id: job.lease_id, p_pdf_path: path });
      if (finalized.error || finalized.data !== true) throw new Error('Acceptance finalization failed or lease expired');
      job.pdf_path = path;
      job.finalized_at = new Date().toISOString();
    }
    if (!job.confirmation_sent) {
      if (p.confirmation.to) {
        const downloaded = await db.storage.from(SCHOOL_CONTRACTS_BUCKET).download(job.pdf_path);
        if (downloaded.error || !downloaded.data) throw new Error('Final PDF unavailable for delivery');
        const response = await fetch(`${internalApiOrigin(req)}/api/send-email`, {
          method: 'POST', signal: AbortSignal.timeout(20000),
          headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
          body: JSON.stringify({ type: 'school_contract_extra_accepted', to: p.confirmation.to,
            idempotencyKey: `school-acceptance/${job.id}/confirmation`,
            data: { ...p.confirmation.data, acceptanceJobId: job.id },
            attachments: [{ filename: `sutartis-${job.contract_id}.pdf`, content: Buffer.from(await downloaded.data.arrayBuffer()).toString('base64') }],
          }),
        });
        if (!response.ok) throw new Error(`Confirmation delivery failed: ${response.status}`);
      }
      await stamp({ confirmation_sent: true });
    }
    if (!job.invite_sent) {
      const invite = await sendFirstLessonInvite(db, req, p.invite, { acceptanceJobId: job.id });
      if (!invite.sent && p.invite.payerEmail) throw new Error(`First lesson invitation failed: ${invite.reason}`);
      await stamp({ invite_sent: true });
    }
    await stamp({ status: 'completed', completed_at: new Date().toISOString(), locked_until: null, lease_id: null, last_error: null });
    return { completed: true };
  } catch (error) {
    const message = String((error as Error).message || 'Acceptance processing failed').slice(0, 500);
    await stamp({ status: 'queued', locked_until: null, lease_id: null, last_error: message,
      available_at: new Date(Date.now() + acceptanceRetrySeconds(job.attempts) * 1000).toISOString() });
    console.error('[school-acceptance-jobs]', { jobId: job.id, attempt: job.attempts, needsAttention: job.attempts >= 10, error: message });
    return { completed: false };
  }
}
