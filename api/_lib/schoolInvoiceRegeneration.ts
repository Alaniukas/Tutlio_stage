import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InvoiceRegeneration } from '../../src/lib/invoiceRegeneration.js';

export function regenerationToken(invoices: any[], scope: string): string {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(JSON.stringify([scope, [...invoices].sort((a, b) => a.id.localeCompare(b.id))]))
    .digest('hex');
}

export function regenerationMatches(confirmed: InvoiceRegeneration | undefined, expected: InvoiceRegeneration): boolean {
  const ids = [...new Set(confirmed?.invoiceIds || [])].sort();
  const expectedIds = [...expected.invoiceIds].sort();
  const a = Buffer.from(confirmed?.token || '');
  const b = Buffer.from(expected.token || '');
  return JSON.stringify(ids) === JSON.stringify(expectedIds) && a.length === b.length && timingSafeEqual(a, b);
}

/** Cancellation, new invoice and its sources commit together or all roll back. */
export async function replaceSchoolInvoices(db: SupabaseClient, kind: 'tutor' | 'payer',
  organizationId: string, tutorId: string | null, previous: any[], invoice: any, lines: any[]) {
  const { data, error } = await db.rpc('replace_school_invoices', {
    p_kind: kind, p_organization_id: organizationId, p_tutor_id: tutorId,
    p_previous: previous, p_invoice: invoice, p_lines: lines,
  });
  if (error) throw new Error(error.code === 'PGRST202'
    ? 'Sąskaitų pergeneravimui pirmiausia reikia pritaikyti duomenų bazės migraciją.' : error.message);
  if (!data?.id) throw new Error('Nepavyko pergeneruoti sąskaitos. Atnaujinkite peržiūrą.');
  return data;
}
