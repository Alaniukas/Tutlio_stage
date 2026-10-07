import { isExtraLessonsContractKind } from './extraLessonsContract.js';

type OrderSnapshot = {
  start_date?: string | null;
  end_date?: string | null;
} | null | undefined;

export function contractServiceStartDate(contract: {
  kind?: string | null;
  order_snapshot?: OrderSnapshot;
}): string | null {
  if (!isExtraLessonsContractKind(contract.kind)) return null;
  const raw = contract.order_snapshot?.start_date;
  const ymd = String(raw || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

export function contractServiceEndDate(contract: {
  kind?: string | null;
  order_snapshot?: OrderSnapshot;
}): string | null {
  if (!isExtraLessonsContractKind(contract.kind)) return null;
  const raw = contract.order_snapshot?.end_date;
  const ymd = String(raw || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

export function formatContractValidityLabel(
  start: string | null,
  end: string | null,
  formatDate: (ymd: string) => string,
): string | null {
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  if (start) return formatDate(start);
  return null;
}
