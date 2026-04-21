import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getCached, setCache, invalidateCache } from '@/lib/dataCache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Plus, CreditCard, Send, CheckCircle, Clock, AlertCircle, Trash2, Loader2 } from 'lucide-react';
import Toast from '@/components/Toast';
import { authHeaders } from '@/lib/apiHelpers';
import { sendEmail } from '@/lib/email';
import { useTranslation } from '@/lib/i18n';

interface Contract {
  id: string;
  student_id: string;
  annual_fee: number;
  signing_status: string;
  student?: { full_name: string; email: string; payer_email: string | null; payer_name: string | null };
}

interface Installment {
  id: string;
  contract_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  payment_status: 'pending' | 'paid' | 'overdue' | 'failed';
  stripe_checkout_session_id: string | null;
  paid_at: string | null;
  created_at: string;
  contract?: Contract;
}

interface NewInstallmentRow {
  amount: string;
  due_date: string;
}

const PAYMENTS_CACHE_KEY = 'company_payments';

export default function CompanyPayments() {
  const { t } = useTranslation();
  const pc = getCached<any>(PAYMENTS_CACHE_KEY);
  const [orgId, setOrgId] = useState<string | null>(pc?.orgId ?? null);
  const [orgName, setOrgName] = useState(pc?.orgName ?? '');
  const [orgEmail, setOrgEmail] = useState(pc?.orgEmail ?? '');
  const [contracts, setContracts] = useState<Contract[]>(pc?.contracts ?? []);
  const [installments, setInstallments] = useState<Installment[]>(pc?.installments ?? []);
  const [loading, setLoading] = useState(!pc);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedContractId, setSelectedContractId] = useState('');
  const [rows, setRows] = useState<NewInstallmentRow[]>([{ amount: '', due_date: '' }]);
  const [saving, setSaving] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => { if (!getCached(PAYMENTS_CACHE_KEY)) load(); }, []);

  const load = async () => {
    if (!getCached(PAYMENTS_CACHE_KEY)) setLoading(true);
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

    const [cRes, iRes] = await Promise.all([
      supabase
        .from('school_contracts')
        .select('id, student_id, annual_fee, signing_status, student:students(full_name, email, payer_email, payer_name)')
        .eq('organization_id', admin.organization_id)
        .eq('signing_status', 'signed')
        .order('created_at', { ascending: false }),
      supabase
        .from('school_payment_installments')
        .select('*, contract:school_contracts(id, student_id, annual_fee, signing_status, organization_id, student:students(full_name, email, payer_email, payer_name))')
        .order('due_date', { ascending: true }),
    ]);

    const cData = cRes.data || [];
    const filtered = (iRes.data || []).filter((i: any) => i.contract?.organization_id === admin.organization_id);
    setContracts(cData);
    setInstallments(filtered);
    setCache(PAYMENTS_CACHE_KEY, { orgId: admin.organization_id, orgName: name, orgEmail: email, contracts: cData, installments: filtered });
    setLoading(false);
  };

  const reload = () => { invalidateCache(PAYMENTS_CACHE_KEY); load(); };

  const addRow = () => setRows([...rows, { amount: '', due_date: '' }]);
  const removeRow = (idx: number) => setRows(rows.filter((_, i) => i !== idx));
  const updateRow = (idx: number, field: keyof NewInstallmentRow, value: string) => {
    setRows(rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };

  const autoSplit = () => {
    const contract = contracts.find((c) => c.id === selectedContractId);
    if (!contract || rows.length === 0) return;
    const totalFee = Number(contract.annual_fee);
    const count = rows.length;
    const perInstallment = Math.floor((totalFee / count) * 100) / 100;
    const remainder = Math.round((totalFee - perInstallment * count) * 100) / 100;
    setRows(rows.map((r, i) => ({
      ...r,
      amount: (i === 0 ? perInstallment + remainder : perInstallment).toFixed(2),
    })));
  };

  const createSchedule = async () => {
    if (!selectedContractId || rows.some((r) => !r.amount || !r.due_date)) return;
    setSaving(true);

    const inserts = rows.map((r, i) => ({
      contract_id: selectedContractId,
      installment_number: i + 1,
      amount: Number(r.amount),
      due_date: r.due_date,
    }));

    const { error } = await supabase.from('school_payment_installments').insert(inserts);
    setSaving(false);
    if (error) { setToast({ message: error.message, type: 'error' }); return; }
    setScheduleOpen(false);
    setRows([{ amount: '', due_date: '' }]);
    setSelectedContractId('');
    setToast({ message: t('school.toastScheduleCreated'), type: 'success' });
    reload();
  };

  const sendPaymentLink = async (installment: Installment) => {
    setSendingId(installment.id);
    try {
      const hdrs = await authHeaders();
      const resp = await fetch('/api/create-school-installment-checkout', {
        method: 'POST',
        headers: { ...hdrs, 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId: installment.id }),
      });

      const json = await resp.json();
      if (!resp.ok) {
        setToast({ message: json.error || t('school.toastPaymentError'), type: 'error' });
        setSendingId(null);
        return;
      }

      const contract = installment.contract as any;
      const student = contract?.student;
      const recipient = student?.payer_email || student?.email;

      if (recipient && json.url) {
        const totalInstallments = installments.filter((i) => i.contract_id === installment.contract_id).length;
        await sendEmail({
          type: 'school_installment_request',
          to: recipient,
          data: {
            schoolName: orgName,
            schoolEmail: orgEmail,
            studentName: student?.full_name || '',
            parentName: student?.payer_name || student?.full_name || '',
            recipientName: student?.payer_name || student?.full_name || '',
            installmentNumber: installment.installment_number,
            totalInstallments,
            amount: Number(installment.amount).toFixed(2),
            dueDate: new Date(installment.due_date).toLocaleDateString('lt-LT'),
            paymentUrl: json.url,
          },
        });
        setToast({ message: t('school.toastPaymentLinkSent'), type: 'success' });
      } else {
        window.open(json.url, '_blank');
        setToast({ message: t('school.toastCheckoutCreated'), type: 'success' });
      }
    } catch {
      setToast({ message: t('school.toastPaymentError'), type: 'error' });
    }
    setSendingId(null);
  };

  const deleteInstallment = async (id: string) => {
    if (!confirm(t('school.confirmDeleteInstallment'))) return;
    await supabase.from('school_payment_installments').delete().eq('id', id);
    setInstallments((prev) => prev.filter((i) => i.id !== id));
  };

  const statusBadge = (s: Installment['payment_status']) => {
    const map = {
      pending: { label: t('school.payStatusPending'), cls: 'bg-gray-100 text-gray-600', icon: Clock },
      paid: { label: t('school.payStatusPaid'), cls: 'bg-green-50 text-green-700', icon: CheckCircle },
      overdue: { label: t('school.payStatusOverdue'), cls: 'bg-red-50 text-red-700', icon: AlertCircle },
      failed: { label: t('school.payStatusFailed'), cls: 'bg-red-50 text-red-700', icon: AlertCircle },
    };
    const { label, cls, icon: Icon } = map[s];
    return <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}><Icon className="w-3 h-3" />{label}</span>;
  };

  const grouped = installments.reduce<Record<string, Installment[]>>((acc, i) => {
    const key = i.contract_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(i);
    return acc;
  }, {});

  return (
    <>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('school.paymentsTitle')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('school.paymentsSubtitle')}</p>
          </div>
          <Button onClick={() => { setScheduleOpen(true); setSelectedContractId(''); setRows([{ amount: '', due_date: '' }]); }} className="bg-emerald-600 hover:bg-emerald-700" disabled={contracts.length === 0}>
            <Plus className="w-4 h-4 mr-2" /> {t('school.newSchedule')}
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-20">
            <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {contracts.length === 0
                ? t('school.noPaymentsNoContracts')
                : t('school.noPaymentsYet')}
            </p>
          </div>
        ) : (
          Object.entries(grouped).map(([contractId, items]) => {
            const contract = items[0]?.contract as any;
            const student = contract?.student;
            const totalPaid = items.filter((i) => i.payment_status === 'paid').reduce((s, i) => s + Number(i.amount), 0);
            const totalDue = items.reduce((s, i) => s + Number(i.amount), 0);

            return (
              <div key={contractId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-gray-900">{student?.full_name || '—'}</p>
                      <p className="text-sm text-gray-500">
                        {t('school.annualFeeLine')} &euro;{Number(contract?.annual_fee || 0).toFixed(2)} &middot;
                        {t('school.paidProgress')} &euro;{totalPaid.toFixed(2)} / &euro;{totalDue.toFixed(2)}
                      </p>
                    </div>
                    <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${totalDue > 0 ? (totalPaid / totalDue) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {items.map((inst) => (
                    <div key={inst.id} className="px-5 py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="text-sm font-medium text-gray-700 w-6 text-center">#{inst.installment_number}</span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">&euro;{Number(inst.amount).toFixed(2)}</p>
                          <p className="text-xs text-gray-400">{t('school.dueLabel')} {new Date(inst.due_date).toLocaleDateString('lt-LT')}</p>
                        </div>
                        {statusBadge(inst.payment_status)}
                        {inst.paid_at && <span className="text-xs text-gray-400">{t('school.paidLabel')} {new Date(inst.paid_at).toLocaleDateString('lt-LT')}</span>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {inst.payment_status === 'pending' && (
                          <Button size="sm" variant="outline" onClick={() => sendPaymentLink(inst)} disabled={sendingId === inst.id}>
                            {sendingId === inst.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <Send className="w-3.5 h-3.5 mr-1.5" />}
                            {t('school.sendLink')}
                          </Button>
                        )}
                        {inst.payment_status !== 'paid' && (
                          <button onClick={() => deleteInstallment(inst.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('school.createScheduleTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('school.contractSignedStar')}</Label>
              <Select value={selectedContractId} onValueChange={setSelectedContractId}>
                <SelectTrigger><SelectValue placeholder={t('school.selectContract')} /></SelectTrigger>
                <SelectContent>
                  {contracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.student?.full_name || '—'} — &euro;{Number(c.annual_fee).toFixed(2)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-700">{t('school.installments')}</p>
              <div className="flex items-center gap-2">
                {selectedContractId && (
                  <Button size="sm" variant="ghost" onClick={autoSplit} className="text-xs">
                    {t('school.autoSplit')}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={addRow}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> {t('school.add')}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {rows.map((row, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <span className="text-sm text-gray-400 font-medium w-6 text-center pb-2">#{idx + 1}</span>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">{t('school.amount')}</Label>
                    <Input type="number" step="0.01" value={row.amount} onChange={(e) => updateRow(idx, 'amount', e.target.value)} placeholder="100.00" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">{t('school.dueDateField')}</Label>
                    <Input type="date" value={row.due_date} onChange={(e) => updateRow(idx, 'due_date', e.target.value)} />
                  </div>
                  {rows.length > 1 && (
                    <button onClick={() => removeRow(idx)} className="p-2 text-gray-400 hover:text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {selectedContractId && rows.length > 0 && (
              <div className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
                {t('school.scheduleTotal', {
                  sum: rows.reduce((s, r) => s + (Number(r.amount) || 0), 0).toFixed(2),
                  annual: Number(contracts.find((c) => c.id === selectedContractId)?.annual_fee || 0).toFixed(2),
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>{t('school.cancel')}</Button>
            <Button
              onClick={createSchedule}
              disabled={saving || !selectedContractId || rows.some((r) => !r.amount || !r.due_date)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? t('school.creatingSchedule') : t('school.createSchedule')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
