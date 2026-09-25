import { isManoKorepetitoriusOrg } from './marketMoney';
import type { SupabaseClient } from '@supabase/supabase-js';

type EditableSession = {
  status: string;
  start_time: string | Date;
  end_time: string | Date;
  class_group_id?: string | null;
};

/** Organization admins may correct a finished Mano Korepetitorius lesson. */
export function canEditOrgSession(
  session: EditableSession,
  organizationId: string | null | undefined,
  now = new Date(),
  allowClassGroupOccurrence = false,
): boolean {
  if (allowClassGroupOccurrence && session.class_group_id &&
      (session.status === 'active' || session.status === 'completed')) return true;
  if (session.status === 'active' && new Date(session.start_time) > now) return true;
  return isManoKorepetitoriusOrg(organizationId) && (
    session.status === 'completed'
    || (session.status === 'active' && new Date(session.end_time) <= now)
  );
}

export function canEditFutureOrgSeries(session: EditableSession, now = new Date()): boolean {
  return session.status === 'active' && new Date(session.start_time) > now;
}

type PriceEditSession = EditableSession & {
  id: string;
  recurring_session_id?: string | null;
};

/** Check every row whose price the save action will change, including future series rows. */
export async function orgSessionPriceChangingIds(
  sb: SupabaseClient,
  session: PriceEditSession,
  scope: 'single' | 'all_future',
  nextPrice: number,
): Promise<string[]> {
  let query = sb.from('sessions').select('id, price');
  if (session.class_group_id) {
    query = query.eq('class_group_id', session.class_group_id)
      .eq('start_time', new Date(session.start_time).toISOString());
  } else if (scope === 'all_future' && session.recurring_session_id) {
    query = query.eq('recurring_session_id', session.recurring_session_id)
      .gte('start_time', new Date(session.start_time).toISOString());
  } else {
    query = query.eq('id', session.id);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  if (!rows.some((row) => row.id === session.id)) {
    throw new Error('The lesson to edit was not found');
  }
  const changedIds = rows
    .filter((row) => Number(row.price ?? 0) !== nextPrice)
    .map((row) => String(row.id));
  return changedIds;
}

// These notices are shown only in the Mano Korepetitorius admin flow. Keeping
// them local avoids adding MV-specific copy to every supported app locale.
const EDIT_NOTICE = {
  lt: {
    noLongerAllowed: 'Šios pamokos redaguoti nebegalima. Atnaujinkite puslapį.',
    invalidPrice: 'Įveskite neneigiamą pamokos kainą.',
    alreadyInvoiced: 'Šios pamokos kaina jau įtraukta į sąskaitą, todėl jos čia pakeisti negalima.',
    paymentUnchanged: 'Pakeitus pamokos kainą, mokėjimai ir sąskaitos automatiškai nekoreguojami.',
  },
  en: {
    noLongerAllowed: 'This lesson can no longer be edited. Refresh the page.',
    invalidPrice: 'Enter a lesson price that is not negative.',
    alreadyInvoiced: 'This lesson is already included in an invoice, so its price cannot be changed here.',
    paymentUnchanged: 'Changing the lesson price does not adjust payments or invoices automatically.',
  },
  pl: {
    noLongerAllowed: 'Nie można już edytować tej lekcji. Odśwież stronę.',
    invalidPrice: 'Wpisz cenę lekcji, która nie jest ujemna.',
    alreadyInvoiced: 'Ta lekcja jest już na fakturze, więc nie można tutaj zmienić jej ceny.',
    paymentUnchanged: 'Zmiana ceny lekcji nie koryguje automatycznie płatności ani faktur.',
  },
} as const;

export function orgSessionEditNotice(locale: string, key: keyof typeof EDIT_NOTICE.en): string {
  return EDIT_NOTICE[locale === 'lt' || locale === 'pl' ? locale : 'en'][key];
}
