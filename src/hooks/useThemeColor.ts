import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

function getThemeColor(pathname: string): string {
  // Auth – dark indigo
  if (/^\/login$/.test(pathname)) return '#1e1b4b';
  if (/^\/auth\/callback/.test(pathname)) return '#1e1b4b';
  if (/^\/(registration\/subscription|tutor-subscribe)$/.test(pathname)) return '#1e1b4b';
  if (/^\/book\//.test(pathname)) return '#1e1b4b';

  // Company / school login – dark slate
  if (/^\/(company|school)\/login$/.test(pathname)) return '#0f172a';

  // Register
  if (/^\/register/.test(pathname)) return '#f3f4f6';
  if (/^\/parent-register/.test(pathname)) return '#ede9fe';

  // Admin
  if (/^\/admin/.test(pathname)) return '#020617';

  // Legal
  if (/\/(privacy-policy|terms|dpa)$/.test(pathname)) return '#f9fafb';

  // App routes – white headers
  if (/^\/(dashboard|calendar|students|waitlist|messages|finance|invoices|settings|lesson-settings|instructions)\b/.test(pathname)) return '#ffffff';
  if (/^\/student\b/.test(pathname)) return '#ffffff';
  if (/^\/(company|school)\//.test(pathname)) return '#ffffff';

  // Parent portal – warm off-white
  if (/^\/parent(\/|$)/.test(pathname)) return '#fffefc';

  // Success / cancelled
  if (/\/(stripe-success|package-success|school-payment-success|school-contract-complete)$/.test(pathname)) return '#ffffff';
  if (/\/package-cancelled$/.test(pathname)) return '#f9fafb';

  // Everything else: landing, marketing, blog, about, contact, pricing
  return '#f5f5f3';
}

export default function ThemeColorManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', getThemeColor(pathname));
  }, [pathname]);

  return null;
}
