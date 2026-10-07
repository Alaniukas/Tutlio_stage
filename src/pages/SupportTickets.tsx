import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { SupportTicketsList, type SupportTicketSummary } from '@/components/support/SupportTicketsList';
import { loginHrefWithNext } from '@/lib/auth-redirects';
import { finishGuardedLoad, resolveAccessToken } from '@/lib/authSession';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

function SupportTicketsContent({ accessToken }: { accessToken: string | null }) {
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
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(false);
      await finishGuardedLoad({
        isCancelled: () => cancelled,
        setLoading,
        run: async () => {
          const token = accessToken || await resolveAccessToken();
          if (!token) throw new Error('Missing authenticated session.');
          const ticketQuery = selectedReference && /^[0-9a-f-]{36}$/i.test(selectedReference)
            ? `?ticket=${encodeURIComponent(selectedReference)}`
            : '';
          const response = await fetch(`/api/my-support-requests${ticketQuery}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
          const result = await response.json().catch(() => null) as { requests?: SupportTicketSummary[] } | null;
          if (!response.ok || !Array.isArray(result?.requests)) throw new Error('Could not load support requests.');
          if (!cancelled) setTickets(result.requests);
        },
      }).catch((loadError) => {
        if (!cancelled && !(loadError instanceof DOMException && loadError.name === 'AbortError')) setError(true);
      });
    };
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [refreshVersion, selectedReference, accessToken]);

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
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authRevision, setAuthRevision] = useState(0);

  useEffect(() => {
    let active = true;
    let authEventSeen = false;
    const applySession = (session: { access_token?: string } | null) => {
      if (!active) return;
      const token = session?.access_token ?? null;
      setAccessToken(token);
      setAuthState(token ? 'signed_in' : 'signed_out');
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_OUT' && event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;
      authEventSeen = true;
      if (event === 'SIGNED_OUT') {
        if (active) {
          setAccessToken(null);
          setAuthState('signed_out');
        }
      } else {
        applySession(session);
        if (active) setAuthRevision((revision) => revision + 1);
      }
    });
    void resolveAccessToken().then((token) => {
      if (active && !authEventSeen) {
        setAccessToken(token);
        setAuthState(token ? 'signed_in' : 'signed_out');
      }
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
  return (
    <main className="min-h-dvh bg-slate-50 px-3 py-6 sm:px-6 sm:py-10">
      <SupportTicketsContent key={authRevision} accessToken={accessToken} />
    </main>
  );
}
