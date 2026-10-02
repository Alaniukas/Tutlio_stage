import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import OrgTutorFinanceSummary from '@/components/OrgTutorFinanceSummary';
import InvoicesPage from '@/pages/Invoices';
import { loadLocaleDict } from '@/lib/i18n';
import { installFixtureFetch, organization } from './fixtures';
import './styles.css';

installFixtureFetch();
await loadLocaleDict('lt');
createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <main className="max-w-3xl mx-auto">
        <p className="text-sm text-gray-500 mb-2">Testiniai duomenys · {organization.name}</p>
        <h1 className="text-2xl font-bold mb-6">Finansai</h1>
        <Routes>
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="*" element={<OrgTutorFinanceSummary />} />
        </Routes>
      </main>
    </div>
  </BrowserRouter>,
);
