import { useEffect, useRef, useState } from 'react';
import { authHeaders } from '@/lib/apiHelpers';
import { Button } from '@/components/ui/button';
import { useOrgAdminAccess } from '@/contexts/OrgAdminAccessContext';

type Status = { studentConnected: boolean; parents: { email: string; full_name: string }[] };
type Credential = { email: string; temporaryPassword: string; role: 'student' | 'parent' };
export default function StudentAccountSetup({ studentId, onProvisioned }: { studentId: string; onProvisioned?: (result: { role: string; userId: string }) => void }) {
  const { can } = useOrgAdminAccess();
  const currentStudent = useRef<string | null>(studentId);
  currentStudent.current = studentId;
  useEffect(() => {
    currentStudent.current = studentId;
    return () => { currentStudent.current = null; };
  }, [studentId]);
  const [status, setStatus] = useState<Status | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [emailCheck, setEmailCheck] = useState<{ studentId: string; recipients: { email: string; status: string; reason?: string }[] } | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  useEffect(() => { setEmailCheck(null); setCheckingEmail(false); }, [studentId]);
  const checkEmails = async () => {
    setCheckingEmail(true); setError('');
    try {
      const response = await fetch(`/api/admin-student-email-status?student_id=${encodeURIComponent(studentId)}`, { headers: await authHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Nepavyko patikrinti el. pašto.');
      if (currentStudent.current === studentId) setEmailCheck({ studentId, recipients: data.recipients });
    } catch (err) {
      if (currentStudent.current === studentId) setError(err instanceof Error ? err.message : 'Nepavyko patikrinti el. pašto.');
    } finally { if (currentStudent.current === studentId) setCheckingEmail(false); }
  };
  useEffect(() => { setCredentials([]); setBusy(false); }, [studentId]);
  useEffect(() => {
    let cancelled = false;
    setStatus(null); setError('');
    void (async () => {
      try {
        const response = await fetch(`/api/admin-student-account?student_id=${encodeURIComponent(studentId)}`, { headers: await authHeaders() });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!cancelled) setStatus(data);
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : 'Nepavyko patikrinti paskyrų.'); }
    })();
    return () => { cancelled = true; };
  }, [studentId, revision]);
  const create = async (role: 'student' | 'parent') => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin-student-account', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ student_id: studentId, role }) });
      const data = await response.json();
      if (currentStudent.current !== studentId) return;
      if (!response.ok) throw new Error(data.error);
      setCredentials(prev => [...prev, data]); setRevision(v => v + 1);
      onProvisioned?.(data);
    } catch (err) { if (currentStudent.current === studentId) setError(err instanceof Error ? err.message : 'Nepavyko sukurti paskyros.'); }
    if (currentStudent.current === studentId) setBusy(false);
  };
  return <section className="w-full space-y-2 rounded-xl border p-3 text-sm">
    <h3 className="font-medium">Prisijungimo paskyros</h3>
    {status && <>
      <p>Mokinio paskyra: {status.studentConnected ? 'prijungta' : 'nesukurta'}</p>
      <p>Tėvų paskyra: {status.parents.length ? status.parents.map(p => p.email).join(', ') : 'neprijungta'}</p>
      {can('students.edit') && <div className="flex flex-wrap gap-2">
        {!status.parents.length && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void create('parent')}>Sukurti tėvų paskyrą</Button>}
        {!status.studentConnected && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void create('student')}>Sukurti mokinio paskyrą</Button>}
      </div>}
      <p className="text-xs text-gray-500">Naudojami kortelėje išsaugoti el. paštai. Atskiroms paskyroms reikia skirtingų adresų. Vaiko pamokas tėvai mato ir be atskiro vaiko prisijungimo.</p>
    </>}
    {credentials.map(c => <div key={c.email} className="rounded-lg bg-emerald-50 p-2 select-all break-all">
      <p>{c.role === 'parent' ? 'Tėvų' : 'Mokinio'} prisijungimas: {c.email}</p>
      <p>Laikinas slaptažodis: <code>{c.temporaryPassword}</code></p>
      <p className="text-xs">Nukopijuokite ir perduokite paskyros savininkui. Uždarius kortelę slaptažodis nebebus rodomas. Prisijungus reikės jį pakeisti.</p>
    </div>)}
    <div className="space-y-2 border-t pt-2">
      <Button type="button" variant="outline" size="sm" disabled={checkingEmail} onClick={() => void checkEmails()}>{checkingEmail ? 'Tikrinama…' : 'Patikrinti el. pašto blokavimą'}</Button>
      {emailCheck?.studentId === studentId && <div aria-live="polite" className="space-y-1">
        {!emailCheck.recipients.length && <p>El. pašto adresai nenurodyti.</p>}
        {emailCheck.recipients.map(recipient => <p key={recipient.email} className={`break-all ${recipient.status === 'blocked' ? 'text-red-700' : 'text-gray-600'}`}>
          {recipient.email}: {recipient.status === 'blocked' ? 'Pristatymas užblokuotas' : recipient.status === 'not_blocked' ? 'Blokavimo nerasta' : 'Būsenos patikrinti nepavyko'}
          {recipient.reason === 'bounce' && ' (gavėjo serveris atmetė ankstesnį laišką)'}
          {recipient.reason === 'complaint' && ' (gautas skundas dėl šlamšto)'}
          {recipient.reason === 'manual' && ' (rankinis blokavimas)'}
        </p>)}
        <p className="text-xs text-gray-500">Tikrinamas dabartinis adresų blokavimas, o ne konkrečių laiškų pristatymas. Jei adresas užblokuotas, patikslinkite jį su gavėju ir kreipkitės į Tutlio pagalbą.</p>
      </div>}
    </div>
    {error && <p role="alert" className="text-red-600">{error}</p>}
  </section>;
}
