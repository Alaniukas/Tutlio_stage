import { useEffect, useMemo, useRef, useState } from 'react';
import { authHeaders } from '@/lib/apiHelpers';
import { schoolContractPdfStoragePath } from '@/lib/schoolContractPdfPath';
import { uploadContractFile } from '@/lib/contractStorage';
import { useOrgAdminAccess } from '@/contexts/OrgAdminAccessContext';

export type StaffDocument = {
  id: string;
  organization_id: string;
  counterparty_name: string;
  counterparty_email: string;
  staff_document_type: 'confidentiality' | 'consent';
  staff_document_group_id: string;
  staff_employment_contract_number: string | null;
  staff_employment_contract_date: string | null;
  staff_consent_answers: Array<'yes' | 'no'> | null;
  staff_revoked_at: string | null;
  signing_status: string;
  status: 'draft' | 'sent' | 'viewed' | 'signed' | 'revoked';
  sent_at: string | null;
  signed_at: string | null;
  pdf_url: string | null;
  signed_contract_url: string | null;
  staff_files_deleted_at: string | null;
};

const STATUS_LABEL: Record<StaffDocument['status'], string> = {
  draft: 'Ruošiama', sent: 'Išsiųsta', viewed: 'Peržiūrėta', signed: 'Pasirašyta', revoked: 'Atšaukta',
};
const STATUS_COLOR: Record<StaffDocument['status'], string> = {
  draft: 'bg-slate-100 text-slate-700', sent: 'bg-amber-50 text-amber-800',
  viewed: 'bg-blue-50 text-blue-800', signed: 'bg-emerald-50 text-emerald-800',
  revoked: 'bg-red-50 text-red-800',
};
const TYPE_LABEL: Record<StaffDocument['staff_document_type'], string> = {
  confidentiality: 'Konfidencialumo susitarimas su priedu',
  consent: 'Asmens duomenų tvarkymo sutikimas',
};

async function post(action: Record<string, unknown>) {
  const response = await fetch('/api/school-staff-documents', {
    method: 'POST', headers: await authHeaders(), body: JSON.stringify(action),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(body.error || `HTTP ${response.status}`), { status: response.status });
  return body;
}

function csvCell(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function countLabel(count: number, singular: string, plural: string, genitive: string): string {
  const form = new Intl.PluralRules('lt').select(count);
  return `${count} ${form === 'one' ? singular : form === 'few' ? plural : genitive}`;
}

type PreviewData = { documents: StaffDocument[]; organizationId: string };

export function CompanyStaffDocumentsContent({ canEdit, previewData }: { canEdit: boolean; previewData?: PreviewData }) {
  const [documents, setDocuments] = useState<StaffDocument[]>(previewData?.documents || []);
  const [organizationId, setOrganizationId] = useState(previewData?.organizationId || '');
  const [loading, setLoading] = useState(!previewData);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [unsignedOnly, setUnsignedOnly] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [employmentContractNumber, setEmploymentContractNumber] = useState('');
  const [employmentContractDate, setEmploymentContractDate] = useState('');
  const [preparedFile, setPreparedFile] = useState<File | null>(null);
  const [preparedIncludesAnnex, setPreparedIncludesAnnex] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const pendingBundle = useRef<{
    fingerprint: string; file: File | null; groupId: string; confidentialityId: string;
    consentId: string; preparedPdfPath?: string;
  } | null>(null);

  const load = async (preserveError = false) => {
    if (previewData) return;
    try {
      const response = await fetch('/api/school-staff-documents', { headers: await authHeaders() });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Nepavyko įkelti dokumentų.');
      setDocuments(body.documents || []);
      setOrganizationId(body.organizationId || '');
      if (!preserveError) setError('');
    } catch (cause: any) {
      setError(cause?.message || 'Nepavyko įkelti dokumentų.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const refresh = (event: StorageEvent | MessageEvent) => {
      if ('key' in event && event.key !== 'tutlio:school-contract-updated') return;
      if ('origin' in event && event.origin !== window.location.origin) return;
      void load();
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('message', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('message', refresh);
    };
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('lt');
    return documents.filter((document) => {
      if (unsignedOnly && (document.status === 'signed' || document.status === 'revoked')) return false;
      return !query || `${document.counterparty_name} ${document.counterparty_email} ${document.staff_employment_contract_number}`.toLocaleLowerCase('lt').includes(query);
    });
  }, [documents, search, unsignedOnly]);

  const grouped = useMemo(() => {
    const groups = new Map<string, StaffDocument[]>();
    for (const item of visible) {
      const key = item.staff_document_group_id || item.id;
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    return [...groups.values()];
  }, [visible]);

  const create = async () => {
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email)) {
      setError('Įveskite darbuotojo vardą, pavardę ir el. paštą.');
      return;
    }
    if (!preparedFile && (!employmentContractNumber.trim() || !employmentContractDate)) {
      setError('Generuojant trūkstamą dokumentą reikia darbo sutarties numerio ir datos.');
      return;
    }
    if (preparedFile && !(preparedFile.type === 'application/pdf' || preparedFile.name.toLowerCase().endsWith('.pdf'))) {
      setError('Paruoštas dokumentas turi būti PDF formato.');
      return;
    }
    if (preparedFile && preparedFile.size > 25 * 1024 * 1024) {
      setError('PDF failas per didelis. Daugiausia 25 MB.');
      return;
    }
    if (preparedFile && !preparedIncludesAnnex) {
      setError('Patvirtinkite, kad PDF yra ir susitarimas, ir jo priedas.');
      return;
    }
    if (previewData) {
      const groupId = crypto.randomUUID();
      const common = {
        organization_id: organizationId, counterparty_name: name.trim(), counterparty_email: email.trim(),
        staff_document_group_id: groupId, staff_employment_contract_number: employmentContractNumber || null,
        staff_employment_contract_date: employmentContractDate || null, staff_consent_answers: null,
        staff_revoked_at: null, sent_at: null, signed_at: null, signed_contract_url: null,
        staff_files_deleted_at: null,
      };
      setDocuments((current) => [
        { ...common, id: crypto.randomUUID(), staff_document_type: 'confidentiality', signing_status: 'awaiting_school_signature', status: 'draft', pdf_url: 'preview.pdf' },
        { ...common, id: crypto.randomUUID(), staff_document_type: 'consent', signing_status: 'draft', status: 'sent', pdf_url: null, sent_at: new Date().toISOString() },
        ...current,
      ]);
      setName(''); setEmail(''); setEmploymentContractNumber(''); setEmploymentContractDate(''); setPreparedFile(null); setPreparedIncludesAnnex(false); setFileInputKey((key) => key + 1);
      setError(''); setMessage('Peržiūros režimu sukurti du pavyzdiniai dokumentai.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const fingerprint = [name.trim(), email.trim().toLowerCase(), employmentContractNumber.trim(), employmentContractDate].join('\u0000');
      const bundle = pendingBundle.current?.fingerprint === fingerprint && pendingBundle.current.file === preparedFile
        ? pendingBundle.current
        : { fingerprint, file: preparedFile, groupId: crypto.randomUUID(), confidentialityId: crypto.randomUUID(), consentId: crypto.randomUUID() };
      pendingBundle.current = bundle;
      if (preparedFile && !bundle.preparedPdfPath) {
        const number = `DAR-${new Date().getFullYear()}-${bundle.confidentialityId.slice(0, 8).toUpperCase()}`;
        const path = schoolContractPdfStoragePath({ organizationId, contractId: bundle.confidentialityId, contractNumber: number });
        const uploaded = await uploadContractFile(path, preparedFile, 'application/pdf');
        if (uploaded.error && !/already exists|duplicate/i.test(uploaded.error)) throw new Error(uploaded.error);
        bundle.preparedPdfPath = uploaded.path || path;
      }
      const result = await post({
        action: 'create-bundle', groupId: bundle.groupId,
        confidentialityId: bundle.confidentialityId, consentId: bundle.consentId,
        name: name.trim(), email: email.trim(),
        employmentContractNumber: employmentContractNumber.trim(), employmentContractDate,
        preparedPdfPath: bundle.preparedPdfPath,
      });
      setMessage(result.emailed === true
        ? 'Sukurti du atskirai pasirašomi PDF. Sutikimo punktų forma išsiųsta darbuotojui.'
        : 'Sukurti du dokumentai, bet sutikimo laiškas neišsiųstas. Siųskite priminimą iš sąrašo.');
      setName(''); setEmail(''); setEmploymentContractNumber(''); setEmploymentContractDate(''); setPreparedFile(null); setPreparedIncludesAnnex(false); setFileInputKey((key) => key + 1);
      pendingBundle.current = null;
      await load();
    } catch (cause: any) {
      if ((cause?.status === 400 || cause?.status === 413) && preparedFile) {
        pendingBundle.current = null;
        setPreparedFile(null); setPreparedIncludesAnnex(false); setFileInputKey((key) => key + 1);
        setError(`${cause?.message || 'PDF netinka.'} Pasirinkite pataisytą PDF.`);
      } else {
        setError(`${cause?.message || 'Nepavyko sukurti dokumentų.'} Jei bandysite dar kartą nekeisdami laukų, bus naudojamas tas pats įkėlimas.`);
      }
      await load(true);
    } finally { setBusy(false); }
  };

  const action = async (name: 'remind' | 'revoke' | 'remind-unsigned', id?: string) => {
    if (name === 'revoke') {
      const target = documents.find((item) => item.id === id);
      if (!target || !window.confirm(`Atšaukti dokumentą „${TYPE_LABEL[target.staff_document_type]}“ darbuotojui ${target.counterparty_name}? Pasirašymo nuoroda nebeveiks. Kito dokumento būsena nesikeis.`)) return;
    }
    if (name === 'remind-unsigned' && !window.confirm('Išsiųsti priminimus visiems nepasirašiusiems darbuotojams? Paieška ir filtras šio veiksmo neriboja.')) return;
    if (previewData) {
      if (name === 'revoke') setDocuments((current) => current.map((item) => item.id === id ? { ...item, status: 'revoked', staff_revoked_at: new Date().toISOString() } : item));
      setMessage(name === 'revoke' ? 'Dokumentas atšauktas.' : 'Peržiūros režimu priminimas būtų išsiųstas el. paštu.');
      return;
    }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await post({ action: name, id });
      setMessage(name === 'remind-unsigned'
        ? `Išsiųsta ${result.sent} priminimų. Praleista ${result.skipped}.`
        : name === 'revoke' ? 'Dokumentas atšauktas.'
          : result.emailed ? 'Priminimas išsiųstas.' : 'Dokumentas dar neparuoštas priminimui.');
      await load();
    } catch (cause: any) { setError(cause?.message || 'Veiksmas nepavyko.'); }
    finally { setBusy(false); }
  };

  const signAsSchool = async (id: string) => {
    if (previewData) {
      setMessage('Peržiūros režimu būtų atidarytas mokyklos el. parašo langas.');
      return;
    }
    const tab = window.open('', '_blank');
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/school-contract-sign-init', {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify({ contractId: id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.signingUrl) throw new Error(body.error || 'Nepavyko pradėti pasirašymo.');
      if (tab) tab.location.href = body.signingUrl;
      else window.location.assign(body.signingUrl);
      setBusy(false);
    } catch (cause: any) { tab?.close(); setError(cause?.message || 'Nepavyko pradėti pasirašymo.'); setBusy(false); }
  };

  const openPdf = async (document: StaffDocument) => {
    if (previewData) {
      setMessage('Peržiūros režimu būtų atidarytas pasirinktas PDF.');
      return;
    }
    const path = document.signed_contract_url || document.pdf_url;
    if (!path) return;
    const tab = window.open('', '_blank');
    try {
      const response = await fetch('/api/school-contract-file-url', {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify({
          path, contractId: document.id, download: document.status === 'signed',
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.signedUrl) throw new Error(body.error || 'Failas nerastas.');
      if (tab) tab.location.href = body.signedUrl;
      else window.location.href = body.signedUrl;
    } catch (cause: any) { tab?.close(); setError(cause?.message || 'Nepavyko atidaryti PDF.'); }
  };

  const exportSummary = () => {
    const header = ['Darbuotojas', 'El. paštas', 'Darbo sutarties Nr.', 'Dokumentas', 'Būsena', 'Išsiųsta', 'Pasirašyta'];
    const rows = visible.map((document) => [document.counterparty_name, document.counterparty_email,
      document.staff_employment_contract_number, TYPE_LABEL[document.staff_document_type], STATUS_LABEL[document.status],
      document.sent_at || '', document.signed_at || '']);
    const contents = '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `darbuotoju-dokumentu-suvestine-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click(); URL.revokeObjectURL(url);
  };

  const nextStep = (item: StaffDocument) => {
    if (item.status === 'revoked' || item.status === 'signed') return null;
    if (item.staff_document_type === 'consent' && !item.staff_consent_answers) return 'Laukiama 10 darbuotojo pasirinkimų';
    if (item.signing_status === 'awaiting_school_signature') return 'Laukia mokyklos el. parašo';
    if (item.signing_status === 'signed_by_school') return 'Laukia darbuotojo el. parašo';
    return 'Ruošiama';
  };

  const canRemind = (item: StaffDocument) =>
    (item.staff_document_type === 'consent' && !item.staff_consent_answers)
    || item.signing_status === 'signed_by_school';

  const retentionDate = (signedAt: string | null) => {
    if (!signedAt) return null;
    const date = new Date(signedAt);
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() + 30);
    return new Intl.DateTimeFormat('lt-LT', { dateStyle: 'long', timeZone: 'Europe/Vilnius' }).format(date);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Darbuotojų dokumentai</h1>
        <p className="mt-1 text-sm text-slate-600">Vienam darbuotojui kuriami du atskirai elektroniniu parašu pasirašomi PDF: konfidencialumo susitarimas su priedu ir asmens duomenų sutikimas. Pasirašytus failus atsisiųskite per 30 dienų.</p>
      </header>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

      {canEdit && organizationId && <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">Naujo darbuotojo dokumentai</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Vardas, pavardė<input className="mt-1 w-full rounded-md border p-2" value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="text-sm">El. paštas<input type="email" className="mt-1 w-full rounded-md border p-2" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="text-sm">Darbo sutarties Nr. {preparedFile ? '(nebūtina)' : ''}<input className="mt-1 w-full rounded-md border p-2" value={employmentContractNumber} onChange={(event) => setEmploymentContractNumber(event.target.value)} /></label>
          <label className="text-sm">Darbo sutarties data {preparedFile ? '(nebūtina)' : ''}<input type="date" className="mt-1 w-full rounded-md border p-2" value={employmentContractDate} onChange={(event) => setEmploymentContractDate(event.target.value)} /></label>
          <label className="text-sm sm:col-span-2">Paruoštas konfidencialumo susitarimas su priedu viename PDF
            <input key={`prepared-${fileInputKey}`} type="file" accept=".pdf,application/pdf" className="peer sr-only" onChange={(event) => setPreparedFile(event.target.files?.[0] || null)} />
            <span className="mt-2 flex flex-wrap items-center gap-3 rounded-md peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-indigo-600">
              <span className="rounded-md border border-slate-300 bg-white px-3 py-2 font-medium text-slate-700">Pasirinkti PDF</span>
              <span className="break-all text-slate-600">{preparedFile?.name || 'PDF nepasirinktas'}</span>
            </span>
          </label>
          <p className="text-xs text-slate-500 sm:col-span-2">Jei PDF neįkelsite, sistema sugeneruos susitarimą su priedu iš šablono. Tuomet darbo sutarties numeris ir data yra būtini.</p>
          {preparedFile && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={preparedIncludesAnnex} onChange={(event) => setPreparedIncludesAnnex(event.target.checked)} /> PDF yra ir susitarimas, ir konfidencialios informacijos sąrašo priedas</label>}
        </div>
        <button disabled={busy || loading || !organizationId} onClick={() => void create()} className="mt-4 rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Kuriama…' : 'Sukurti du dokumentus'}</button>
      </section>}

      {(loading || organizationId) && <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input className="min-w-[220px] flex-1 rounded-md border p-2 text-sm" placeholder="Ieškoti darbuotojo" value={search} onChange={(event) => setSearch(event.target.value)} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unsignedOnly} onChange={(event) => setUnsignedOnly(event.target.checked)} /> Nepasirašyti</label>
          <button onClick={exportSummary} disabled={!visible.length} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">Atsisiųsti suvestinę CSV</button>
          {canEdit && <button onClick={() => void action('remind-unsigned')} disabled={busy} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">Priminti visiems nepasirašiusiems</button>}
        </div>
        <p className="mt-3 text-xs text-slate-500">{countLabel(grouped.length, 'darbuotojas', 'darbuotojai', 'darbuotojų')} · {countLabel(visible.length, 'dokumentas', 'dokumentai', 'dokumentų')}. Masinis priminimas siunčiamas visiems nepasirašiusiems, nepriklausomai nuo paieškos ar filtro, tam pačiam dokumentui ne dažniau kaip kartą per 24 val.</p>
        {loading ? <p className="mt-6 text-sm">Kraunama…</p> : visible.length === 0 ? <p className="mt-6 text-sm text-slate-500">Dokumentų nerasta.</p> : (
          <div className="mt-4 space-y-3">
            {grouped.map((group) => (
              <article key={group[0].staff_document_group_id || group[0].id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                  <h3 className="font-semibold text-slate-900">{group[0].counterparty_name}</h3>
                  <p className="text-xs text-slate-600">{group[0].counterparty_email}{group[0].staff_employment_contract_number ? ` · Darbo sutartis Nr. ${group[0].staff_employment_contract_number}` : ''}</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {group.map((document) => (
                    <div key={document.id} className="space-y-2 px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="font-medium text-slate-800">{TYPE_LABEL[document.staff_document_type]}</h4>
                        <span className={`rounded-full px-3 py-1 text-xs ${STATUS_COLOR[document.status]}`}>{STATUS_LABEL[document.status]}</span>
                      </div>
                      {nextStep(document) && <p className="text-sm text-amber-800">{nextStep(document)}</p>}
                      {document.status === 'signed' && !document.staff_files_deleted_at && retentionDate(document.signed_at) && <p className="text-xs text-slate-600">Atsisiųskite PDF iki {retentionDate(document.signed_at)}.</p>}
                      {document.staff_files_deleted_at && <p className="text-xs text-slate-500">PDF pašalintas po 30 dienų. Būsena ir parašų datos liko suvestinėje.</p>}
                      <div className="flex flex-wrap gap-2">
                        {!document.staff_files_deleted_at && (document.signed_contract_url || document.pdf_url) && <button onClick={() => void openPdf(document)} className="rounded-md border px-3 py-2 text-xs">{document.status === 'signed' ? 'Atsisiųsti pasirašytą PDF' : 'Peržiūrėti PDF'}</button>}
                        {canEdit && !document.staff_revoked_at && document.signing_status === 'awaiting_school_signature' && <button disabled={busy} onClick={() => void signAsSchool(document.id)} className="rounded-md bg-indigo-600 px-3 py-2 text-xs text-white disabled:opacity-50">Pasirašyti mokyklos vardu</button>}
                        {canEdit && !document.staff_revoked_at && document.status !== 'signed' && canRemind(document) && <button disabled={busy} onClick={() => void action('remind', document.id)} className="rounded-md border px-3 py-2 text-xs disabled:opacity-50">Siųsti priminimą</button>}
                        {canEdit && !document.staff_revoked_at && document.status !== 'signed' && <button disabled={busy} onClick={() => void action('revoke', document.id)} className="rounded-md border border-red-200 px-3 py-2 text-xs text-red-700 disabled:opacity-50">Atšaukti</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>}
    </div>
  );
}

export default function CompanyStaffDocuments() {
  const { can } = useOrgAdminAccess();
  return <CompanyStaffDocumentsContent canEdit={can('contracts.edit')} />;
}
