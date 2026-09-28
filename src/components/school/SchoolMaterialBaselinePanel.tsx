import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';

export default function SchoolMaterialBaselinePanel() {
  const { t } = useTranslation(); const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch('/api/school-materials', { headers: await authHeaders() });
        const result = await response.json(); if (active && response.ok) setComplete(result.complete === true);
      } catch { /* The explicit action below reports setup failure. */ }
    })();
    return () => { active = false; };
  }, []);
  const prepare = async () => {
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/school-materials', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ action: 'baseline' }) });
      const result = await response.json(); if (!response.ok) throw new Error();
      setComplete(result.complete === true); setMessage(t(result.complete ? 'school.materials.baselineReady' : 'school.materials.baselinePending'));
    } catch { setMessage(t('school.materials.baselineFailed')); } finally { setBusy(false); }
  };
  return <section className="space-y-3 rounded-2xl border bg-white p-4">
    <h2 className="font-semibold">{t('school.materials.baselineTitle')}</h2><p className="text-sm text-gray-600">{t('school.materials.baselineHelp')}</p>
    {complete ? <p role="status" className="text-sm text-emerald-700">{t('school.materials.baselineReady')}</p>
      : <Button variant="outline" disabled={busy} onClick={() => void prepare()}>{busy ? t('common.loading') : t('school.materials.prepareBaseline')}</Button>}
    {message && !complete && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
