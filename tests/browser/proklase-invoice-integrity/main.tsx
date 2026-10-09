import { createRoot } from 'react-dom/client';
import CompanyInvoices from '@/pages/company/CompanyInvoices';
import { loadLocaleDict } from '@/lib/i18n';
import { installFixtureFetch } from './fixtures';
import '../org-tutor-invoice-privacy/styles.css';

installFixtureFetch();
await loadLocaleDict('lt');
createRoot(document.getElementById('root')!).render(
  <main className="min-h-screen bg-gray-50 p-4 sm:p-8"><CompanyInvoices /></main>,
);
