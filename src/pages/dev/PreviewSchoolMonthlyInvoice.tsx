import SchoolMonthlyInvoiceDialog, {
  type SchoolMonthlyInvoicePreview,
} from '@/components/school/SchoolMonthlyInvoiceDialog';
import { LAISVI_VAIKIAI_ORG_ID } from '@/lib/marketMoney';

const preview: SchoolMonthlyInvoicePreview = {
  previewToken: 'preview-only',
  student: { id: 'student-preview', fullName: 'Jonas Jonaitis', grade: '8' },
  periodLabel: '2026 m. rugsėjis',
  dueDate: '2026-10-08',
  lines: [
    {
      description: 'Matematika 8 kl. - mokytojas Gintaras',
      subjectId: 'math',
      tutorId: 'gintaras',
      quantity: 8,
      unitPriceEur: 6,
      originalAmountEur: 48,
      discountType: 'percent',
      discountValue: 25,
      discountAmountEur: 12,
      amountEur: 36,
    },
    {
      description: 'Lietuvių k. - mokytoja Alina',
      subjectId: 'lt',
      tutorId: 'alina',
      quantity: 3,
      unitPriceEur: 6,
      originalAmountEur: 18,
      discountType: 'percent',
      discountValue: 100,
      discountAmountEur: 18,
      amountEur: 0,
    },
  ],
  subtotalEur: 66,
  discountAmountEur: 30,
  totalEur: 36,
};

export default function PreviewSchoolMonthlyInvoice() {
  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-2xl bg-slate-900 p-6 text-white shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">VšĮ „Laisvi vaikai“ · /school/finance</p>
          <h1 className="mt-2 text-2xl font-bold">Mėnesinės užsiėmimų sąskaitos</h1>
          <p className="mt-2 text-sm text-slate-300">Produkcijos UI peržiūra prieš siunčiant sąskaitą mokėtojui.</p>
        </div>
      </div>
      <SchoolMonthlyInvoiceDialog
        open
        onOpenChange={() => undefined}
        organizationId={LAISVI_VAIKIAI_ORG_ID}
        students={[{ id: 'student-preview', fullName: 'Jonas Jonaitis', payerEmail: 'tevai@example.com' }]}
        previewFixture={preview}
      />
    </main>
  );
}
