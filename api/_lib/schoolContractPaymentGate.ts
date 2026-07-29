/** Terminal state: both parties signed — installment payments may proceed. */
export function schoolContractAllowsInstallmentPayment(
  signingStatus: string | null | undefined,
): boolean {
  return signingStatus === 'signed';
}

export const SCHOOL_INSTALLMENT_PAYMENT_BLOCKED_LT =
  'Mokėjimas galimas tik po pilnai pasirašytos sutarties. Jei kiltų klausimų, kreipkitės į mokyklą.';
