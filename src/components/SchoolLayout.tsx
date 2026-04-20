import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { buildPlatformPath } from '@/lib/platform';
import {
  LayoutDashboard,
  GraduationCap,
  FileText,
  CreditCard,
  Settings,
  LogOut,
  School,
  Menu,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

export default function SchoolLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const navItems = useMemo(
    () => [
      { href: '/school', label: t('school.navOverview'), icon: LayoutDashboard, exact: true },
      { href: '/school/students', label: t('school.navStudents'), icon: GraduationCap },
      { href: '/school/contracts', label: t('school.navContracts'), icon: FileText },
      { href: '/school/payments', label: t('school.navPayments'), icon: CreditCard },
      { href: '/school/settings', label: t('school.navSettings'), icon: Settings },
    ],
    [t],
  );
  const location = useLocation();
  const [schoolName, setSchoolName] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('school_admins')
        .select('school_id, schools(name)')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) setSchoolName((data.schools as any)?.name || '');
    })();
  }, []);

  const handleLogout = async () => {
    sessionStorage.setItem('tutlio_logout_intent', '1');
    void supabase.auth.signOut({ scope: 'global' });
    void supabase.auth.signOut({ scope: 'local' });
    Object.keys(localStorage)
      .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
      .forEach((k) => localStorage.removeItem(k));
    window.location.href = `${window.location.origin}${buildPlatformPath('/login')}`;
  };

  const isActive = (item: (typeof navItems)[0]) =>
    item.exact ? location.pathname === item.href : location.pathname.startsWith(item.href);

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className={cn('flex flex-col h-full min-h-0', mobile && 'pt-4')}>
      <div className="px-6 py-5 flex items-center gap-3 border-b border-emerald-800 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
          <School className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-emerald-300/60 font-medium leading-none mb-0.5">{t('school.brandSubtitle')}</p>
          <p className="text-sm font-semibold text-white truncate">{schoolName || '...'}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
              isActive(item)
                ? 'bg-white/15 text-white'
                : 'text-emerald-300/60 hover:text-white hover:bg-white/10',
            )}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {item.label}
          </Link>
        ))}
      </div>

      <div className="px-3 pb-4 border-t border-emerald-800 pt-3 flex-shrink-0 bg-emerald-950">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-emerald-300/60 hover:text-white hover:bg-white/10 transition-colors w-full"
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {t('common.logout')}
        </button>
      </div>
    </nav>
  );

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#f4f5f9]">
      <div className="flex min-h-0 flex-1">
        <aside className="hidden lg:flex w-60 flex-shrink-0 flex-col bg-emerald-950">
          <Sidebar />
        </aside>

        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
            <aside className="relative z-50 flex h-dvh w-64 flex-col bg-emerald-950">
              <div className="flex flex-shrink-0 justify-end p-3">
                <button onClick={() => setMobileOpen(false)} className="text-emerald-300/60 hover:text-white p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation rounded-xl">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1">
                <Sidebar mobile />
              </div>
            </aside>
          </div>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="lg:hidden flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="text-gray-500 hover:text-gray-700 p-2.5 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <School className="w-5 h-5 text-emerald-700" />
              <span className="text-sm font-semibold text-gray-900 truncate">{schoolName}</span>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
