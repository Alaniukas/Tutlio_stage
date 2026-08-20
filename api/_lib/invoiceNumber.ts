import type { SupabaseClient } from '@supabase/supabase-js';

export function formatStoredInvoiceNumber(series: string, num: number): string {
  const s = (series || 'SF').trim().toUpperCase() || 'SF';
  const n = Math.max(1, Math.floor(Number(num) || 1));
  if (s === 'MK' || n >= 1000) return `${s}-${n}`;
  return `${s}-${String(n).padStart(3, '0')}`;
}

/** MK-1629 → "Serija MK Nr. 1629" */
export function formatInvoiceSeriesHeading(storedNumber: string): string {
  const m = String(storedNumber || '').trim().match(/^([A-Za-zĀ-ž]+)-0*(\d+)$/i);
  if (m) return `Serija ${m[1].toUpperCase()} Nr. ${parseInt(m[2], 10)}`;
  return `Nr. ${storedNumber}`;
}

export async function allocateInvoiceNumber(
  supabase: SupabaseClient,
  invoiceProfileId: string,
): Promise<string> {
  if (invoiceProfileId.startsWith('fallback-')) {
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    return `SF-${ts}`;
  }

  const { data, error } = await supabase.rpc('allocate_invoice_number', {
    p_profile_id: invoiceProfileId,
  });

  if (error) throw new Error(error.message);

  const row = Array.isArray(data) ? data[0] : data;
  const series = (row?.invoice_series as string) || 'SF';
  const num = Number(row?.allocated_number);
  if (!Number.isFinite(num) || num < 1) {
    throw new Error('Failed to allocate invoice number');
  }
  return formatStoredInvoiceNumber(series, num);
}
