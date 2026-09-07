/** Poland market — display amounts in PLN (zł). */
export function formatPln(
  amount: number | string | null | undefined,
  opts?: { decimals?: number; suffix?: boolean },
): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  const decimals = opts?.decimals ?? 2;
  const formatted = n.toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (opts?.suffix === false) return formatted;
  return `${formatted}\u00a0zł`;
}
