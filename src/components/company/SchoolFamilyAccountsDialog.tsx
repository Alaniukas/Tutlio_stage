import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Users, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { schoolFamilyAccountCopy, schoolFamilyAccountError } from '@/lib/schoolFamilyAccountCopy';
import type { SchoolFamilyAccountState, SchoolFamilyPreviewRow } from '../../../api/_lib/schoolFamilyAccounts';

export default function SchoolFamilyAccountsDialog({ canEdit, onChanged }: { canEdit: boolean; onChanged?: () => void }) {
  const { t, locale } = useTranslation();
  const copy = schoolFamilyAccountCopy(locale);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SchoolFamilyPreviewRow[]>([]);
  const [cursor, setCursor] = useState('');
  const [previous, setPrevious] = useState<string[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [qaLinks, setQaLinks] = useState<Array<{ role: string; invitationUrl: string }>>([]);
  const [review, setReview] = useState<SchoolFamilyPreviewRow | null>(null);
  const [contractId, setContractId] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianEmail, setGuardianEmail] = useState('');
  const [personalCode, setPersonalCode] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [split, setSplit] = useState<SchoolFamilyPreviewRow | null>(null);
  const [splitConfirmed, setSplitConfirmed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/school-family-accounts${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { headers: await authHeaders() });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setRows(result.rows || []); setNext(result.nextCursor || null); setSelected([]);
    } catch (loadError) { setError(schoolFamilyAccountError((loadError as Error).message, copy)); }
    finally { setLoading(false); }
  }, [cursor, copy]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const act = async (body: Record<string, unknown>) => {
    setBusy(true); setError(''); setMessage(''); setQaLinks([]);
    try {
      const response = await fetch('/api/school-family-accounts', { method: 'POST', headers: await authHeaders(), body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      const failed = result.results?.filter((row: { success: boolean }) => !row.success) || [];
      const failures = failed.map((row: { code: string }) => schoolFamilyAccountError(row.code, copy));
      const mailFailures = (result.results || []).flatMap((row: { invitations?: Array<{ sent: boolean; suppressed?: boolean }> }) => row.invitations || [])
        .some((invitation: { sent: boolean; suppressed?: boolean }) => !invitation.sent && !invitation.suppressed);
      if (mailFailures) failures.push(copy.failed);
      const links = (result.results || []).flatMap((row: { invitations?: Array<{ role: string; invitationUrl?: string }> }) => row.invitations || [])
        .filter((invitation: { invitationUrl?: string }) => invitation.invitationUrl);
      setQaLinks(links); setMessage(copy.actionDone); setReview(null); setSplit(null);
      await load(); setError(failures.join(' ')); onChanged?.();
    } catch (actionError) { setError(schoolFamilyAccountError((actionError as Error).message, copy)); }
    finally { setBusy(false); }
  };
  const openReview = (row: SchoolFamilyPreviewRow) => {
    setReview(row); setContractId(row.annualContracts[0]?.id || ''); setGuardianName(row.guardianName || '');
    setGuardianEmail(row.guardianEmail || ''); setPersonalCode(''); setConfirmed(false);
  };
  const submitReview = (event: FormEvent) => {
    event.preventDefault(); if (!confirmed || busy) return;
    void act({ action: 'verify_guardian', studentId: review!.studentId, contractId, guardianName, guardianEmail, personalCode, confirmed });
  };
  const accountState = (account: SchoolFamilyAccountState, label: string) => (
    <div className="min-w-0 text-xs text-gray-600 space-y-1">
      <p className="font-medium text-gray-900">{label}: <span className="break-all font-normal">{account.login || copy.none}</span></p>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1">
        {[[copy.created, !!account.createdAt], [copy.invited, !!account.invitedAt], [copy.activated, !!account.activatedAt], [copy.firstLogin, account.hasLoggedIn]].map(([name, done]) => (
          <div key={String(name)} className="flex items-center gap-1"><dt>{name}</dt><dd className={done ? 'text-emerald-700' : 'text-gray-400'}>{done ? '✓' : copy.none}</dd></div>
        ))}
      </dl>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline" size="sm" className="gap-2 rounded-xl"><Users className="h-4 w-4" />{copy.title}</Button></DialogTrigger>
      <DialogContent className="max-w-6xl w-[96vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{copy.title}</DialogTitle><DialogDescription>{copy.intro}</DialogDescription></DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={loading || busy} onClick={() => void load()} aria-label={t('school.recordings.refresh')}><RefreshCw className="h-4 w-4" /></Button>
          {canEdit && <><Button type="button" size="sm" disabled={loading || busy || !selected.length} onClick={() => void act({ action: 'provision', studentIds: selected })}>{copy.createInvite}</Button>
            <Button type="button" variant="outline" size="sm" disabled={loading || busy || !selected.length} onClick={() => void act({ action: 'resend', studentIds: selected })}>{copy.resend}</Button></>}
          <span className="text-xs text-gray-500">{copy.batchHint}</span>
          {(busy || loading) && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
        {import.meta.env.DEV && qaLinks.map((link, index) => <a key={index} href={link.invitationUrl} target="_blank" rel="noreferrer" className="text-sm underline">{copy.qaOpen}: {link.role === 'parent' ? copy.guardian : copy.child}</a>)}
        {review ? <form className="rounded-xl border p-4 space-y-3" onSubmit={submitReview}>
          <h3 className="font-semibold">{copy.verify}: {review.studentName}</h3><p className="text-sm text-gray-600">{copy.verifyHelp}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="family-review-contract">{copy.signedContract}</Label><select id="family-review-contract" value={contractId} onChange={(event) => setContractId(event.target.value)} className="w-full rounded-md border p-2" required>{review.annualContracts.map((contract) => <option key={contract.id} value={contract.id}>{contract.number}</option>)}</select></div>
            <div className="space-y-1"><Label htmlFor="family-review-name">{copy.guardian}</Label><Input id="family-review-name" value={guardianName} onChange={(event) => setGuardianName(event.target.value)} required /></div>
            <div className="space-y-1"><Label htmlFor="family-review-email">{t('common.email')}</Label><Input id="family-review-email" type="email" value={guardianEmail} onChange={(event) => setGuardianEmail(event.target.value)} required /></div>
            <div className="space-y-1"><Label htmlFor="family-review-code">{copy.personalCode}</Label><Input id="family-review-code" value={personalCode} onChange={(event) => setPersonalCode(event.target.value)} autoComplete="off" required /></div>
          </div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />{copy.confirmGuardian}</label>
          <div className="flex gap-2"><Button type="submit" disabled={busy || !confirmed}>{t('common.save')}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setReview(null)}>{t('common.cancel')}</Button></div>
        </form> : split ? <div className="rounded-xl border p-4 space-y-3">
          <h3 className="font-semibold">{copy.split}: {split.studentName}</h3><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={splitConfirmed} onChange={(event) => setSplitConfirmed(event.target.checked)} className="mt-1" />{copy.confirmSplit}</label>
          <div className="flex gap-2"><Button type="button" disabled={busy || !splitConfirmed} onClick={() => void act({ action: 'split_shared', studentId: split.studentId, confirmed: splitConfirmed })}>{copy.split}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setSplit(null)}>{t('common.cancel')}</Button></div>
        </div> : <div className="divide-y rounded-xl border">
          {rows.map((row) => <div key={row.studentId} className="grid gap-3 p-4 lg:grid-cols-[minmax(170px,1fr)_1fr_1fr]">
            <div className="space-y-2"><label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={selected.includes(row.studentId)} disabled={!canEdit || busy || row.blockedReasons.length > 0 || (selected.length >= 5 && !selected.includes(row.studentId))} onChange={(event) => setSelected((value) => event.target.checked ? [...value, row.studentId] : value.filter((id) => id !== row.studentId))} />{row.studentName}</label>
              <p className="text-xs text-gray-600 break-all">{copy.studentEmail}: {row.studentEmail || copy.none}</p>
              <p className="text-xs text-gray-600 break-all">{copy.guardian}: {row.guardianName || copy.none}, {row.guardianEmail || copy.none}</p>
              {row.blockedReasons.map((reason) => <p key={reason} className="text-xs text-amber-800">{schoolFamilyAccountError(reason, copy)}</p>)}
              {canEdit && row.annualContracts.length > 0 && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => openReview(row)}>{copy.verify}</Button>}
              {canEdit && row.verified && row.blockedReasons.some((reason) => reason.includes('shared_identity')) && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setSplit(row); setSplitConfirmed(false); }}>{copy.split}</Button>}
            </div>
            {accountState(row.parent, copy.guardian)}{accountState(row.student, copy.child)}
          </div>)}
          {!rows.length && !loading && <p className="p-4 text-sm text-gray-500">{t('compStu.noStudents')}</p>}
        </div>}
        <div className="flex justify-between"><Button type="button" variant="outline" disabled={!previous.length || loading || busy} onClick={() => { const value = [...previous]; setCursor(value.pop() || ''); setPrevious(value); }}>{t('compSch.previous')}</Button><Button type="button" variant="outline" disabled={!next || loading || busy} onClick={() => { setPrevious((value) => [...value, cursor]); setCursor(next!); }}>{t('compSch.next')}</Button></div>
      </DialogContent>
    </Dialog>
  );
}
