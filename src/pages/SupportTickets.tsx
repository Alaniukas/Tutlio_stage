import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { SupportTicketsList, type SupportTicketSummary } from '@/components/support/SupportTicketsList';
import { loginHrefWithNext } from '@/lib/auth-redirects';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

function SupportTicketsContent() {
  const location = useLocation();
  const { locale } = useTranslation();
  const language = locale === 'lt' || locale === 'pl' ? locale : 'en';
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const selectedReference = new URLSearchParams(location.search).get('ticket');

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) throw new Error('Missing authenticated session.');
        const ticketQuery = selectedReference && /^[0-9a-f-]{36}$/i.test(selectedReference)
          ? `?ticket=${encodeURIComponent(selectedReference)}`
          : '';
        const response = await fetch(`/api/my-support-requests${ticketQuery}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller.signal,
        });
        const result = await response.json().catch(() => null) as { requests?: SupportTicketSummary[] } | null;
        if (!response.ok || !Array.isArray(result?.requests)) throw new Error('Could not load support requests.');
        if (active) setTickets(result.requests);
      } catch (loadError) {
        if (active && !(loadError instanceof DOMException && loadError.name === 'AbortError')) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshVersion, selectedReference]);

  return (
    <SupportTicketsList
      tickets={tickets}
      language={language}
      supportPath="/support"
      canCreateTicket={false}
      selectedReference={selectedReference}
      loading={loading}
      error={error}
      onRefresh={() => setRefreshVersion((version) => version + 1)}
    />
  );
}

export default function SupportTickets() {
  const location = useLocation();
  const [authState, setAuthState] = useState<'loading' | 'signed_in' | 'signed_out'>('loading');
  const [authRevision, setAuthRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let authEventSeen = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_OUT' && event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;
      authEventSeen = true;
      if (event === 'SIGNED_OUT') {
        if (active) setAuthState('signed_out');
      } else if (active) {
        setAuthState(session?.access_token ? 'signed_in' : 'signed_out');
        setAuthRevision((revision) => revision + 1);
      }
    });
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (active && !authEventSeen) setAuthState(session?.access_token ? 'signed_in' : 'signed_out');
    }).catch(() => {
      if (active && !authEventSeen) setAuthState('signed_out');
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (authState === 'loading') return <div className="min-h-dvh bg-slate-50 p-8 text-center text-sm text-slate-600">Loading…</div>;
  if (authState === 'signed_out') {
    return <Navigate to={loginHrefWithNext(`${location.pathname}${location.search}`)} replace />;
  }
  return <main className="min-h-dvh bg-slate-50 px-3 py-6 sm:px-6 sm:py-10"><SupportTicketsContent key={authRevision} /></main>;
}
