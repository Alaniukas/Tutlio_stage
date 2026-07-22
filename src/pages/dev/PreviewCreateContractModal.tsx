import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
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
import { useTranslation } from '@/lib/i18n';
import { sortStudentsByFullName } from '@/lib/sortStudentsByFullName';

const discountedAnnualFee = (value: string): string => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '';
  return (Math.round(n * 0.8 * 100) / 100).toFixed(2);
};

const MOCK_STUDENTS = [
  { id: 's1', full_name: 'Aistė Jonaitė', grade: '3 klasė', payer_name: 'Jonas Jonaitis', payer_email: 'jonas@example.com', payer_phone: '+37060000001' },
  { id: 's2', full_name: 'Benas Petraitis', grade: '5 klasė', payer_name: 'Rasa Petraitienė', payer_email: 'rasa@example.com', payer_phone: '+37060000002' },
  { id: 's3', full_name: 'Emilija Kazlauskaitė', grade: '2 klasė', payer_name: 'Mindaugas Kazlauskas', payer_email: 'mindaugas@example.com', payer_phone: '+37060000003' },
  { id: 's4', full_name: 'Gabrielius Stankevičius', grade: '7 klasė', payer_name: 'Inga Stankevičienė', payer_email: 'inga@example.com', payer_phone: '+37060000004' },
  { id: 's5', full_name: 'Ieva Navickaitė', grade: '4 klasė', payer_name: 'Tomas Navickas', payer_email: 'tomas@example.com', payer_phone: '+37060000005' },
  { id: 's6', full_name: 'Jokūbas Malinauskas', grade: '6 klasė', payer_name: 'Eglė Malinauskienė', payer_email: 'egle@example.com', payer_phone: '+37060000006' },
  { id: 's7', full_name: 'Kamilė Urbonaitė', grade: '1 klasė', payer_name: 'Paulius Urbonas', payer_email: 'paulius@example.com', payer_phone: '+37060000007' },
  { id: 's8', full_name: 'Lukas Žukauskas', grade: '8 klasė', payer_name: 'Agnė Žukauskienė', payer_email: 'agne@example.com', payer_phone: '+37060000008' },
  { id: 's9', full_name: 'Maja Šimkutė', grade: '3 klasė', payer_name: 'Darius Šimkus', payer_email: 'darius@example.com', payer_phone: '+37060000009' },
  { id: 's10', full_name: 'Nojus Balčiūnas', grade: '5 klasė', payer_name: 'Gintarė Balčiūnienė', payer_email: 'gintare@example.com', payer_phone: '+37060000010' },
  { id: 's11', full_name: 'Ona Paulauskaitė', grade: '2 klasė', payer_name: 'Vytautas Paulauskas', payer_email: 'vytautas@example.com', payer_phone: '+37060000011' },
  { id: 's12', full_name: 'Rokas Jankauskas', grade: '9 klasė', payer_name: 'Jūratė Jankauskienė', payer_email: 'jurate@example.com', payer_phone: '+37060000012' },
];

const MOCK_TEMPLATES = [
  { id: 't1', name: 'Metinė sutartis – Priešmokyklinis ugdymas' },
  { id: 't2', name: 'Metinė sutartis – 1–4 klasės' },
];

export default function PreviewCreateContractModal() {
  const { t: tr } = useTranslation();
  const [open, setOpen] = useState(true);
  const [contractStudentSearch, setContractStudentSearch] = useState('');
  const [studentId, setStudentId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [annualFee, setAnnualFee] = useState('300');
  const [applyFeeDiscount, setApplyFeeDiscount] = useState(false);
  const [hasAdditionalFee, setHasAdditionalFee] = useState(false);
  const [additionalFeePurpose, setAdditionalFeePurpose] = useState('');
  const [additionalFeeAmount, setAdditionalFeeAmount] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentPersonalCode, setParentPersonalCode] = useState('');
  const [childBirthDate, setChildBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [parentsWillFillMissing, setParentsWillFillMissing] = useState(false);
  const [sendImmediately, setSendImmediately] = useState(true);
  const [paymentMode, setPaymentMode] = useState<'full' | 'installments'>('full');
  const [installmentRows, setInstallmentRows] = useState([{ amount: '', due_date: '' }]);

  const onStudentSelect = (id: string) => {
    setStudentId(id);
    setContractStudentSearch('');
    const student = MOCK_STUDENTS.find((s) => s.id === id);
    if (!student) return;
    setParentName(student.payer_name);
    setParentEmail(student.payer_email);
    setParentPhone(student.payer_phone);
  };

  const filteredStudents = contractStudentSearch
    ? sortStudentsByFullName(MOCK_STUDENTS).filter((s) =>
        (s.full_name || '').toLowerCase().includes(contractStudentSearch.trim().toLowerCase()),
      )
    : sortStudentsByFullName(MOCK_STUDENTS);

  return (
    <div className="min-h-screen bg-slate-900/90 p-4 sm:p-8">
      <div className="mx-auto max-w-xl space-y-4 text-white">
        <p className="text-sm text-slate-300">
          Peržiūros puslapis — „Nauja sutartis“ modalas (fake duomenys, be API). Atidarykite mokinio dropdown ir išbandykite paiešką.
        </p>
        {!open && (
          <button
            type="button"
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
            onClick={() => setOpen(true)}
          >
            Atidaryti modalą
          </button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{tr('school.newContractDialog')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{tr('school.studentName')}</Label>
                <Select
                  value={studentId}
                  onValueChange={onStudentSelect}
                >
                  <SelectTrigger><SelectValue placeholder={tr('school.selectStudent')} /></SelectTrigger>
                  <SelectContent className="max-h-72 overflow-y-auto">
                    <div
                      className="sticky top-0 z-10 bg-white p-2 border-b border-gray-100"
                      onPointerDown={(e) => e.preventDefault()}
                    >
                      <Input
                        value={contractStudentSearch}
                        onChange={(e) => setContractStudentSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        placeholder={tr('common.search')}
                        className="h-9 rounded-xl"
                      />
                    </div>
                    {filteredStudents.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name}{s.grade?.trim() ? ` — ${s.grade.trim()}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {studentId && (
                  <p className="text-xs text-gray-500">
                    {MOCK_STUDENTS.find((s) => s.id === studentId)?.grade
                      ? `Klasė: ${MOCK_STUDENTS.find((s) => s.id === studentId)?.grade}`
                      : 'Klasė nenurodyta (galite priskirti mokinių sąraše).'}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>{tr('school.templateLabel')}</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger><SelectValue placeholder={tr('school.selectTemplate')} /></SelectTrigger>
                  <SelectContent>
                    {MOCK_TEMPLATES.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>{tpl.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Sutarties numeris</Label>
              <Input value={contractNumber} onChange={(e) => setContractNumber(e.target.value)} placeholder="Pvz. SUT-2026-001" />
              <p className="text-xs text-gray-500">Jei neįrašysite, numeris bus sugeneruotas automatiškai.</p>
            </div>

            <div className="space-y-2">
              <Label>{tr('school.annualFeeStar')}</Label>
              <Input type="number" min="0" step="0.01" value={annualFee} onChange={(e) => setAnnualFee(e.target.value)} placeholder="300" />
              <p className="text-xs text-gray-500">
                Numatytoji suma — 300 EUR. Galite įrašyti ir 0 EUR. Įrašyta suma bus naudojama sutartyje ir mokėjimuose.
              </p>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={applyFeeDiscount}
                  onChange={(e) => setApplyFeeDiscount(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-emerald-600"
                />
                Taikyti 20% nuolaidą
              </label>
              {applyFeeDiscount && discountedAnnualFee(annualFee) && (
                <p className="text-xs font-medium text-emerald-700">
                  Su nuolaida: {discountedAnnualFee(annualFee)} EUR — ši suma bus įrašyta sutartyje ir mokėjimuose.
                </p>
              )}
            </div>

            <div className="space-y-3 rounded-xl border border-gray-200 p-3">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={hasAdditionalFee}
                  onChange={(e) => setHasAdditionalFee(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-emerald-600"
                />
                Papildomas mokestis
              </label>
              {hasAdditionalFee && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Paskirtis</Label>
                    <Input value={additionalFeePurpose} onChange={(e) => setAdditionalFeePurpose(e.target.value)} placeholder="Pvz. administravimo mokestis" />
                  </div>
                  <div className="space-y-2">
                    <Label>Suma (EUR)</Label>
                    <Input type="number" step="0.01" value={additionalFeeAmount} onChange={(e) => setAdditionalFeeAmount(e.target.value)} placeholder="50.00" />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{tr('compStu.parentFullNameRequired')}</Label>
                <Input value={parentName} onChange={(e) => setParentName(e.target.value)} placeholder={tr('compStu.parentNamePlaceholder')} />
              </div>
              <div className="space-y-2">
                <Label>{tr('compStu.parentEmailRequired')}</Label>
                <Input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} placeholder="tevai@example.com" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Tėvų tel. nr.</Label>
                <Input value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} placeholder="+370 600 00000" />
              </div>
              <div className="space-y-2">
                <Label>Tėvų asmens kodas</Label>
                <Input value={parentPersonalCode} onChange={(e) => setParentPersonalCode(e.target.value)} placeholder="Asmens kodas" />
              </div>
              <div className="space-y-2">
                <Label>Vaiko gimimo data</Label>
                <DateInput value={childBirthDate} onChange={(e) => setChildBirthDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Gyvenamoji vieta</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Miestas, gatvė, namo nr." />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={parentsWillFillMissing} onChange={(e) => setParentsWillFillMissing(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-emerald-600" />
              Tėvai užpildys trūkstamus duomenis po sutarties gavimo
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={sendImmediately} onChange={(e) => setSendImmediately(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-emerald-600" />
              {tr('school.sendContractImmediately')}
            </label>

            <div className="space-y-2">
              <Label>{tr('school.paymentPlan')}</Label>
              <Select value={paymentMode} onValueChange={(v: 'full' | 'installments') => setPaymentMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
                      <Input type="number" step="0.01" value={row.amount} onChange={(e) => setInstallmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, amount: e.target.value } : r)))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{tr('school.dueDateField')}</Label>
                      <DateInput value={row.due_date} onChange={(e) => setInstallmentRows((prev) => prev.map((r, i) => (i === idx ? { ...r, due_date: e.target.value } : r)))} />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{tr('school.cancel')}</Button>
            <Button
              onClick={() => window.alert('Peržiūra: sutartis nekuria (be API)')}
              disabled={!studentId || annualFee.trim() === ''}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {tr('school.createContract')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
