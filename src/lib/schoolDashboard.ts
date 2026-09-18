export type SchoolDashboardContract = {
  kind?: string | null;
  signing_status?: string | null;
  completion_submitted_at?: string | null;
  accepted_at?: string | null;
  signatures?: Array<{ role?: string | null; status?: string | null }> | null;
};

/** Parent still has to confirm data, sign, or accept an extra-lessons offer. */
export function isSchoolParentConfirmationPending(contract: SchoolDashboardContract): boolean {
  if (contract.kind === 'extra_lessons') {
    return contract.signing_status === 'sent' && !contract.accepted_at;
  }
  if (contract.signing_status === 'sent') return true;
  if (contract.signing_status !== 'signed_by_school') return false;
  return (contract.signatures || []).some(signature => (
    signature.role === 'school' && signature.status === 'signed'
  ));
}

export function schoolParentConfirmationLabel(contract: SchoolDashboardContract):
  | 'data'
  | 'signature'
  | 'offer' {
  if (contract.kind === 'extra_lessons') return 'offer';
  return contract.signing_status === 'signed_by_school' ? 'signature' : 'data';
}

export function sumPendingSchoolInvoices(
  invoices: Array<{ total_eur?: number | string | null; payment_status?: string | null }>,
): number {
  let cents = 0;
  for (const invoice of invoices) {
    if (invoice.payment_status !== 'pending') continue;
    const amount = Number(invoice.total_eur);
    if (Number.isFinite(amount)) cents += Math.round(amount * 100);
  }
  return cents / 100;
}

export type SchoolAdminActionItem = {
  id: string;
  category: 'contracts' | 'payments' | 'sessions' | 'attendance' | 'groups';
  title: string;
  detail: string;
  href: string;
  occurredAt: string;
  priority: 1 | 2 | 3;
};

export type SchoolActivityItem = {
  id: string;
  title: string;
  detail: string;
  actor: string;
  occurredAt: string;
  href: string;
};

type ActionContract = SchoolDashboardContract & {
  id: string;
  student_name: string;
  sent_at?: string | null;
  created_at?: string | null;
  signed_at?: string | null;
  pdf_url?: string | null;
  signed_contract_url?: string | null;
};

type ActionInvoice = {
  id: string;
  student_name: string;
  payment_status?: string | null;
  due_date?: string | null;
  created_at?: string | null;
  total_eur?: number | string | null;
};

type ActionSession = {
  id: string;
  student_id: string;
  student_name: string;
  tutor_name: string;
  topic?: string | null;
  start_time: string;
  end_time: string;
  status: string;
  status_confirmed_at?: string | null;
  cancelled_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  cancellation_reason?: string | null;
  paid?: boolean | null;
  price?: number | string | null;
  class_group_id?: string | null;
};

type ActionGroup = {
  id: string;
  name: string;
  admin_action_required?: boolean | null;
  admin_action_note?: string | null;
  admin_action_requested_at?: string | null;
  tutor_name?: string | null;
  updated_at?: string | null;
};

const instant = (value?: string | null) => {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
};

export function buildSchoolAdminActionQueue(input: {
  contracts: ActionContract[];
  invoices: ActionInvoice[];
  sessions: ActionSession[];
  groups?: ActionGroup[];
  now?: Date;
}): SchoolAdminActionItem[] {
  const now = input.now || new Date();
  const nowMs = now.getTime();
  const fiveDaysAgo = nowMs - 5 * 86_400_000;
  const today = now.toISOString().slice(0, 10);
  const items: SchoolAdminActionItem[] = [];

  for (const contract of input.contracts) {
    const anchor = contract.sent_at || contract.created_at || now.toISOString();
    if (contract.signing_status === 'draft') {
      items.push({
        id: `contract-draft:${contract.id}`,
        category: 'contracts',
        title: `Neišsiųsta sutartis: ${contract.student_name}`,
        detail: 'Sutartis dar juodraštyje - patikrinkite duomenis ir išsiųskite.',
        href: '/school/contracts',
        occurredAt: anchor,
        priority: 2,
      });
    }
    if (contract.kind === 'extra_lessons' && !contract.pdf_url) {
      items.push({
        id: `contract-pdf:${contract.id}`,
        category: 'contracts',
        title: `Nepavyko paruošti PDF: ${contract.student_name}`,
        detail: 'Papildomų užsiėmimų pasiūlymui trūksta PDF.',
        href: '/school/contracts',
        occurredAt: anchor,
        priority: 3,
      });
    }
    const hasReviewableCopy = Boolean(contract.signed_contract_url)
      || (contract.signing_status === 'awaiting_school_signature' && Boolean(contract.pdf_url));
    if (hasReviewableCopy && contract.signing_status !== 'signed') {
      items.push({
        id: `contract-document:${contract.id}`,
        category: 'contracts',
        title: `Gautas dokumentas peržiūrai: ${contract.student_name}`,
        detail: 'Įkelta sutarties kopija dar nėra galutinai apdorota.',
        href: '/school/contracts',
        occurredAt: anchor,
        priority: 2,
      });
    }
    if (isSchoolParentConfirmationPending(contract) && instant(anchor) > 0 && instant(anchor) < fiveDaysAgo) {
      items.push({
        id: `contract-parent:${contract.id}`,
        category: 'contracts',
        title: `Tėvų patvirtinimo laukiama ilgiau nei 5 d.: ${contract.student_name}`,
        detail: contract.kind === 'extra_lessons' ? 'Nepriimtas papildomų užsiėmimų pasiūlymas.' : 'Neužbaigtas sutarties patvirtinimas.',
        href: '/school/contracts',
        occurredAt: anchor,
        priority: 2,
      });
    }
  }

  for (const invoice of input.invoices) {
    if (invoice.payment_status === 'pending' && invoice.due_date && invoice.due_date < today) {
      items.push({
        id: `invoice:${invoice.id}`,
        category: 'payments',
        title: `Pradelstas mokėjimas: ${invoice.student_name}`,
        detail: `Terminas ${invoice.due_date}, suma ${Number(invoice.total_eur || 0).toFixed(2)} €.`,
        href: '/school/finance?tab=payments',
        occurredAt: `${invoice.due_date}T12:00:00`,
        priority: 3,
      });
    }
  }

  for (const session of input.sessions) {
    const ended = instant(session.end_time) < nowMs;
    if (session.status === 'active' && ended && !session.status_confirmed_at) {
      items.push({
        id: `attendance:${session.id}`,
        category: 'attendance',
        title: `Nepatvirtintas lankomumas: ${session.student_name}`,
        detail: `${session.tutor_name} · ${session.topic || 'Užsiėmimas'}`,
        href: `/school/sessions?open=${encodeURIComponent(session.id)}`,
        occurredAt: session.end_time,
        priority: 2,
      });
    }
    const affectsAdministration = session.status === 'cancelled'
      && (Boolean(session.class_group_id) || Boolean(session.paid) || Number(session.price || 0) > 0);
    if (affectsAdministration) {
      items.push({
        id: `cancelled:${session.id}`,
        category: 'sessions',
        title: `Patikrinkite atšauktą užsiėmimą: ${session.student_name}`,
        detail: session.cancellation_reason || 'Gali turėti įtakos mokesčiui, tvarkaraščiui arba grupės sudėčiai.',
        href: `/school/sessions?open=${encodeURIComponent(session.id)}`,
        occurredAt: session.cancelled_at || session.updated_at || session.start_time,
        priority: 2,
      });
    }
  }

  const sessionsByStudent = new Map<string, ActionSession[]>();
  for (const session of input.sessions) {
    if (!['completed', 'no_show'].includes(session.status) || instant(session.end_time) >= nowMs) continue;
    const list = sessionsByStudent.get(session.student_id) || [];
    list.push(session);
    sessionsByStudent.set(session.student_id, list);
  }
  for (const list of sessionsByStudent.values()) {
    list.sort((a, b) => instant(b.start_time) - instant(a.start_time));
    const latest = list.slice(0, 3);
    if (latest.length === 3 && latest.every((row) => row.status === 'no_show')) {
      items.push({
        id: `three-absences:${latest[0].student_id}`,
        category: 'attendance',
        title: `3 praleisti užsiėmimai iš eilės: ${latest[0].student_name}`,
        detail: 'Reikalingas administracijos kontaktas su šeima.',
        href: `/school/students?student=${encodeURIComponent(latest[0].student_id)}`,
        occurredAt: latest[0].start_time,
        priority: 3,
      });
    }
  }

  for (const group of input.groups || []) {
    if (!group.admin_action_required) continue;
    items.push({
      id: `group:${group.id}`,
      category: 'groups',
      title: `Mokytojas prašo sprendimo: ${group.name}`,
      detail: group.admin_action_note || `${group.tutor_name || 'Mokytojas'} pažymėjo grupę administracijos peržiūrai.`,
      href: '/school/groups',
      occurredAt: group.admin_action_requested_at || group.updated_at || now.toISOString(),
      priority: 3,
    });
  }

  return items.sort((a, b) => b.priority - a.priority || instant(a.occurredAt) - instant(b.occurredAt));
}

export function buildSchoolActivityFeed(input: {
  contracts: ActionContract[];
  invoices: ActionInvoice[];
  sessions: ActionSession[];
  groups?: ActionGroup[];
}): SchoolActivityItem[] {
  const items: SchoolActivityItem[] = [];
  for (const contract of input.contracts) {
    const occurredAt = contract.signed_at || contract.accepted_at || contract.sent_at || contract.created_at;
    if (!occurredAt) continue;
    const title = contract.signing_status === 'signed'
      ? `Pasirašyta sutartis: ${contract.student_name}`
      : contract.sent_at
        ? `Išsiųsta sutartis: ${contract.student_name}`
        : `Sukurta sutartis: ${contract.student_name}`;
    items.push({ id: `contract:${contract.id}`, title, detail: contract.kind === 'extra_lessons' ? 'Papildomi užsiėmimai' : 'Metinė sutartis', actor: contract.signing_status === 'signed' ? 'Tėvai / mokykla' : 'Administracija', occurredAt, href: '/school/contracts' });
  }
  for (const invoice of input.invoices) {
    if (!invoice.created_at) continue;
    items.push({ id: `invoice:${invoice.id}`, title: `Sukurta sąskaita: ${invoice.student_name}`, detail: `${Number(invoice.total_eur || 0).toFixed(2)} €`, actor: 'Sistema', occurredAt: invoice.created_at, href: '/school/finance?tab=payments' });
  }
  for (const session of input.sessions) {
    const occurredAt = session.cancelled_at || session.status_confirmed_at || session.updated_at || session.created_at;
    if (!occurredAt) continue;
    const title = session.status === 'cancelled'
      ? `Atšauktas užsiėmimas: ${session.student_name}`
      : session.status === 'no_show'
        ? `Pažymėtas neatvykimas: ${session.student_name}`
        : session.status === 'completed'
          ? `Patvirtintas lankomumas: ${session.student_name}`
          : `Atnaujintas užsiėmimas: ${session.student_name}`;
    items.push({ id: `session:${session.id}`, title, detail: session.topic || 'Užsiėmimas', actor: session.tutor_name, occurredAt, href: `/school/sessions?open=${encodeURIComponent(session.id)}` });
  }
  for (const group of input.groups || []) {
    if (!group.updated_at) continue;
    items.push({ id: `group:${group.id}`, title: `Atnaujinta grupė: ${group.name}`, detail: group.admin_action_note || 'Tvarkaraštis arba grupės sudėtis', actor: group.tutor_name || 'Administracija', occurredAt: group.updated_at, href: '/school/groups' });
  }
  return items.sort((a, b) => instant(b.occurredAt) - instant(a.occurredAt)).slice(0, 30);
}
