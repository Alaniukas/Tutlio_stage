import { useState, useEffect } from 'react';
import SchoolLayout from '@/components/SchoolLayout';
import { supabase } from '@/lib/supabase';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, FileText, Send, CheckCircle, Clock, Edit2, Trash2 } from 'lucide-react';
import Toast from '@/components/Toast';
import { sendEmail } from '@/lib/email';

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
}

interface Contract {
  id: string;
  school_id: string;
  template_id: string | null;
  student_id: string;
  filled_body: string;
  annual_fee: number;
  signing_status: 'draft' | 'sent' | 'signed';
  signed_at: string | null;
  sent_at: string | null;
  created_at: string;
  student?: { full_name: string; email: string; payer_name: string | null; payer_email: string | null };
}

const DEFAULT_TEMPLATE_BODY = `ANNUAL FEE CONTRACT

School: {{school_name}}
Date: {{date}}

Student: {{student_name}}
Parent/Guardian: {{parent_name}}

Annual Fee: €{{annual_fee}}

This contract confirms the enrollment of {{student_name}} and the obligation to pay the annual fee of €{{annual_fee}}.

Signatures:
School representative: ____________________
Parent/Guardian: ____________________`;

const PLACEHOLDERS = ['{{student_name}}', '{{parent_name}}', '{{parent_email}}', '{{annual_fee}}', '{{date}}', '{{school_name}}'];

function fillPlaceholders(body: string, data: Record<string, string>): string {
  let result = body;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return result;
}

export default function SchoolContracts() {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState('');
  const [schoolEmail, setSchoolEmail] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [templateOpen, setTemplateOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [tForm, setTForm] = useState({ name: '', body: DEFAULT_TEMPLATE_BODY, annual_fee_default: '' });

  const [contractOpen, setContractOpen] = useState(false);
  const [cForm, setCForm] = useState({ student_id: '', template_id: '', annual_fee: '', filled_body: '' });
  const [saving, setSaving] = useState(false);

  const [tab, setTab] = useState<'contracts' | 'templates'>('contracts');

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: admin } = await supabase
      .from('school_admins')
      .select('school_id, schools(name, email)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!admin?.school_id) { setLoading(false); return; }
    setSchoolId(admin.school_id);
    setSchoolName((admin.schools as any)?.name || '');
    setSchoolEmail((admin.schools as any)?.email || '');

    const [tRes, cRes, sRes] = await Promise.all([
      supabase.from('school_contract_templates').select('*').eq('school_id', admin.school_id).order('created_at', { ascending: false }),
      supabase.from('school_contracts').select('*, student:students(full_name, email, payer_name, payer_email)').eq('school_id', admin.school_id).order('created_at', { ascending: false }),
      supabase.from('students').select('id, full_name, email, payer_name, payer_email').eq('school_id', admin.school_id).order('full_name'),
    ]);

    setTemplates(tRes.data || []);
    setContracts(cRes.data || []);
    setStudents(sRes.data || []);
    setLoading(false);
  };

  const saveTemplate = async () => {
    if (!schoolId || !tForm.name.trim()) return;
    setSaving(true);

    const payload = {
      school_id: schoolId,
      name: tForm.name.trim(),
      body: tForm.body,
      annual_fee_default: tForm.annual_fee_default ? Number(tForm.annual_fee_default) : null,
    };

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
    setTForm({ name: '', body: DEFAULT_TEMPLATE_BODY, annual_fee_default: '' });
    setToast({ message: editTemplate ? 'Template updated' : 'Template created', type: 'success' });
    load();
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    await supabase.from('school_contract_templates').delete().eq('id', id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const openEditTemplate = (t: Template) => {
    setEditTemplate(t);
    setTForm({ name: t.name, body: t.body, annual_fee_default: t.annual_fee_default?.toString() || '' });
    setTemplateOpen(true);
  };

  const openCreateContract = () => {
    setCForm({ student_id: '', template_id: '', annual_fee: '', filled_body: '' });
    setContractOpen(true);
  };

  const onTemplateSelect = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setCForm((prev) => ({
      ...prev,
      template_id: templateId,
      annual_fee: tpl.annual_fee_default?.toString() || prev.annual_fee,
      filled_body: tpl.body,
    }));
  };

  const onStudentSelect = (studentId: string) => {
    const s = students.find((st) => st.id === studentId);
    setCForm((prev) => {
      let body = prev.filled_body;
      if (s) {
        body = fillPlaceholders(body, {
          '{{student_name}}': s.full_name || '',
          '{{parent_name}}': s.payer_name || '',
          '{{parent_email}}': s.payer_email || '',
          '{{annual_fee}}': prev.annual_fee || '',
          '{{date}}': new Date().toLocaleDateString('lt-LT'),
          '{{school_name}}': schoolName,
        });
      }
      return { ...prev, student_id: studentId, filled_body: body };
    });
  };

  const createContract = async () => {
    if (!schoolId || !cForm.student_id || !cForm.annual_fee) return;
    setSaving(true);

    const finalBody = fillPlaceholders(cForm.filled_body, {
      '{{annual_fee}}': cForm.annual_fee,
      '{{date}}': new Date().toLocaleDateString('lt-LT'),
      '{{school_name}}': schoolName,
    });

    const { error } = await supabase.from('school_contracts').insert({
      school_id: schoolId,
      template_id: cForm.template_id || null,
      student_id: cForm.student_id,
      filled_body: finalBody,
      annual_fee: Number(cForm.annual_fee),
      signing_status: 'draft',
    });

    setSaving(false);
    if (error) { setToast({ message: error.message, type: 'error' }); return; }
    setContractOpen(false);
    setToast({ message: 'Contract created', type: 'success' });
    load();
  };

  const sendContract = async (contract: Contract) => {
    const student = contract.student;
    const recipient = student?.payer_email || student?.email;
    if (!recipient) {
      setToast({ message: 'No email address for this student or parent', type: 'error' });
      return;
    }

    const ok = await sendEmail({
      type: 'school_contract',
      to: recipient,
      data: {
        schoolName,
        schoolEmail,
        studentName: student?.full_name || '',
        parentName: student?.payer_name || student?.full_name || '',
        recipientName: student?.payer_name || student?.full_name || '',
        annualFee: contract.annual_fee,
        contractBody: contract.filled_body,
        date: new Date().toLocaleDateString('lt-LT'),
      },
    });

    if (ok) {
      await supabase
        .from('school_contracts')
        .update({ signing_status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', contract.id);
      setToast({ message: 'Contract sent', type: 'success' });
      load();
    } else {
      setToast({ message: 'Failed to send contract email', type: 'error' });
    }
  };

  const markSigned = async (contractId: string) => {
    await supabase
      .from('school_contracts')
      .update({ signing_status: 'signed', signed_at: new Date().toISOString() })
      .eq('id', contractId);
    setToast({ message: 'Contract marked as signed', type: 'success' });
    load();
  };

  const deleteContract = async (id: string) => {
    if (!confirm('Delete this contract?')) return;
    await supabase.from('school_contracts').delete().eq('id', id);
    setContracts((prev) => prev.filter((c) => c.id !== id));
  };

  const statusBadge = (s: Contract['signing_status']) => {
    const map = {
      draft: { label: 'Draft', cls: 'bg-gray-100 text-gray-600' },
      sent: { label: 'Sent', cls: 'bg-amber-50 text-amber-700' },
      signed: { label: 'Signed', cls: 'bg-green-50 text-green-700' },
    };
    const { label, cls } = map[s];
    return <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
  };

  return (
    <SchoolLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-bold text-gray-900">Contracts</h1>
          <div className="flex items-center gap-2">
            <div className="bg-gray-100 rounded-lg p-1 flex gap-1">
              <button onClick={() => setTab('contracts')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'contracts' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
                Contracts
              </button>
              <button onClick={() => setTab('templates')} className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === 'templates' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
                Templates
              </button>
            </div>
            {tab === 'contracts' ? (
              <Button onClick={openCreateContract} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-2" /> New Contract
              </Button>
            ) : (
              <Button onClick={() => { setEditTemplate(null); setTForm({ name: '', body: DEFAULT_TEMPLATE_BODY, annual_fee_default: '' }); setTemplateOpen(true); }} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-2" /> New Template
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
              <p className="text-gray-500">No contracts yet. Create a template first, then create contracts for students.</p>
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
                        Annual fee: <span className="font-medium text-gray-700">&euro;{Number(c.annual_fee).toFixed(2)}</span>
                        {c.sent_at && <span className="ml-3">Sent: {new Date(c.sent_at).toLocaleDateString('lt-LT')}</span>}
                        {c.signed_at && <span className="ml-3">Signed: {new Date(c.signed_at).toLocaleDateString('lt-LT')}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {c.signing_status === 'draft' && (
                        <Button size="sm" variant="outline" onClick={() => sendContract(c)}>
                          <Send className="w-3.5 h-3.5 mr-1.5" /> Send
                        </Button>
                      )}
                      {c.signing_status === 'sent' && (
                        <Button size="sm" variant="outline" onClick={() => markSigned(c.id)} className="text-green-700 border-green-200 hover:bg-green-50">
                          <CheckCircle className="w-3.5 h-3.5 mr-1.5" /> Mark Signed
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
              <p className="text-gray-500">No templates yet. Create your first contract template.</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {templates.map((t) => (
                <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{t.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Default fee: {t.annual_fee_default ? `€${t.annual_fee_default}` : 'Not set'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEditTemplate(t)}>
                      <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit
                    </Button>
                    <button onClick={() => deleteTemplate(t.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Template dialog */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTemplate ? 'Edit Template' : 'New Template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Template Name *</Label>
                <Input value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} placeholder="Annual fee 2026" />
              </div>
              <div className="space-y-2">
                <Label>Default Annual Fee</Label>
                <Input type="number" step="0.01" value={tForm.annual_fee_default} onChange={(e) => setTForm({ ...tForm, annual_fee_default: e.target.value })} placeholder="500.00" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Contract Body</Label>
              <p className="text-xs text-gray-400">Available placeholders: {PLACEHOLDERS.join(', ')}</p>
              <Textarea
                value={tForm.body}
                onChange={(e) => setTForm({ ...tForm, body: e.target.value })}
                className="min-h-[300px] font-mono text-sm"
                placeholder="Enter contract template..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateOpen(false)}>Cancel</Button>
            <Button onClick={saveTemplate} disabled={saving || !tForm.name.trim()} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Saving...' : editTemplate ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create contract dialog */}
      <Dialog open={contractOpen} onOpenChange={setContractOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Contract</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Student *</Label>
                <Select value={cForm.student_id} onValueChange={onStudentSelect}>
                  <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                  <SelectContent>
                    {students.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Template</Label>
                <Select value={cForm.template_id} onValueChange={onTemplateSelect}>
                  <SelectTrigger><SelectValue placeholder="Select template" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Annual Fee *</Label>
              <Input type="number" step="0.01" value={cForm.annual_fee} onChange={(e) => setCForm({ ...cForm, annual_fee: e.target.value })} placeholder="500.00" />
            </div>
            <div className="space-y-2">
              <Label>Contract Body</Label>
              <Textarea
                value={cForm.filled_body}
                onChange={(e) => setCForm({ ...cForm, filled_body: e.target.value })}
                className="min-h-[250px] font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContractOpen(false)}>Cancel</Button>
            <Button onClick={createContract} disabled={saving || !cForm.student_id || !cForm.annual_fee} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Creating...' : 'Create Contract'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </SchoolLayout>
  );
}
