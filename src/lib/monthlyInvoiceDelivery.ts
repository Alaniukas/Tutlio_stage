/** A 207 partial response is HTTP-ok but still requires recovery by the admin. */
export function requireMonthlyInvoiceDelivery(result: {
  success?: boolean;
  totalBatches?: number;
  error?: string;
}, fallbackError: string): number {
  if (result.success !== true || !Number.isInteger(result.totalBatches) || Number(result.totalBatches) <= 0) {
    throw new Error(result.error || fallbackError);
  }
  return result.totalBatches as number;
}
