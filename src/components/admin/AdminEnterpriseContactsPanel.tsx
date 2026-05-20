import { useState, useEffect } from 'react';
import { Mail, Phone, Building2 } from 'lucide-react';

interface EnterpriseContact {
  id: string;
  company_name: string;
  license_count: number;
  contact_name: string;
  contact_surname: string;
  email: string;
  phone: string | null;
  message: string | null;
  created_at: string;
}

interface Props {
  adminSecret: string;
}

export default function AdminEnterpriseContactsPanel({ adminSecret }: Props) {
  const [contacts, setContacts] = useState<EnterpriseContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/admin-enterprise-contacts', {
          headers: { 'x-admin-secret': adminSecret },
        });
        const data = await res.json();
        if (!cancelled) {
          if (res.ok && data.contacts) setContacts(data.contacts);
          else setError(data.error || 'Failed to load');
        }
      } catch {
        if (!cancelled) setError('Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [adminSecret]);

  if (loading) {
    return <div className="p-8 text-center text-slate-400 text-sm">Kraunama...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-400 text-sm">{error}</div>;
  }

  if (contacts.length === 0) {
    return <div className="p-8 text-center text-slate-400 text-sm">Nėra enterprise užklausų</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">Enterprise kontaktų užklausos ({contacts.length})</p>
      <div className="space-y-3">
        {contacts.map((c) => (
          <div key={c.id} className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="font-semibold text-white">{c.company_name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
                  {c.license_count} {c.license_count === 1 ? 'licence' : 'licences'}
                </span>
              </div>
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {new Date(c.created_at).toLocaleString('lt-LT')}
              </span>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 text-sm">
              <div className="text-slate-300">
                <span className="text-slate-500 text-xs">Kontaktas:</span>{' '}
                {c.contact_name} {c.contact_surname}
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <a href={`mailto:${c.email}`} className="text-indigo-400 hover:underline">{c.email}</a>
              </div>
              {c.phone && (
                <div className="flex items-center gap-1.5 text-slate-300">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a>
                </div>
              )}
            </div>
            {c.message && (
              <div className="text-sm text-slate-400 bg-white/5 rounded-lg p-3 border border-white/5">
                {c.message}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
