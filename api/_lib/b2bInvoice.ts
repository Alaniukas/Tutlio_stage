// B2B platform invoice line-item math (pure — unit tested).
// Invoice = monthly platform subscription + payout transfer fees already
// deducted from the agency's funds; amount due = subscription only.

export interface B2bInvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface B2bInvoiceLines {
  lineItems: B2bInvoiceLineItem[];
  totalAmount: number;
  deductedAmount: number;
  amountDue: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const LT_MONTHS = [
  'sausis', 'vasaris', 'kovas', 'balandis', 'gegužė', 'birželis',
  'liepa', 'rugpjūtis', 'rugsėjis', 'spalis', 'lapkritis', 'gruodis',
];

/** "2026-05" -> "2026 m. gegužė" */
export function lithuanianMonthLabel(month: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(String(month || '').trim());
  if (!m) return month;
  const idx = Number(m[2]) - 1;
  return idx >= 0 && idx < 12 ? `${m[1]} m. ${LT_MONTHS[idx]}` : month;
}

/**
 * Builds the invoice lines for one agency month.
 * Payout fees are grouped by amount (the fee setting can change mid-month).
 */
export function buildB2bInvoiceLines(params: {
  month: string;
  subscriptionEur: number;
  payoutFees: number[];
}): B2bInvoiceLines {
  const subscription = round2(Number(params.subscriptionEur) || 0);
  const monthLabel = lithuanianMonthLabel(params.month);

  const lineItems: B2bInvoiceLineItem[] = [
    {
      description: `Tutlio platformos abonementas (${monthLabel})`,
      quantity: 1,
      unitPrice: subscription,
      totalPrice: subscription,
    },
  ];

  const byAmount = new Map<number, number>();
  for (const raw of params.payoutFees) {
    const fee = round2(Number(raw) || 0);
    if (fee <= 0) continue;
    byAmount.set(fee, (byAmount.get(fee) || 0) + 1);
  }

  let feesTotal = 0;
  for (const [fee, count] of [...byAmount.entries()].sort((a, b) => a[0] - b[0])) {
    const total = round2(fee * count);
    feesTotal = round2(feesTotal + total);
    lineItems.push({
      description: `Išmokėjimų pavedimų mokesčiai (${count} vnt.)`,
      quantity: count,
      unitPrice: fee,
      totalPrice: total,
    });
  }

  const totalAmount = round2(subscription + feesTotal);
  return {
    lineItems,
    totalAmount,
    // Payout fees were already taken out of the agency's payouts.
    deductedAmount: feesTotal,
    amountDue: subscription,
  };
}
