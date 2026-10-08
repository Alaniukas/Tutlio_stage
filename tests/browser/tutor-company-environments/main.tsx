import './backend';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LocaleProvider } from '@/contexts/LocaleContext';
import { UserProvider } from '@/contexts/UserContext';
import { OrgBrandingProvider } from '@/contexts/OrgBrandingContext';
import Dashboard from '@/pages/Dashboard';
import Calendar from '@/pages/Calendar';
import Students from '@/pages/Students';
import Finance from '@/pages/Finance';
import Settings from '@/pages/Settings';
import './qa.css';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter><LocaleProvider><UserProvider accountChangePath="/dashboard"><OrgBrandingProvider scope="tutor">
    <div className="fixed bottom-1 left-1 z-[100] rounded bg-amber-100 px-2 py-1 text-[10px] text-amber-950 pointer-events-none">TESTINIAI DUOMENYS · be ryšio su produkcija</div>
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} /><Route path="/calendar" element={<Calendar />} />
      <Route path="/students" element={<Students />} /><Route path="/finance" element={<Finance />} />
      <Route path="/settings" element={<Settings />} /><Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  </OrgBrandingProvider></UserProvider></LocaleProvider></BrowserRouter>,
);
