import { useEffect, useState } from 'react';
import StudentLayout from '@/components/StudentLayout';
import { supabase } from '@/lib/supabase';
import { dedupeAuthGetUser, rpcGetStudentProfilesDeduped } from '@/lib/preload';
import { useTranslation } from '@/lib/i18n';
import { currentMarket } from '@/lib/market';
import { formatMarketAmount } from '@/lib/stripeLessonPricing';
import { CreditCard, FileText, Loader2, Package, CheckCircle, Landmark } from 'lucide-react';

type PackageRow = {
  id: string;
  total_lessons: number;
  available_lessons: number;
  total_price: number | null;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
  payment_status: string | null;
  payment_method: string | null;
  extras_period_start?: string | null;
  billing_period_start?: string | null;
  billing_period_end?: string | null;
  lesson_package_items?: Array<{ subjects?: { name?: string | null } | { name?: string | null }[] | null }> | null;
  subject?: { name?: string | null } | null;
};

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  total_amount: number | null;
  created_at: string;
  pdf_storage_path: string | null;
};

function packageLabel(pkg: PackageRow): string {
  const items = Array.isArray(pkg.lesson_package_items) ? pkg.lesson_package_items : [];
  const names = items
    .map((it) => {
      const subj = Array.isArray(it.subjects) ? it.subjects[0] : it.subjects;
      return subj?.name || null;
    })
    .filter(Boolean) as string[];
  if (names.length > 0) return names.join(', ');
  return pkg.subject?.name || 'Pamokų paketas';
}

/**
 * Student "Mokėjimai" page (org feature student_payments_page): unpaid
 * packages with a pay button + payment history + issued invoices.
 */
export default function StudentPayments() {
  const { t } = useTranslation();
  const market = currentMarket();
  const fmt = (amount: number | null | undefined) => formatMarketAmount(amount, market);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PackageRow[]>([]);
  const [history, setHistory] = useState<PackageRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await dedupeAuthGetUser();
        if (!user || cancelled) return;
        const { data: profileRows } = await rpcGetStudentProfilesDeduped(user.id, null);
        const studentIds = ((profileRows || []) as Array<{ id: string }>).map((row) => row.id);
        if (studentIds.length === 0) {
          if (!cancelled) setLoading(false);
          return;
        }

        const [{ data: pkgRows }, { data: invoiceRows }] = await Promise.all([
          supabase
            .from('lesson_packages')
            .select('id, total_lessons, available_lessons, total_price, paid, paid_at, created_at, payment_status, payment_method, extras_period_start, billing_period_start, billing_period_end, subject:subjects(name), lesson_package_items(subjects(name))')
            .in('student_id', studentIds)
            .order('created_at', { ascending: false })
            .limit(100),
          supabase
            .from('invoices')
            .select('id, invoice_number, total_amount, created_at, pdf_storage_path')
            .order('created_at', { ascending: false })
            .limit(50),
        ]);
        if (cancelled) return;

        const packages = ((pkgRows || []) as any[]).map((row) => ({
          ...row,
          subject: Array.isArray(row.subject) ? row.subject[0] ?? null : row.subject ?? null,
        })) as PackageRow[];
        setPending(packages.filter((pkg) => !pkg.paid && pkg.payment_status === 'pending'));
        setHistory(packages.filter((pkg) => pkg.paid));
        setInvoices((invoiceRows || []) as InvoiceRow[]);
      } catch (err) {
        console.error('[StudentPayments] load failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openInvoicePdf = async (invoice: InvoiceRow) => {
    if (!invoice.pdf_storage_path) return;
    const { data } = await supabase.storage.from('invoices').createSignedUrl(invoice.pdf_storage_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <StudentLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[var(--org-brand)]" />
            {t('stuPay.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{t('stuPay.subtitle')}</p>
        </div>

        {loading ? (
          <div className="text-center py-10">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-400" />
          </div>
        ) : (
          <>
            {/* Pending payments */}
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{t('stuPay.pendingTitle')}</h2>
              {pending.length === 0 ? (
                <p className="text-sm text-gray-400 bg-gray-50 rounded-2xl p-4 text-center">{t('stuPay.pendingEmpty')}</p>
              ) : (
                pending.map((pkg) => (
                  <div key={pkg.id} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-amber-600 shrink-0" />
                        {packageLabel(pkg)}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {t('stuPay.lessonsCount', { count: String(pkg.total_lessons) })}
                        {pkg.total_price != null && <> · <span className="font-semibold">{fmt(Number(pkg.total_price))}</span></>}
                      </p>
                    </div>
                    {pkg.payment_method === 'manual' ? (
                      <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 shrink-0">
                        <Landmark className="w-3.5 h-3.5" />
                        {t('stuPay.manualTransfer')}
                      </span>
                    ) : (
                      <a
                        href={`/api/pay-package?package=${pkg.id}`}
                        className="inline-flex items-center rounded-xl bg-[var(--org-brand)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 shrink-0"
                      >
                        {t('stuPay.payNow')}
                      </a>
                    )}
                  </div>
                ))
              )}
            </section>

            {/* Payment history */}
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{t('stuPay.historyTitle')}</h2>
              {history.length === 0 ? (
                <p className="text-sm text-gray-400 bg-gray-50 rounded-2xl p-4 text-center">{t('stuPay.historyEmpty')}</p>
              ) : (
                history.map((pkg) => (
                  <div key={pkg.id} className="rounded-2xl border border-gray-100 bg-white p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{packageLabel(pkg)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {t('stuPay.lessonsCount', { count: String(pkg.total_lessons) })}
                        {pkg.paid_at && <> · {new Date(pkg.paid_at).toLocaleDateString('lt-LT')}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {pkg.total_price != null && (
                        <span className="text-sm font-semibold text-gray-900">{fmt(Number(pkg.total_price))}</span>
                      )}
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                        <CheckCircle className="w-3 h-3" /> {t('stuPay.paidBadge')}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </section>

            {/* Invoices */}
            {invoices.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{t('stuPay.invoicesTitle')}</h2>
                {invoices.map((invoice) => (
                  <button
                    key={invoice.id}
                    type="button"
                    onClick={() => void openInvoicePdf(invoice)}
                    disabled={!invoice.pdf_storage_path}
                    className="w-full rounded-2xl border border-gray-100 bg-white p-4 flex items-center justify-between gap-3 text-left hover:border-[color-mix(in_srgb,var(--org-brand)_35%,#e5e7eb)] disabled:cursor-default"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{invoice.invoice_number || t('stuPay.invoiceFallback')}</p>
                        <p className="text-xs text-gray-500">{new Date(invoice.created_at).toLocaleDateString('lt-LT')}</p>
                      </div>
                    </div>
                    {invoice.total_amount != null && (
                      <span className="text-sm font-semibold text-gray-900 shrink-0">{fmt(Number(invoice.total_amount))}</span>
                    )}
                  </button>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </StudentLayout>
  );
}
