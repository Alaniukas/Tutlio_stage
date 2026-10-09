import { lazy, Suspense, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, BarChart3, FileText, Receipt, FileSpreadsheet, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { useOrgEntityType } from '@/contexts/OrgEntityContext';
import { useOptionalOrgAdminAccess } from '@/contexts/OrgAdminAccessContext';
import { isProKlaseOrg } from '@/lib/marketMoney';
import CompanyFinance from './CompanyFinance';
import CompanyInvoices from './CompanyInvoices';
import CompanyPayments from './CompanyPayments';
import CompanyPlatformInvoices from './CompanyPlatformInvoices';
import CompanySchoolFinanceReport from './CompanySchoolFinanceReport';

const CompanyTutorFinance = lazy(() => import('./CompanyTutorFinance'));

type TabId = 'payments' | 'report' | 'finance' | 'invoices' | 'billing' | 'tutor-finance';

export default function CompanyFinanceHub() {
  const { t } = useTranslation();
  const entityType = useOrgEntityType();
  const isSchool = entityType === 'school';
  const access = useOptionalOrgAdminAccess();
  const showTutorFinance = !isSchool && isProKlaseOrg(access?.membership?.organizationId)
    && access?.can('finance.view') === true;
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = useMemo(() => {
    const all: { id: TabId; label: string; icon: typeof CreditCard }[] = [];
    if (isSchool) {
      all.push({ id: 'payments', label: t('companyNav.payments'), icon: CreditCard });
      all.push({ id: 'report', label: t('companyNav.financeReport'), icon: FileSpreadsheet });
    }
    all.push({ id: 'finance', label: t('companyNav.finance'), icon: BarChart3 });
    all.push({ id: 'invoices', label: t('companyNav.invoices'), icon: FileText });
    if (!isSchool) {
      all.push({ id: 'billing', label: t('companyNav.tutlioInvoices'), icon: Receipt });
    }
    if (showTutorFinance) all.push({ id: 'tutor-finance', label: t('companyNav.tutorFinance'), icon: Users });
    return all;
  }, [t, isSchool, showTutorFinance]);

  const defaultTab = isSchool ? 'payments' : 'finance';
  const raw = searchParams.get('tab') as TabId | null;
  const hasStripeReturn = searchParams.has('stripe');
  const activeTab: TabId = raw && tabs.some((tb) => tb.id === raw)
    ? raw
    : hasStripeReturn ? 'finance' : defaultTab;

  const switchTab = (id: TabId) => {
    setSearchParams({ tab: id }, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 bg-white rounded-t-xl px-2">
        <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Finance tabs">
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                  active
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
                )}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === 'payments' && isSchool && <CompanyPayments />}
      {activeTab === 'report' && isSchool && <CompanySchoolFinanceReport />}
      {activeTab === 'finance' && <CompanyFinance />}
      {activeTab === 'invoices' && <CompanyInvoices />}
      {activeTab === 'billing' && !isSchool && <CompanyPlatformInvoices />}
      {activeTab === 'tutor-finance' && showTutorFinance && (
        <Suspense fallback={<p className="text-sm text-gray-500">{t('common.loadingDots')}</p>}>
          <CompanyTutorFinance />
        </Suspense>
      )}
    </div>
  );
}
