import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Check, Loader2, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authHeaders } from '@/lib/apiHelpers';
import { useTranslation } from '@/lib/i18n';
import { schoolFamilyAccountCopy, schoolFamilyAccountError, type SchoolFamilyAccountCopy } from '@/lib/schoolFamilyAccountCopy';
import type { SchoolFamilyAccountState, SchoolFamilyPreviewRow } from '../../../api/_lib/schoolFamilyAccounts';

function isSelectableRow(row: SchoolFamilyPreviewRow, canEdit: boolean, busy: boolean): boolean {
  return canEdit && !busy && row.blockedReasons.length === 0;
}

function isSignedContractRow(row: SchoolFamilyPreviewRow): boolean {
  return row.verified && row.blockedReasons.length === 0;
}

function pickStudentIds(rows: SchoolFamilyPreviewRow[], filter: (row: SchoolFamilyPreviewRow) => boolean): string[] {
  return rows.filter(filter).map((row) => row.studentId);
}

function AccountStatusPanel({
  label,
  account,
  copy,
}: {
  label: string;
  account: SchoolFamilyAccountState;
  copy: SchoolFamilyAccountCopy;
}) {
  const invited = Boolean(account.invitedAt || account.hasLoggedIn);
  const steps = [
    { name: copy.invited, done: invited },
    { name: copy.firstLogin, done: account.hasLoggedIn },
  ];
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      {account.login ? <p className="text-sm text-gray-900 break-all">{account.login}</p> : null}
      <div className="flex flex-wrap gap-2">
        {steps.map(({ name, done }) => (
          <span
            key={name}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
              done ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100' : 'bg-white text-gray-400 ring-1 ring-gray-200'
            }`}
          >
            {done ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}

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

  const selectableRows = useMemo(
    () => rows.filter((row) => isSelectableRow(row, canEdit, busy)),
    [rows, canEdit, busy],
  );
  const signedRows = useMemo(() => selectableRows.filter(isSignedContractRow), [selectableRows]);
  const allSelectableSelected = selectableRows.length > 0
    && selectableRows.every((row) => selected.includes(row.studentId));
  const someSelected = selected.length > 0;

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
  const toggleRow = (studentId: string, checked: boolean) => {
    setSelected((value) => {
      if (!checked) return value.filter((id) => id !== studentId);
      if (value.includes(studentId)) return value;
      return [...value, studentId];
    });
  };
  const toggleAllOnPage = (checked: boolean) => {
    setSelected(checked ? pickStudentIds(rows, (row) => isSelectableRow(row, canEdit, busy)) : []);
  };
  const selectSignedOnPage = () => {
    setSelected(pickStudentIds(rows, (row) => isSelectableRow(row, canEdit, busy) && isSignedContractRow(row)));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" variant="outline" size="sm" className="gap-2 rounded-xl"><Users className="h-4 w-4" />{copy.title}</Button></DialogTrigger>
      <DialogContent className="max-w-6xl w-[96vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{copy.title}</DialogTitle><DialogDescription>{copy.intro}</DialogDescription></DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={loading || busy} onClick={() => void load()} aria-label={t('school.recordings.refresh')}><RefreshCw className="h-4 w-4" /></Button>
          {canEdit && <>
            <Button type="button" size="sm" disabled={loading || busy || !selected.length} onClick={() => void act({ action: 'provision', studentIds: selected })}>{copy.createInvite}</Button>
            <Button type="button" variant="outline" size="sm" disabled={loading || busy || !selected.length} onClick={() => void act({ action: 'resend', studentIds: selected })}>{copy.resend}</Button>
          </>}
          <span className="text-xs text-gray-500">{copy.batchHint}</span>
          {someSelected && <span className="text-xs font-medium text-indigo-700">{copy.selectedCount.replace('{count}', String(selected.length))}</span>}
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
        </div> : <>
          {canEdit && rows.length > 0 && <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-gray-50 px-3 py-2 text-sm">
            <label className="inline-flex items-center gap-2 font-medium text-gray-800">
              <input
                type="checkbox"
                aria-label={copy.selectAllPage}
                checked={allSelectableSelected}
                disabled={loading || busy || !selectableRows.length}
                onChange={(event) => toggleAllOnPage(event.target.checked)}
              />
              {copy.selectAllPage}
            </label>
            <Button type="button" variant="outline" size="sm" disabled={loading || busy || !signedRows.length} onClick={selectSignedOnPage}>{copy.selectSigned}</Button>
            <Button type="button" variant="ghost" size="sm" disabled={loading || busy || !someSelected} onClick={() => setSelected([])}>{copy.clearSelection}</Button>
          </div>}
          <div className="space-y-3">
            {rows.map((row) => {
              const selectable = isSelectableRow(row, canEdit, busy);
              const checked = selected.includes(row.studentId);
              return (
                <article key={row.studentId} className={`rounded-xl border p-4 space-y-3 ${checked ? 'border-indigo-300 bg-indigo-50/30' : 'border-gray-200 bg-white'}`}>
                  <div className="flex gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 shrink-0"
                      aria-label={row.studentName}
                      checked={checked}
                      disabled={!selectable}
                      onChange={(event) => toggleRow(row.studentId, event.target.checked)}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <h3 className="font-semibold text-gray-900">{row.studentName}</h3>
                      <dl className="grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
                        <div><dt className="font-medium text-gray-500">{copy.studentEmail}</dt><dd className="break-all">{row.studentEmail || '—'}</dd></div>
                        <div><dt className="font-medium text-gray-500">{copy.guardian}</dt><dd className="break-all">{[row.guardianName, row.guardianEmail].filter(Boolean).join(' · ') || '—'}</dd></div>
                      </dl>
                      {row.blockedReasons.map((reason) => <p key={reason} className="text-xs text-amber-800">{schoolFamilyAccountError(reason, copy)}</p>)}
                      {canEdit && <div className="flex flex-wrap gap-2">
                        {row.annualContracts.length > 0 && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => openReview(row)}>{copy.verify}</Button>}
                        {row.verified && row.blockedReasons.some((reason) => reason.includes('shared_identity')) && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setSplit(row); setSplitConfirmed(false); }}>{copy.split}</Button>}
                      </div>}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <AccountStatusPanel label={copy.guardian} account={row.parent} copy={copy} />
                    <AccountStatusPanel label={copy.child} account={row.student} copy={copy} />
                  </div>
                </article>
              );
            })}
            {!rows.length && !loading && <p className="rounded-xl border p-4 text-sm text-gray-500">{t('compStu.noStudents')}</p>}
          </div>
        </>}
        <div className="flex justify-between"><Button type="button" variant="outline" disabled={!previous.length || loading || busy} onClick={() => { const value = [...previous]; setCursor(value.pop() || ''); setPrevious(value); }}>{t('compSch.previous')}</Button><Button type="button" variant="outline" disabled={!next || loading || busy} onClick={() => { setPrevious((value) => [...value, cursor]); setCursor(next!); }}>{t('compSch.next')}</Button></div>
      </DialogContent>
    </Dialog>
  );
}
