import { useEffect, useRef } from 'react';
import { CheckCircle2, Clock3, CircleDot, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { InAppSupportCategory, InAppSupportStatus } from '@/lib/inAppSupport';
import { cn } from '@/lib/utils';

export type SupportTicketStatus = InAppSupportStatus;

export type SupportTicketSummary = {
  id: string;
  title: string;
  category: InAppSupportCategory;
  status: SupportTicketStatus;
  created_at: string;
  status_updated_at: string | null;
  target_date: string | null;
};

type Language = 'lt' | 'en' | 'pl';

const COPY = {
  lt: {
    title: 'Mano pagalbos užklausos',
    intro: 'Čia galite stebėti savo užklausų būseną.',
    newTicket: 'Nauja užklausa',
    refresh: 'Atnaujinti',
    loading: 'Kraunamos užklausos…',
    empty: 'Užklausų dar nėra.',
    failed: 'Nepavyko įkelti užklausų. Bandykite dar kartą.',
    bug: 'Klaida',
    feature: 'Funkcijos pasiūlymas',
    registered: 'Užregistruota',
    in_progress: 'Vykdoma',
    resolved: 'Išspręsta',
    featureResolved: 'Įgyvendinta',
    received: 'Gauta',
    lastChange: 'Būsena pakeista',
    deadline: 'Numatomas terminas',
    deadlinePending: 'Terminas dar nenustatytas',
  },
  en: {
    title: 'My support tickets',
    intro: 'Track the status of your requests here.',
    newTicket: 'New ticket',
    refresh: 'Refresh',
    loading: 'Loading tickets…',
    empty: 'You have no tickets yet.',
    failed: 'Could not load your tickets. Please try again.',
    bug: 'Bug',
    feature: 'Feature request',
    registered: 'Registered',
    in_progress: 'In progress',
    resolved: 'Resolved',
    featureResolved: 'Implemented',
    received: 'Received',
    lastChange: 'Status changed',
    deadline: 'Estimated deadline',
    deadlinePending: 'Deadline has not been set yet',
  },
  pl: {
    title: 'Moje zgłoszenia',
    intro: 'Tutaj możesz śledzić status swoich zgłoszeń.',
    newTicket: 'Nowe zgłoszenie',
    refresh: 'Odśwież',
    loading: 'Ładowanie zgłoszeń…',
    empty: 'Nie masz jeszcze zgłoszeń.',
    failed: 'Nie udało się załadować zgłoszeń. Spróbuj ponownie.',
    bug: 'Błąd',
    feature: 'Propozycja funkcji',
    registered: 'Zarejestrowano',
    in_progress: 'W trakcie',
    resolved: 'Rozwiązano',
    featureResolved: 'Wdrożono',
    received: 'Otrzymano',
    lastChange: 'Zmiana statusu',
    deadline: 'Planowany termin',
    deadlinePending: 'Termin nie został jeszcze ustalony',
  },
} satisfies Record<Language, Record<string, string>>;

const STATUS_ORDER: SupportTicketStatus[] = ['registered', 'in_progress', 'resolved'];

export function supportTicketReference(id: string): string {
  return `SUP-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function formatDate(value: string | null, language: Language): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language === 'lt' ? 'lt-LT' : language === 'pl' ? 'pl-PL' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function SupportTicketsList({
  tickets,
  language,
  supportPath,
  canCreateTicket = true,
  selectedReference,
  loading,
  error,
  onRefresh,
}: {
  tickets: SupportTicketSummary[];
  language: Language;
  supportPath: string;
  canCreateTicket?: boolean;
  selectedReference?: string | null;
  loading: boolean;
  error: boolean;
  onRefresh: () => void;
}) {
  const copy = COPY[language];
  const selectedTicketRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!selectedReference || loading || error) return;
    selectedTicketRef.current?.focus({ preventScroll: true });
    selectedTicketRef.current?.scrollIntoView?.({ block: 'center' });
  }, [selectedReference, tickets, loading, error]);

  return (
    <section className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-7" aria-label={copy.title}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">{copy.title}</h1>
          <p className="mt-1 text-sm text-slate-600">{copy.intro}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />{copy.refresh}
          </button>
          {canCreateTicket && <Link to={supportPath} className="inline-flex min-h-10 items-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700">{copy.newTicket}</Link>}
        </div>
      </header>

      {error && <p role="alert" className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{copy.failed}</p>}
      {loading && tickets.length === 0 && <p className="mt-8 text-sm text-slate-500">{copy.loading}</p>}
      {!loading && !error && tickets.length === 0 && <p className="mt-8 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-600">{copy.empty}</p>}

      <div className="mt-6 space-y-4">
        {tickets.map((ticket) => {
          const reference = supportTicketReference(ticket.id);
          const statusIndex = STATUS_ORDER.indexOf(ticket.status);
          const created = formatDate(ticket.created_at, language);
          const changed = formatDate(ticket.status_updated_at, language);
          const deadline = formatDate(ticket.target_date, language);
          const selected = selectedReference?.toLowerCase() === ticket.id.toLowerCase() || selectedReference?.toUpperCase() === reference;
          const statusLabel = (status: SupportTicketStatus) => ticket.category === 'feature' && status === 'resolved'
            ? copy.featureResolved : copy[status];
          return (
            <article
              key={ticket.id}
              ref={selected ? selectedTicketRef : undefined}
              tabIndex={selected ? -1 : undefined}
              data-ticket-reference={reference}
              className={cn('rounded-xl border p-4 sm:p-5', selected ? 'border-indigo-400 bg-indigo-50/40' : 'border-slate-200')}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold tracking-wide text-indigo-700">{reference} · {copy[ticket.category]}</p>
                  <h2 className="mt-1 break-words text-base font-bold text-slate-950">{ticket.title}</h2>
                </div>
                <span className={cn('rounded-full px-3 py-1 text-xs font-bold', ticket.status === 'resolved' ? 'bg-emerald-100 text-emerald-800' : ticket.status === 'in_progress' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800')}>
                  {statusLabel(ticket.status)}
                </span>
              </div>

              <ol className="mt-5 grid grid-cols-3 gap-2" aria-label={copy.title}>
                {STATUS_ORDER.map((step, index) => {
                  const Icon = step === 'resolved' ? CheckCircle2 : step === 'in_progress' ? Clock3 : CircleDot;
                  return (
                    <li key={step} aria-current={ticket.status === step ? 'step' : undefined} className={cn('flex items-center gap-1.5 border-t-2 pt-2 text-xs font-semibold', index <= statusIndex ? 'border-indigo-500 text-indigo-800' : 'border-slate-200 text-slate-400')}>
                      <Icon className="h-3.5 w-3.5 shrink-0" />{statusLabel(step)}
                    </li>
                  );
                })}
              </ol>

              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
                {created && <span>{copy.received}: <strong>{created}</strong></span>}
                {changed && ticket.status !== 'registered' && <span>{copy.lastChange}: <strong>{changed}</strong></span>}
                {ticket.status === 'in_progress' && <span>{copy.deadline}: <strong>{deadline || copy.deadlinePending}</strong></span>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
