import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '../../src/lib/fetchAllRows.js';
import {
  PRO_KLASE_STUDENT_NO_SHOW_PAY_EUR,
  PRO_KLASE_TRIAL_PAY_EUR,
} from './proKlaseTutorPay.js';

export const PRO_KLASE_TUTOR_PAY_LINE_VERSION = 1;

type Subject = { name?: string | null; is_trial?: boolean | null };
export type ProKlaseInvoiceSession = {
  id: string;
  status: string;
  status_confirmed_at?: string | null;
  subjects?: Subject | Subject[] | null;
};
export type ProKlaseTutorInvoiceLine = {
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sessionIds: string[];
};
export type StoredTutorInvoiceLine = {
  description: string;
  quantity: number;
  unit_price: number | string;
  total_price: number | string;
  session_ids?: string[] | null;
};

export class ProKlaseInvoiceLineError extends Error {
  constructor(public readonly status: 409 | 503, message: string) {
    super(message);
  }
}

function cannotReconstruct(): never {
  throw new ProKlaseInvoiceLineError(409,
    'Nepakanka sutampančių pamokų duomenų sąskaitos tarifams išskaidyti. Kreipkitės į administraciją.');
}

function subject(session: ProKlaseInvoiceSession): Subject | null {
  return Array.isArray(session.subjects) ? session.subjects[0] ?? null : session.subjects ?? null;
}

function payKind(session: ProKlaseInvoiceSession): 'regular' | 'trial' | 'no_show' {
  if (session.status === 'no_show') return 'no_show';
  if (session.status !== 'completed') return cannotReconstruct();
  const isTrial = subject(session)?.is_trial;
  if (typeof isTrial !== 'boolean') return cannotReconstruct();
  return isTrial ? 'trial' : 'regular';
}

function lineDescription(name: string, kind: ReturnType<typeof payKind>): string {
  if (kind === 'no_show') return `Atlygis už mokinio neatvykimą - ${name}`;
  if (kind === 'trial' && name.toLocaleLowerCase('lt-LT') !== 'bandomoji pamoka') {
    return `Bandomoji pamoka - ${name}`;
  }
  return `${name} - korepetavimo paslaugos`;
}

function cents(amount: number | string): number {
  const value = Number(amount);
  if (!Number.isFinite(value)) return cannotReconstruct();
  const result = Math.round(value * 100);
  if (!Number.isSafeInteger(result)) return cannotReconstruct();
  return result;
}

/** A row may contain only one subject, outcome and actual tariff, never an average. */
export function buildProKlaseTutorInvoiceLines(
  sessions: ProKlaseInvoiceSession[],
  lessonPayEur: (session: ProKlaseInvoiceSession) => number,
): ProKlaseTutorInvoiceLine[] {
  const groups = new Map<string, ProKlaseTutorInvoiceLine>();
  const seen = new Set<string>();
  for (const session of sessions) {
    if (!session.id || seen.has(session.id)) return cannotReconstruct();
    seen.add(session.id);
    const name = subject(session)?.name?.trim() || 'Pamoka';
    const kind = payKind(session);
    const unitCents = cents(lessonPayEur(session));
    if (unitCents < 0) return cannotReconstruct();
    const key = JSON.stringify([name, kind, unitCents]);
    let line = groups.get(key);
    if (!line) {
      line = { description: lineDescription(name, kind), quantity: 0,
        unitPrice: unitCents / 100, totalPrice: 0, sessionIds: [] };
      groups.set(key, line);
    }
    line.quantity += 1;
    line.totalPrice = unitCents * line.quantity / 100;
    line.sessionIds.push(session.id);
  }
  return [...groups.values()];
}

function storedLine(line: StoredTutorInvoiceLine): ProKlaseTutorInvoiceLine {
  return { description: line.description, quantity: Number(line.quantity),
    unitPrice: Number(line.unit_price), totalPrice: Number(line.total_price),
    sessionIds: line.session_ids || [] };
}

/** Re-present legacy lines without changing their saved amount or adjustments.
 * Legacy Pro Klasė regular lessons used one rate per invoice; recover that rate
 * from the saved amount after the fixed trial/no-show pay, never today's profile.
 * Missing or changed evidence must not produce a guessed tariff or an old average.
 */
export function splitLegacyProKlaseTutorInvoiceLines(
  lines: StoredTutorInvoiceLine[],
  sessions: ProKlaseInvoiceSession[],
): ProKlaseTutorInvoiceLine[] {
  const byId = new Map(sessions.map(session => [session.id, session]));
  const seen = new Set<string>();
  return lines.flatMap(line => {
    const ids = line.session_ids || [];
    if (!ids.length) return [storedLine(line)]; // Fines and manual corrections stay separate.
    if (ids.length !== Number(line.quantity) || new Set(ids).size !== ids.length) return cannotReconstruct();
    const rows = ids.map(id => {
      const session = byId.get(id);
      if (!session || seen.has(id) || !session.status_confirmed_at?.trim()) return cannotReconstruct();
      seen.add(id);
      return session;
    });
    const savedName = line.description.replace(/ - korepetavimo paslaugos$/, '').trim();
    if (savedName.toLocaleLowerCase('lt-LT') === 'bandomoji pamoka'
      && rows.some(session => session.status === 'completed' && payKind(session) !== 'trial')) return cannotReconstruct();
    const totalCents = cents(line.total_price);
    let fixedCents = 0;
    let regularCount = 0;
    for (const session of rows) {
      const kind = payKind(session);
      if (kind === 'regular') regularCount += 1;
      else fixedCents += cents(kind === 'trial' ? PRO_KLASE_TRIAL_PAY_EUR : PRO_KLASE_STUDENT_NO_SHOW_PAY_EUR);
    }
    const regularCents = regularCount ? (totalCents - fixedCents) / regularCount : 0;
    if (!Number.isSafeInteger(regularCents) || regularCents < 0
      || (!regularCount && fixedCents !== totalCents)) return cannotReconstruct();
    const split = buildProKlaseTutorInvoiceLines(rows.map(session => ({ ...session,
      subjects: { ...subject(session), name: savedName || subject(session)?.name || 'Pamoka' },
    })), session => payKind(session) === 'no_show' ? PRO_KLASE_STUDENT_NO_SHOW_PAY_EUR
      : payKind(session) === 'trial' ? PRO_KLASE_TRIAL_PAY_EUR : regularCents / 100);
    if (split.reduce((sum, item) => sum + cents(item.totalPrice), 0) !== totalCents) return cannotReconstruct();
    return split;
  });
}

export async function proKlaseTutorInvoicePdfLines(
  supabase: SupabaseClient,
  organizationId: string,
  tutorId: string,
  lineVersion: unknown,
  lines: StoredTutorInvoiceLine[],
): Promise<ProKlaseTutorInvoiceLine[]> {
  // Newly issued lines already store their separate tariffs and descriptions.
  if (lineVersion === PRO_KLASE_TUTOR_PAY_LINE_VERSION) return lines.map(storedLine);
  const ids = [...new Set(lines.flatMap(line => line.session_ids || []))];
  const sessions: ProKlaseInvoiceSession[] = [];
  try {
    for (let offset = 0; offset < ids.length; offset += 100) {
      sessions.push(...await fetchAllRows<ProKlaseInvoiceSession>((from, to) => supabase.from('sessions')
        .select('id, status, status_confirmed_at, subjects(name, is_trial), students!inner(organization_id)')
        .eq('tutor_id', tutorId).eq('students.organization_id', organizationId)
        .in('id', ids.slice(offset, offset + 100)).order('id').range(from, to), Infinity));
    }
  } catch {
    throw new ProKlaseInvoiceLineError(503, 'Nepavyko patikrinti sąskaitos pamokų. Bandykite dar kartą.');
  }
  return splitLegacyProKlaseTutorInvoiceLines(lines, sessions);
}
