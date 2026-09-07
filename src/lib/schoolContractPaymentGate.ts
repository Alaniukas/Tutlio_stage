/** Same logic as api/_lib/schoolContractPaymentGate.ts — frontend copy for Vite. */

export function schoolContractAllowsInstallmentPayment(
  signingStatus: string | null | undefined,
): boolean {
  return signingStatus === 'signed';
}
