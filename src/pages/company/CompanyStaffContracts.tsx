import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, FileText, Send, Trash2, PenLine, LockKeyhole } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { schoolContractPdfStoragePath } from '@/lib/schoolContractPdfPath';
import { uploadContractFile } from '@/lib/contractStorage';
import { getOrgVisibleTutors } from '@/lib/orgVisibleTutors';

export type TeacherContractStatus = 'draft' | 'sent' | 'awaiting_school_signature' | 'signed_by_school' | 'signed';

export type TeacherContractOption = {
  id: string;
  full_name: string;
  email?: string | null;
};

export interface TeacherContract {
  id: string;
  organization_id: string;
  contract_number?: string | null;
  party_kind?: string | null;
  counterparty_name?: string | null;
  counterparty_email?: string | null;
  signing_status: TeacherContractStatus;
  signed_at: string | null;
  sent_at: string | null;
  created_at: string;
  pdf_url?: string | null;
  signed_contract_url?: string | null;
  signatures?: { role: string; status: string; signed_at?: string | null; gosign_transaction_id?: string | null; manually_marked_at?: string | null }[];
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export default function CompanyStaffContracts(props: {
  orgId: string;
  eSignEnabled: boolean;
  contracts: TeacherContract[];
  saving: boolean;
  onSignAsSchool: (contract: TeacherContract) => void;
  onReload: () => void;
  onDelete: (id: string) => void;
  onOpenFile: (url?: string | null) => void;
  statusBadge: (status: TeacherContractStatus) => ReactNode;
  onToast: (message: string, type: 'success' | 'error') => void;
  availableTeachers?: TeacherContractOption[];
}) {
  const { t: tr } = useTranslation();
  const {
    orgId,
    eSignEnabled,
    contracts,
    saving,
    onSignAsSchool,
    onReload,
    onDelete,
    onOpenFile,
    statusBadge,
    onToast,
    availableTeachers,
  } = props;

  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState<TeacherContract | null>(null);
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [teacherName, setTeacherName] = useState('');
  const [teacherEmail, setTeacherEmail] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [teacherOptions, setTeacherOptions] = useState<TeacherContractOption[]>(availableTeachers || []);
  const [teachersLoading, setTeachersLoading] = useState(false);

  useEffect(() => {
    if (availableTeachers) {
      setTeacherOptions(availableTeachers);
      return;
    }
    if (!createOpen || !orgId) return;
    let cancelled = false;
    setTeachersLoading(true);
    void getOrgVisibleTutors(supabase, orgId, 'id, full_name, email')
      .then((rows) => {
        if (cancelled) return;
        setTeacherOptions(rows.map((row) => ({ id: row.id, full_name: row.full_name, email: row.email })));
      })
      .catch(() => {
        if (!cancelled) setTeacherOptions([]);
      })
      .finally(() => {
        if (!cancelled) setTeachersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [availableTeachers, createOpen, orgId]);

  const generateContractNumber = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `MOK-${y}${m}${d}-${h}${min}`;
  };

  const resetCreate = () => {
    setFile(null);
    setTeacherName('');
    setTeacherEmail('');
    setContractNumber('');
    setSelectedTeacherId('');
  };

  const createContract = async () => {
    if (!file) {
      onToast(tr('school.teacherContractFileRequired'), 'error');
      return;
    }
    if (!isPdfFile(file)) {
      onToast(tr('school.teacherContractPdfOnly'), 'error');
      return;
    }
    const name = teacherName.trim();
    const email = teacherEmail.trim();
    if (!selectedTeacherId) {
      onToast(tr('school.teacherContractTeacherRequired'), 'error');
      return;
    }
    if (!name) {
      onToast(tr('school.teacherContractNameRequired'), 'error');
      return;
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      onToast(tr('school.teacherContractEmailInvalid'), 'error');
      return;
    }
    setCreating(true);
    try {
      const id = crypto.randomUUID();
      const number = contractNumber.trim() || generateContractNumber();
      const path = schoolContractPdfStoragePath({
        organizationId: orgId,
        contractId: id,
        contractNumber: number,
      });
      const uploaded = await uploadContractFile(path, file, 'application/pdf');
      if (uploaded.error || !uploaded.path) {
        onToast(uploaded.error || tr('school.teacherContractUploadFail'), 'error');
        return;
      }
      const { error } = await supabase.from('school_contracts').insert({
        id,
        organization_id: orgId,
        template_id: null,
        contract_number: number,
        student_id: null,
        party_kind: 'teacher',
        counterparty_name: name,
        counterparty_email: email,
        filled_body: name,
        pdf_url: uploaded.path,
        annual_fee: 0,
        signing_status: eSignEnabled ? 'awaiting_school_signature' : 'draft',
      });
      if (error) {
        onToast(error.message, 'error');
        return;
      }
      setCreateOpen(false);
      resetCreate();
      onToast(tr('school.teacherContractCreated'), 'success');
      onReload();
    } catch (e: any) {
      onToast(e?.message || tr('school.teacherContractCreateFail'), 'error');
    } finally {
      setCreating(false);
    }
  };

  const openInvite = (contract: TeacherContract) => {
    setInviteName(contract.counterparty_name || '');
    setInviteEmail(contract.counterparty_email || '');
    setInviteOpen(contract);
  };

  const sendInvite = async () => {
    const contract = inviteOpen;
    if (!contract) return;
    const email = inviteEmail.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      onToast(tr('school.teacherContractEmailInvalid'), 'error');
      return;
    }
    setInviting(true);
    try {
      const hdrs = await authHeaders();
      const res = await fetch('/api/school-contract-teacher-invite', {
        method: 'POST',
        headers: hdrs,
        body: JSON.stringify({
          contractId: contract.id,
          email,
          name: inviteName.trim() || email,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        onToast(j.error || tr('school.teacherContractInviteFail'), 'error');
        return;
      }
      setInviteOpen(null);
      onToast(
        j.emailed === false ? tr('school.teacherContractInviteSavedNoEmail') : tr('school.teacherContractInviteSent'),
        j.emailed === false ? 'error' : 'success',
      );
      onReload();
    } catch (e: any) {
      onToast(e?.message || tr('school.teacherContractInviteFail'), 'error');
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-600 max-w-2xl">{tr('school.teacherContractsHint')}</p>
        <Button onClick={() => { resetCreate(); setCreateOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-2" /> {tr('school.newTeacherContract')}
        </Button>
      </div>
      <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-emerald-950">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
        <p>{tr('school.teacherContractPrivateHint')}</p>
      </div>

      {contracts.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{tr('school.noTeacherContracts')}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {contracts.map((c, idx) => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 tabular-nums">{idx + 1}.</span>
                <p className="font-semibold text-gray-900">{c.counterparty_name || tr('school.teacherContractUnnamed')}</p>
                {statusBadge(c.signing_status)}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {c.contract_number && <span className="mr-3">Sutarties Nr. {c.contract_number}</span>}
                {c.counterparty_email && <span className="mr-3">{c.counterparty_email}</span>}
                {c.sent_at && <span className="mr-3">{tr('school.sent')} {new Date(c.sent_at).toLocaleDateString('lt-LT')}</span>}
                {c.signed_at && <span>{tr('school.signed')} {new Date(c.signed_at).toLocaleDateString('lt-LT')}</span>}
              </p>
              {c.signed_contract_url && (
                <p className="text-xs text-emerald-700 mt-1">
                  {tr('school.teacherContractSignedFile')}:{' '}
                  <button type="button" className="underline" onClick={() => onOpenFile(c.signed_contract_url)}>
                    {tr('school.openFile')}
                  </button>
                </p>
              )}
              {!c.signed_contract_url && c.pdf_url && (
                <p className="text-xs text-indigo-700 mt-1">
                  {tr('school.teacherContractLatestFile')}:{' '}
                  <button type="button" className="underline" onClick={() => onOpenFile(c.pdf_url)}>
                    {tr('school.openPdf')}
                  </button>
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-gray-100">
                {eSignEnabled && c.signing_status === 'awaiting_school_signature' && (
                  <Button size="sm" onClick={() => onSignAsSchool(c)} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    <PenLine className="w-3.5 h-3.5 mr-1.5" /> {saving ? tr('school.preparing') : tr('school.signAsDirector')}
                  </Button>
                )}
                {eSignEnabled && c.signing_status === 'signed_by_school' && (
                  <Button size="sm" onClick={() => openInvite(c)}>
                    <Send className="w-3.5 h-3.5 mr-1.5" />
                    {c.sent_at ? tr('school.teacherContractResendInvite') : tr('school.teacherContractSendInvite')}
                  </Button>
                )}
                {eSignEnabled && c.signing_status === 'signed_by_school' && (
                  <span className="text-xs text-blue-700 font-medium">{tr('school.waitingTeacherSignature')}</span>
                )}

                <button
                  onClick={() => onDelete(c.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors ml-auto"
                  aria-label={tr('school.confirmDeleteContract')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open && !creating) setCreateOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr('school.newTeacherContract')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">{tr('school.teacherContractCreateHint')}</p>
            <div className="space-y-1.5">
              <Label>{tr('school.teacherContractTeacherPicker')}</Label>
              <Select
                value={selectedTeacherId}
                onValueChange={(value) => {
                  const selected = teacherOptions.find((teacher) => teacher.id === value);
                  setSelectedTeacherId(value);
                  if (selected) {
                    setTeacherName(selected.full_name || '');
                    setTeacherEmail(selected.email || '');
                  }
                }}
              >
                <SelectTrigger disabled={teachersLoading || teacherOptions.length === 0}>
                  <SelectValue placeholder={teachersLoading ? tr('school.loadingTeachers') : tr('school.teacherContractTeacherPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {teacherOptions.length === 0 ? (
                    <SelectItem value="no-teachers" disabled>{tr('school.teacherContractNoTeachers')}</SelectItem>
                  ) : teacherOptions.map((teacher) => (
                    <SelectItem key={teacher.id} value={teacher.id}>
                      {teacher.full_name}{teacher.email ? ` · ${teacher.email}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">{tr('school.teacherContractTeacherPickerHint')}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{tr('school.teacherContractFile')}</Label>
              <Input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr('school.teacherName')}</Label>
              <Input value={teacherName} readOnly={Boolean(selectedTeacherId)} onChange={(e) => setTeacherName(e.target.value)} placeholder={tr('school.teacherNamePlaceholder')} />
            </div>
            <div className="space-y-1.5">
              <Label>{tr('school.teacherEmail')}</Label>
              <Input type="email" value={teacherEmail} readOnly={Boolean(selectedTeacherId)} onChange={(e) => setTeacherEmail(e.target.value)} placeholder="mokytojas@mokykla.lt" />
            </div>
            <div className="space-y-1.5">
              <Label>{tr('school.contractNumberOptional')}</Label>
              <Input value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} placeholder="MOK-2026-001" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>{tr('common.cancel')}</Button>
            <Button onClick={() => void createContract()} disabled={creating || !file || !selectedTeacherId || !teacherName.trim() || !teacherEmail.trim()} className="bg-emerald-600 hover:bg-emerald-700">
              {creating ? tr('school.creating') : tr('school.createContract')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(inviteOpen)} onOpenChange={(open) => { if (!open && !inviting) setInviteOpen(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr('school.teacherContractSendInvite')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">{tr('school.teacherContractInviteHint')}</p>
            <div className="space-y-1.5">
              <Label>{tr('school.teacherName')}</Label>
              <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{tr('school.teacherEmail')} *</Label>
              <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(null)} disabled={inviting}>{tr('common.cancel')}</Button>
            <Button onClick={() => void sendInvite()} disabled={inviting}>
              <Send className="w-4 h-4 mr-1.5" />
              {inviting ? tr('school.sending') : tr('school.send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
