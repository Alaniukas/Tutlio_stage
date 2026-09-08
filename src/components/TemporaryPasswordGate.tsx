import { useState } from 'react';
import { useUser } from '@/contexts/UserContext';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';

export default function TemporaryPasswordGate({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user?.app_metadata?.temporary_password) return <>{children}</>;
  return <main className="min-h-screen grid place-items-center p-4 bg-gray-50">
    <form className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 border" onSubmit={async e => {
      e.preventDefault(); setError('');
      if (password !== confirmation) { setError('Slaptažodžiai nesutampa.'); return; }
      setBusy(true);
      try {
        const response = await fetch('/api/change-temporary-password', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ password }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) throw refreshError;
        window.location.reload();
      } catch (err) { setError(err instanceof Error ? err.message : 'Nepavyko pakeisti slaptažodžio.'); }
      setBusy(false);
    }}>
      <h1 className="text-xl font-semibold">Pasirinkite savo slaptažodį</h1>
      <p className="text-sm text-gray-600">Administracija paruošė jūsų paskyrą. Prieš tęsdami pakeiskite laikiną slaptažodį.</p>
      <label className="block">Naujas slaptažodis<input className="block w-full border rounded-lg p-2" type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <label className="block">Pakartokite slaptažodį<input className="block w-full border rounded-lg p-2" type="password" autoComplete="new-password" required value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
      {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
      <button disabled={busy} className="rounded-lg bg-emerald-600 text-white px-4 py-2">{busy ? 'Išsaugoma…' : 'Išsaugoti ir tęsti'}</button>
    </form>
  </main>;
}
