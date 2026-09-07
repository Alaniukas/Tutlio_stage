import type { VercelRequest } from '../types.js';
import { publicOriginFromRequest } from './public-origin.js';

export type TutlioMarket = 'pl' | 'default';

export function marketFromHost(host: string): TutlioMarket {
  const h = host.toLowerCase().replace(/^www\./, '');
  if (h === 'tutlio.pl' || h.endsWith('.tutlio.pl')) return 'pl';
  return 'default';
}

export function marketFromRequest(req: VercelRequest): TutlioMarket {
  try {
    const host = new URL(publicOriginFromRequest(req)).hostname;
    return marketFromHost(host);
  } catch {
    const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || '';
    try {
      return marketFromHost(new URL(appUrl).hostname);
    } catch {
      return 'default';
    }
  }
}

export function isPlMarketRequest(req: VercelRequest): boolean {
  return marketFromRequest(req) === 'pl';
}
