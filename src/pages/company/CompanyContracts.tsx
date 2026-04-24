import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getCached, setCache, invalidateCache } from '@/lib/dataCache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, FileText, Send, CheckCircle, Edit2, Trash2 } from 'lucide-react';
import Toast from '@/components/Toast';
import { sendEmail } from '@/lib/email';
import { useTranslation } from '@/lib/i18n';
import { sortStudentsByFullName } from '@/lib/sortStudentsByFullName';

interface Student {
  id: string;
  full_name: string;
  email: string;
  payer_name: string | null;
  payer_email: string | null;
}

interface Template {
  id: string;
  name: string;
  body: string;
  annual_fee_default: number | null;
  pdf_url?: string | null;
}

interface Contract {
  id: string;
  organization_id: string;
  template_id: string | null;
  student_id: string;
  filled_body: string;
  annual_fee: number;
  signing_status: 'draft' | 'sent' | 'signed';
  signed_at: string | null;
  sent_at: string | null;
  created_at: string;
  pdf_url?: string | null;
  student?: { full_name: string; email: string; payer_name: string | null; payer_email: string | null };
}

interface InstallmentDraft {
  amount: string;
  due_date: string;
}

const PLACEHOLDERS = ['{{student_name}}', '{{parent_name}}', '{{parent_email}}', '{{annual_fee}}', '{{date}}', '{{school_name}}'];

function fillPlaceholders(body: string, data: Record<string, string>): string {
  let result = body;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return result;
}

const CONTRACTS_CACHE_KEY = 'company_contracts';

export default function CompanyContracts() {
  const { t: tr } = useTranslation();
  const cc = getCached<any>(CONTRACTS_CACHE_KEY);
  const [orgId, setOrgId] = useState<string | null>(cc?.orgId ?? null);
  const [orgName, setOrgName] = useState(cc?.orgName ?? '');
  const [orgEmail, setOrgEmail] = useState(cc?.orgEmail ?? '');
  const [templates, setTemplates] = useState<Template[]>(cc?.templates ?? []);
  const [contracts, setContracts] = useState<Contract[]>(cc?.contracts ?? []);
  const [students, setStudents] = useState<Student[]>(cc?.students ?? []);
  const [loading, setLoading] = useState(!cc);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [templateOpen, setTemplateOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [tForm, setTForm] = useState({ name: '', body: '', annual_fee_default: '', pdf_url: '' });
  const [templatePdfFile, setTemplatePdfFile] = useState<File | null>(null);

  const [contractOpen, setContractOpen] = useState(false);
  const [cForm, setCForm] = useState({ student_id: '', template_id: '', annual_fee: '', filled_body: '' });
  const [sendImmediately, setSendImmediately] = useState(true);
  const [paymentMode, setPaymentMode] = useState<'full' | 'installments'>('full');
  const [installmentRows, setInstallmentRows] = useState<InstallmentDraft[]>([{ amount: '', due_date: '' }]);
  const [saving, setSaving] = useState(false);

  const [tab, setTab] = useState<'contracts' | 'templates'>('contracts');

  useEffect(() => { if (!getCached(CONTRACTS_CACHE_KEY)) load(); }, []);

  const load = async () => {
    if (!getCached(CONTRACTS_CACHE_KEY)) setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: admin } = await supabase
      .from('organization_admins')
      .select('organization_id, organizations(name, email)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!admin?.organization_id) { setLoading(false); return; }
    setOrgId(admin.organization_id);
    const name = (admin.organizations as any)?.name || '';
    const email = (admin.organizations as any)?.email || '';
    setOrgName(name);
    setOrgEmail(email);

    const [tRes, cRes, sRes] = await Promise.all([
      supabase.from('school_contract_templates').select('*').eq('organization_id', admin.organization_id).order('created_at', { ascending: false }),
      supabase.from('school_contracts').select('*, student:students(full_name, email, payer_name, payer_email)').eq('organization_id', admin.organization_id).order('created_at', { ascending: false }),
      supabase.from('students').select('id, full_name, email, payer_name, payer_email').eq('organization_id', admin.organization_id).order('full_name'),
    ]);

    const tData = tRes.data || [];
    const cData = cRes.data || [];
    const sData = sRes.data || [];
    setTemplates(tData);
    setContracts(cData);
    setStudents(sData);
    setCache(CONTRACTS_CACHE_KEY, { orgId: admin.organization_id, orgName: name, orgEmail: email, templates: tData, contracts: cData, students: sData });
    setLoading(false);
  };

  const reload = () => { invalidateCache(CONTRACTS_CACHE_KEY); load(); };

  const saveTemplate = async () => {
    if (!orgId || !tForm.name.trim()) return;
    setSaving(true);

    const payload = {
      organization_id: orgId,
      name: tForm.name.trim(),
      body: tForm.body,
      annual_fee_default: tForm.annual_fee_default ? Number(tForm.annual_fee_default) : null,
      pdf_url: tForm.pdf_url || null,
    };

    if (templatePdfFile) {
      const fileExt = templatePdfFile.name.split('.').pop()?.toLowerCase() || 'pdf';
      const path = `${orgId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      const { error: uploadErr } = await supabase.storage.from('school-contracts').upload(path, templatePdfFile, {
        cacheControl: '3600',
        upsert: false,
        contentType: templatePdfFile.type || 'application/pdf',
      });
      if (uploadErr) {
        setToast({ message: uploadErr.message, type: 'error' });
        setSaving(false);
        return;
      }
      const { data } = supabase.storage.from('school-contracts').getPublicUrl(path);
      payload.pdf_url = data.publicUrl;
    }

    if (editTemplate) {
      const { error } = await supabase.from('school_contract_templates').update(payload).eq('id', editTemplate.id);
      if (error) { setToast({ message: error.message, type: 'error' }); setSaving(false); return; }
    } else {
      const { error } = await supabase.from('school_contract_templates').insert(payload);
      if (error) { setToast({ message: error.message, type: 'error' }); setSaving(false); return; }
    }

    setSaving(false);
    setTemplateOpen(false);
    setEditTemplate(null);
    setTemplatePdfFile(null);
    setTForm({ name: '', body: tr('school.contract.defaultBody'), annual_fee_default: '', pdf_url: '' });
    setToast({ message: editTemplate ? tr('school.toastTemplateUpdated') : tr('school.toastTemplateCreated'), type: 'success' });
    reload();
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm(tr('school.confirmDeleteTemplate'))) return;
    await supabase.from('school_contract_templates').delete().eq('id', id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const openEditTemplate = (t: Template) => {
    setEditTemplate(t);
    setTemplatePdfFile(null);
    setTForm({ name: t.name, body: t.body, annual_fee_default: t.annual_fee_default?.toString() || '', pdf_url: t.pdf_url || '' });
    setTemplateOpen(true);
  };

  const openCreateContract = () => {
    setCForm({ student_id: '', template_id: '', annual_fee: '', filled_body: tr('school.contract.defaultBody') });
    setSendImmediately(true);
    setPaymentMode('full');
    setInstallmentRows([{ amount: '', due_date: '' }]);
    setContractOpen(true);
  };

  const buildFilledBody = (opts: { templateBody?: string; annualFee: string; studentId: string }) => {
    const s = students.find((st) => st.id === opts.studentId);
    const sourceBody = opts.templateBody ?? cForm.filled_body;
    return fillPlaceholders(sourceBody, {
      '{{student_name}}': s?.full_name || '',
      '{{parent_name}}': s?.payer_name || '',
      '{{parent_email}}': s?.payer_email || '',
      '{{annual_fee}}': opts.annualFee || '',
      '{{date}}': new Date().toLocaleDateString('lt-LT'),
      '{{school_name}}': orgName,
    });
  };

  const onTemplateSelect = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    const nextAnnual = tpl.annual_fee_default?.toString() || cForm.annual_fee;
    setCForm((prev) => ({
      ...prev,
      template_id: templateId,
      annual_fee: nextAnnual,
      filled_body: buildFilledBody({ templateBody: tpl.body, annualFee: nextAnnual, studentId: prev.student_id }),
    }));
  };

  const onStudentSelect = (studentId: string) => {
    setCForm((prev) => ({
      ...prev,
      student_id: studentId,
      filled_body: buildFilledBody({ annualFee: prev.annual_fee, studentId }),
    }));
  };

  const createContract = async () => {
    if (!orgId || !cForm.student_id || !cForm.annual_fee) return;
    if (paymentMode === 'installments' && installmentRows.some((r) => !r.amount || !r.due_date)) {
      setToast({ message: tr('school.installmentsRequired'), type: 'error' });
      return;
    }
    if (paymentMode === 'installments') {
      const installmentsTotal = installmentRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
      const annual = Number(cForm.annual_fee);
      if (Math.abs(installmentsTotal - annual) > 0.01) {
        setToast({ message: tr('school.installmentsTotalMismatch'), type: 'error' });
        return;
      }
    }
    setSaving(true);

    const finalBody = buildFilledBody({ annualFee: cForm.annual_fee, studentId: cForm.student_id });

    const { data: created, error } = await supabase.from('school_contracts').insert({
      organization_id: orgId,
      template_id: cForm.template_id || null,
      student_id: cForm.student_id,
      filled_body: finalBody,
      pdf_url: templates.find((t) => t.id === cForm.template_id)?.pdf_url || null,
      annual_fee: Number(cForm.annual_fee),
      signing_status: sendImmediately ? 'sent' : 'draft',
      sent_at: sendImmediately ? new Date().toISOString() : null,
    }).select('*, student:students(full_name, email, payer_name, payer_email)').single();

    setSaving(false);
    if (error) { setToast({ message: error.message, type: 'error' }); return; }

    if (paymentMode === 'installments' && created) {
      const schedule = installmentRows.map((r, idx) => ({
        contract_id: created.id,
        installment_number: idx + 1,
        amount: Number(r.amount),
        due_date: r.due_date,
      }));
      const { error: installmentsErr } = await supabase.from('school_payment_installments').insert(schedule);
      if (installmentsErr) {
        setToast({ message: installmentsErr.message, type: 'error' });
        reload();
        return;
      }
    }

    if (sendImmediately && created) {
      const recipient = created.student?.payer_email || created.student?.email;
      if (recipient) {
        const ok = await sendEmail({
          type: 'school_contract',
          to: recipient,
          data: {
            schoolName: orgName,
            schoolEmail: orgEmail,
            studentName: created.student?.full_name || '',
            parentName: created.student?.payer_name || created.student?.full_name || '',
            recipientName: created.student?.payer_name || created.student?.full_name || '',
            annualFee: created.annual_fee,
            contractBody: created.filled_body,
            pdfUrl: created.pdf_url || undefined,
            date: new Date().toLocaleDateString('lt-LT'),
          },
        });
        if (!ok) {
          await supabase.from('school_contracts').update({ signing_status: 'draft', sent_at: null }).eq('id', created.id);
          setToast({ message: tr('school.toastContractSendFail'), type: 'error' });
          reload();
          return;
        }
      } else {
        await supabase.from('school_contracts').update({ signing_status: 'draft', sent_at: null }).eq('id', created.id);
        setToast({ message: tr('school.toastNoEmail'), type: 'error' });
        reload();
        return;
      }
    }

    setContractOpen(false);
    setToast({
      message: sendImmediately
        ? tr('school.toastContractSent')
        : paymentMode === 'installments'
          ? tr('school.toastContractAndInstallmentsCreated')
          : tr('school.toastContractCreated'),
      type: 'success',
    });
    reload();
  };

  const sendContract = async (contract: Contract) => {
    const student = contract.student;
    const recipient = student?.payer_email || student?.email;
    if (!recipient) {
      setToast({ message: tr('school.toastNoEmail'), type: 'error' });
      return;
    }

    const ok = await sendEmail({
      type: 'school_contract',
      to: recipient,
      data: {
        schoolName: orgName,
        schoolEmail: orgEmail,
        studentName: student?.full_name || '',
        parentName: student?.payer_name || student?.full_name || '',
        recipientName: student?.payer_name || student?.full_name || '',
        annualFee: contract.annual_fee,
        contractBody: contract.filled_body,
        pdfUrl: contract.pdf_url || undefined,
        date: new Date().toLocaleDateString('lt-LT'),
      },
    });

    if (ok) {
      await supabase
        .from('school_contracts')
        .update({ signing_status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', contract.id);
      setToast({ message: tr('school.toastContractSent'), type: 'success' });
      reload();
    } else {
      setToast({ message: tr('school.toastContractSendFail'), type: 'error' });
    }
  };

  const markSigned = async (contractId: string) => {
    await supabase
      .from('school_contracts')
      .update({ signing_status: 'signed', signed_at: new Date().toISOString() })
      .eq('id', contractId);
    setToast({ message: tr('school.toastContractSigned'), type: 'success' });
    reload();
  };

  const deleteContract = async (id: string) => {
    if (!confirm(tr('school.confirmDeleteContract'))) return;
    await supabase.from('school_contracts').delete().eq('id', id);
    setContracts((prev) => prev.filter((c) => c.id !== id));
  };

  const statusBadge = (s: Contract['signing_status']) => {
    const map = {
      draft: { label: tr('school.draft'), cls: 'bg-gray-100 text-gray-600' },
      sent: { label: tr('school.sentStatus'), cls: 'bg-amber-50 text-amber-700' },
      signed: { label: tr('school.signedStatus'), cls: 'bg-green-50 text-green-700' },
    };
    const { label, cls } = map[s];
    return <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
  };

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900">{tr('school.contractsTitle')}</h1>
          <div className="flex items-center gap-2">
            <div className="bg-gray-100 rounded-lg p-1 flex gap-1">
              <button onClick={() => setTab('contracts')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'contracts' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
                {tr('school.tabContracts')}
              </button>
              <button onClick={() => setTab('templates')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'templates' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
                {tr('school.tabTemplates')}
              </button>
            </div>
            {tab === 'contracts' ? (
              <Button onClick={openCreateContract} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-2" /> {tr('school.newContract')}
              </Button>
            ) : (
              <Button onClick={() => { setEditTemplate(null); setTemplatePdfFile(null); setTForm({ name: '', body: tr('school.contract.defaultBody'), annual_fee_default: '', pdf_url: '' }); setTemplateOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-2" /> {tr('school.newTemplate')}
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          </div>
        ) : tab === 'contracts' ? (
          contracts.length === 0 ? (
            <div className="text-center py-20">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">{tr('school.noContracts')}</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {contracts.map((c) => (
                <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{c.student?.full_name || '—'}</p>
                        {statusBadge(c.signing_status)}
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {tr('school.annualFee')} <span className="font-medium text-gray-700">&euro;{Number(c.annual_fee).toFixed(2)}</span>
                        {c.sent_at && <span className="ml-3">{tr('school.sent')} {new Date(c.sent_at).toLocaleDateString('lt-LT')}</span>}
                        {c.signed_at && <span className="ml-3">{tr('school.signed')} {new Date(c.signed_at).toLocaleDateString('lt-LT')}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {c.signing_status === 'draft' && (
                        <Button size="sm" variant="outline" onClick={() => sendContract(c)}>
                          <Send className="w-3.5 h-3.5 mr-1.5" /> {tr('school.send')}
                        </Button>
                      )}
                      {c.signing_status === 'sent' && (
                        <Button size="sm" variant="outline" onClick={() => markSigned(c.id)} className="text-green-700 border-green-200 hover:bg-green-50">
                          <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> {tr('school.markSigned')}
                        </Button>
                      )}
                      <button onClick={() => deleteContract(c.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          templates.length === 0 ? (
            <div className="text-center py-20">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">{tr('school.noTemplates')}</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {templates.map((tpl) => (
                <div key={tpl.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{tpl.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {tr('school.defaultFee')} {tpl.annual_fee_default ? `€${tpl.annual_fee_default}` : tr('school.defaultFeeNotSet')}
                    </p>
                    {tpl.pdf_url && (
                      <a className="text-xs text-emerald-700 hover:underline" href={tpl.pdf_url} target="_blank" rel="noreferrer">
                        {tr('school.openPdfTemplate')}
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditTemplate(tpl)}>
                      <Edit2 className="w-3.5 h-3.5 mr-1.5" /> {tr('school.edit')}
                    </Button>
                    <button onClick={() => deleteTemplate(tpl.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTemplate ? tr('school.editTemplate') : tr('school.newTemplateDialog')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{tr('school.templateName')}</Label>
                <Input value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} placeholder={tr('school.templateNamePlaceholder')} />
              </div>
              <div className="space-y-2">
                <Label>{tr('school.templateDefaultFee')}</Label>
                <Input type="number" step="0.01" value={tForm.annual_fee_default} onChange={(e) => setTForm({ ...tForm, annual_fee_default: e.target.value })} placeholder="500.00" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{tr('school.contractBody')}</Label>
              <p className="text-xs text-gray-400">{tr('school.placeholdersHint')} {PLACEHOLDERS.join(', ')}</p>
              <Textarea
                value={tForm.body}
                onChange={(e) => setTForm({ ...tForm, body: e.target.value })}
                className="min-h-[300px] font-mono text-sm"
                placeholder={tr('school.enterTemplatePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{tr('school.templatePdf')}</Label>
              <Input
                type="file"
                accept="application/pdf"
                onChange={(e) => setTemplatePdfFile(e.target.files?.[0] || null)}
              />
              {tForm.pdf_url && (
                <a className="text-xs text-emerald-700 hover:underline" href={tForm.pdf_url} target="_blank" rel="noreferrer">
                  {tr('school.openPdfTemplate')}
                </a>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>{tr('school.cancel')}</Button>
            <Button onClick={saveTemplate} disabled={saving || !tForm.name.trim()} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? tr('school.savingTemplate') : editTemplate ? tr('school.update') : tr('school.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={contractOpen} onOpenChange={setContractOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr('school.newContractDialog')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{tr('school.studentName')}</Label>
                <Select value={cForm.student_id} onValueChange={onStudentSelect}>
                  <SelectTrigger><SelectValue placeholder={tr('school.selectStudent')} /></SelectTrigger>
                  <SelectContent>
                    {sortStudentsByFullName(students).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{tr('school.templateLabel')}</Label>
                <Select value={cForm.template_id} onValueChange={onTemplateSelect}>
                  <SelectTrigger><SelectValue placeholder={tr('school.selectTemplate')} /></SelectTrigger>
                  <SelectContent>
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{tr('school.annualFeeStar')}</Label>
              <Input
                type="number"
                step="0.01"
                value={cForm.annual_fee}
                onChange={(e) => setCForm({ ...cForm, annual_fee: e.target.value, filled_body: buildFilledBody({ annualFee: e.target.value, studentId: cForm.student_id }) })}
                placeholder="500.00"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={sendImmediately}
                onChange={(e) => setSendImmediately(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600"
              />
              {tr('school.sendContractImmediately')}
            </label>
            <div className="space-y-2">
              <Label>{tr('school.paymentPlan')}</Label>
              <Select value={paymentMode} onValueChange={(v: 'full' | 'installments') => setPaymentMode(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">{tr('school.payFull')}</SelectItem>
                  <SelectItem value="installments">{tr('school.payInstallments')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {paymentMode === 'installments' && (
              <div className="space-y-3 rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">{tr('school.installments')}</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => setInstallmentRows((prev) => [...prev, { amount: '', due_date: '' }])}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> {tr('school.add')}
                  </Button>
                </div>
                {installmentRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-[32px_1fr_1fr_32px] gap-2 items-end">
                    <span className="text-xs text-gray-500 pb-2">#{idx + 1}</span>
                    <div className="space-y-1">
                      <Label className="text-xs">{tr('school.amount')}</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={row.amount}
                        onChange={(e) =>
                          setInstallmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, amount: e.target.value } : r)))
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{tr('school.dueDateField')}</Label>
                      <Input
                        type="date"
                        value={row.due_date}
                        onChange={(e) =>
                          setInstallmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, due_date: e.target.value } : r)))
                        }
                      />
                    </div>
                    <button
                      type="button"
                      disabled={installmentRows.length === 1}
                      onClick={() => setInstallmentRows((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <Label>{tr('school.contractBody')}</Label>
              <Textarea
                value={cForm.filled_body}
                onChange={(e) => setCForm({ ...cForm, filled_body: e.target.value })}
                className="min-h-[250px] font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContractOpen(false)}>{tr('school.cancel')}</Button>
            <Button onClick={createContract} disabled={saving || !cForm.student_id || !cForm.annual_fee} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? tr('school.creating') : tr('school.createContract')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
