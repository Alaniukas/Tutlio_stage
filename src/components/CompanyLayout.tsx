import { useState, useEffect, useMemo } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { getCached } from '@/lib/dataCache';
import { preloadOrgAdminData } from '@/lib/preload';
import { buildPlatformPath } from '@/lib/platform';
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  BookOpen,
  HelpCircle,
  BarChart3,
  LogOut,
  Building2,
  Menu,
  X,
  GraduationCap,
  Settings,
  CreditCard,
  MessageSquare,
  FileText,
  School,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import OrgSuspendedBanner from '@/components/OrgSuspendedBanner';
import { useTranslation } from '@/lib/i18n';
import { useTotalChatUnread } from '@/hooks/useChat';
import { OrgEntityProvider, type OrgEntityType } from '@/contexts/OrgEntityContext';

export default function CompanyLayout() {
  const { t } = useTranslation();
  const chatUnreadTotal = useTotalChatUnread();
  const location = useLocation();
  const orgBasePath = location.pathname.startsWith('/school') ? '/school' : '/company';
  const ENTITY_KEY = 'tutlio_entity_type';
  const dashCache = getCached<any>('company_dashboard');
  const [orgName, setOrgName] = useState(dashCache?.orgName ?? '');
  const [entityType, setEntityTypeRaw] = useState<OrgEntityType>(() => {
    const stored = sessionStorage.getItem(ENTITY_KEY);
    if (stored === 'school' || stored === 'company') return stored;
    return (dashCache?.entityType as OrgEntityType) || 'company';
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  const setEntityType = (et: OrgEntityType) => {
    setEntityTypeRaw(et);
    sessionStorage.setItem(ENTITY_KEY, et);
  };

  const isSchool = entityType === 'school';
  const BrandIcon = isSchool ? School : Building2;
  const brandLabel = isSchool ? t('layout.tutlioSchool') : t('layout.tutlioCompany');

  const NAV_ITEMS = useMemo(() => {
    const base = [
      { href: `${orgBasePath}`, label: t('companyNav.overview'), icon: LayoutDashboard, exact: true },
      { href: `${orgBasePath}/tutors`, label: isSchool ? t('companyNav.teachers') : t('companyNav.tutors'), icon: Users },
      { href: `${orgBasePath}/students`, label: t('companyNav.students'), icon: GraduationCap },
      { href: `${orgBasePath}/sessions`, label: t('companyNav.sessions'), icon: BookOpen },
      { href: `${orgBasePath}/schedule`, label: t('companyNav.schedule'), icon: CalendarDays },
      { href: `${orgBasePath}/messages`, label: t('companyNav.messages'), icon: MessageSquare },
      { href: `${orgBasePath}/stats`, label: t('companyNav.stats'), icon: BarChart3 },
      { href: `${orgBasePath}/settings`, label: t('companyNav.lessonSettings'), icon: Settings },
    ];
    if (isSchool) {
      base.push({ href: `${orgBasePath}/contracts`, label: t('companyNav.contracts'), icon: FileText });
    }
    base.push(
      { href: `${orgBasePath}/finance`, label: t('companyNav.finance'), icon: CreditCard },
      { href: `${orgBasePath}/instructions`, label: t('companyNav.instructions'), icon: HelpCircle },
    );
    return base;
  }, [t, isSchool, orgBasePath]);

  useEffect(() => {
    let cancelled = false;
    preloadOrgAdminData().then(() => {
      if (cancelled) return;
      const dc = getCached<any>('company_dashboard');
      if (dc?.orgName && !orgName) setOrgName(dc.orgName);
      if (dc?.entityType) setEntityType(dc.entityType);
    });
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from('organization_admins')
        .select('organization_id, organizations(name, entity_type)')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data && !cancelled) {
        const name = (data.organizations as any)?.name || '';
        const et = ((data.organizations as any)?.entity_type as OrgEntityType) || 'company';
        if (name && !orgName) setOrgName(name);
        setEntityType(et);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    sessionStorage.removeItem(ENTITY_KEY);
    sessionStorage.setItem('tutlio_logout_intent', '1');
    void supabase.auth.signOut({ scope: 'global' });
    void supabase.auth.signOut({ scope: 'local' });
    Object.keys(localStorage)
      .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
      .forEach((k) => localStorage.removeItem(k));
    window.location.href = `${window.location.origin}${buildPlatformPath('/login')}`;
  };

  const isActive = (item: (typeof NAV_ITEMS)[0]) =>
    item.exact ? location.pathname === item.href : location.pathname.startsWith(item.href);

  const sidebarBg = isSchool ? 'bg-emerald-950' : 'bg-slate-900';
  const borderColor = isSchool ? 'border-emerald-800' : 'border-slate-700';
  const inactiveText = isSchool ? 'text-emerald-300/60' : 'text-slate-400';
  const headerIconColor = isSchool ? 'text-emerald-700' : 'text-slate-700';

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className={cn('flex flex-col h-full min-h-0', mobile && 'pt-4')}>
      <div className={cn('px-6 py-5 flex items-center gap-3 border-b flex-shrink-0', borderColor)}>
        <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
          <BrandIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className={cn('text-xs font-medium leading-none mb-0.5', inactiveText)}>{brandLabel}</p>
          <p className="text-sm font-semibold text-white truncate">{orgName || '...'}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const showChatBadge = item.href === `${orgBasePath}/messages` && chatUnreadTotal > 0;
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive(item)
                  ? 'bg-white/15 text-white'
                  : cn(inactiveText, 'hover:text-white hover:bg-white/10'),
              )}
            >
              <span className="relative flex-shrink-0">
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {showChatBadge && (
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-rose-500 text-[9px] font-bold text-white flex items-center justify-center border border-slate-900">
                    {chatUnreadTotal > 9 ? '9+' : chatUnreadTotal}
                  </span>
                )}
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className={cn('px-3 pb-4 border-t pt-3 flex-shrink-0', borderColor, sidebarBg)}>
        <button
          onClick={handleLogout}
          className={cn('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:text-white hover:bg-white/10 transition-colors w-full', inactiveText)}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {t('common.logout')}
        </button>
      </div>
    </nav>
  );

  return (
    <OrgEntityProvider value={entityType}>
      <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#f4f5f9]">
        <OrgSuspendedBanner />
        <div className="flex min-h-0 flex-1">
          <aside className={cn('hidden lg:flex w-60 flex-shrink-0 flex-col', sidebarBg)}>
            <Sidebar />
          </aside>

          {mobileOpen && (
            <div className="lg:hidden fixed inset-0 z-40 flex">
              <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
              <aside className={cn('relative z-50 flex h-dvh w-64 flex-col', sidebarBg)}>
                <div className="flex flex-shrink-0 justify-end p-3">
                  <button onClick={() => setMobileOpen(false)} className={cn(inactiveText, 'hover:text-white p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation rounded-xl')}>
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
                <BrandIcon className={cn('w-5 h-5', headerIconColor)} />
                <span className="text-sm font-semibold text-gray-900 truncate">{orgName}</span>
              </div>
            </header>

            <main className="min-h-0 flex-1 overflow-y-auto p-4 lg:p-6">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </OrgEntityProvider>
  );
}
