import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreditCard, BarChart3, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';
import { useOrgEntityType } from '@/contexts/OrgEntityContext';
import CompanyFinance from './CompanyFinance';
import CompanyInvoices from './CompanyInvoices';
import CompanyPayments from './CompanyPayments';

type TabId = 'payments' | 'finance' | 'invoices';

export default function CompanyFinanceHub() {
  const { t } = useTranslation();
  const entityType = useOrgEntityType();
  const isSchool = entityType === 'school';
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs = useMemo(() => {
    const all: { id: TabId; label: string; icon: typeof CreditCard }[] = [];
    if (isSchool) {
      all.push({ id: 'payments', label: t('companyNav.payments'), icon: CreditCard });
    }
    all.push({ id: 'finance', label: t('companyNav.finance'), icon: BarChart3 });
    all.push({ id: 'invoices', label: t('companyNav.invoices'), icon: FileText });
    return all;
  }, [t, isSchool]);

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
      {activeTab === 'finance' && <CompanyFinance />}
      {activeTab === 'invoices' && <CompanyInvoices />}
    </div>
  );
}
