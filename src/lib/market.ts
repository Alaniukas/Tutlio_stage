/** tutlio.pl vs tutlio.lt / tutlio.com — same app, market-specific pricing & copy. */
export type TutlioMarket = 'pl' | 'default';

export function marketFromHost(host: string): TutlioMarket {
  const h = host.toLowerCase().replace(/^www\./, '');
  if (h === 'tutlio.pl' || h.endsWith('.tutlio.pl')) return 'pl';
  return 'default';
}

export function currentMarket(): TutlioMarket {
  if (typeof window === 'undefined') return 'default';
  return marketFromHost(window.location.hostname);
}

export function isPlMarket(): boolean {
  return currentMarket() === 'pl';
}
