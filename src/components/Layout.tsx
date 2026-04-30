import { Link, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useEffect, useRef, useState, useMemo } from 'react';
import { preloadTutorData } from '@/lib/preload';
import { buildPlatformPath } from '@/lib/platform';
import {
  LayoutDashboard,
  Calendar,
  Users,
  ListOrdered,
  DollarSign,
  Settings,
  GraduationCap,
  LogOut,
  ChevronDown,
  BookOpen,
  HelpCircle,
  MessageSquare,
  FileText,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import OrgSuspendedBanner from '@/components/OrgSuspendedBanner';
import { useTranslation } from '@/lib/i18n';
import { useUser } from '@/contexts/UserContext';
import { useTotalChatUnread } from '@/hooks/useChat';
import { usePushSubscription } from '@/hooks/usePushSubscription';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { t } = useTranslation();
  const { profile } = useUser();
  const [profileOrgId, setProfileOrgId] = useState<string | null>(profile?.organization_id ?? null);
  const isOrgTutor = !!(profile?.organization_id || profileOrgId);
  const chatUnreadTotal = useTotalChatUnread();
  usePushSubscription();
  const [tutorName, setTutorName] = useState('');
  const [tutorEmail, setTutorEmail] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    try { const v = localStorage.getItem('tutlio_sidebar_expanded'); return v !== null ? v === 'true' : true; } catch { return true; }
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const navItems = useMemo(() => {
    const items = [
      { href: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
      { href: '/calendar', label: t('nav.calendar'), icon: Calendar },
      { href: '/students', label: t('nav.students'), icon: Users },
      { href: '/waitlist', label: t('nav.waitlist'), icon: ListOrdered, highlight: true },
      { href: '/messages', label: t('nav.messages'), icon: MessageSquare },
      { href: '/finance', label: t('nav.finance'), icon: DollarSign },
      { href: '/invoices', label: t('nav.invoices'), icon: FileText },
      { href: '/lesson-settings', label: t('nav.lessonSettings'), icon: BookOpen },
      { href: '/instructions', label: t('nav.instructions'), icon: HelpCircle },
    ];
    // Org tutors don't have personal invoices page, but they can see instructions.
    if (isOrgTutor) return items.filter(item => item.href !== '/invoices');
    return items;
  }, [isOrgTutor, t]);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setTutorEmail(user.email || '');
        const { data } = await supabase
          .from('profiles')
          .select('full_name, organization_id')
          .eq('id', user.id)
          .maybeSingle();
        setTutorName(data?.full_name || user.email?.split('@')[0] || t('common.tutor'));
        setProfileOrgId(data?.organization_id ?? null);
      }
    };
    getUser();
    preloadTutorData();
  }, []);

  useEffect(() => {
    try { localStorage.setItem('tutlio_sidebar_expanded', String(sidebarExpanded)); } catch {}
  }, [sidebarExpanded]);

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    const raf = requestAnimationFrame(() => mainRef.current?.scrollTo(0, 0));
    return () => cancelAnimationFrame(raf);
  }, [location.pathname]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    sessionStorage.setItem('tutlio_logout_intent', '1');
    void supabase.auth.signOut();
    window.location.href = `${window.location.origin}${buildPlatformPath('/login')}`;
  };

  const initials = tutorName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
  const isCalendarRoute = location.pathname === '/calendar';
  return (
    <div className="h-dvh max-h-dvh bg-white flex overflow-hidden relative">
      <OrgSuspendedBanner />
      <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-indigo-50/40 rounded-full blur-[80px] pointer-events-none z-0" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-slate-50/40 rounded-full blur-[100px] pointer-events-none z-0" />

      <aside
        className={cn(
          'hidden lg:flex relative z-20 flex-col border-r border-gray-100 bg-white/90 backdrop-blur-md shadow-sm transition-all duration-200',
          sidebarExpanded ? 'w-72' : 'w-20'
        )}
      >
        <div className={cn(
          'flex border-b border-gray-100',
          sidebarExpanded ? 'items-center justify-between p-4' : 'flex-col items-center gap-2 py-3 px-2'
        )}>
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            {sidebarExpanded && (
              <span className="font-black text-gray-900 text-base tracking-tight truncate">Tutlio</span>
            )}
          </Link>
          <button
            onClick={() => {
              setSidebarExpanded((prev) => !prev);
              setMenuOpen(false);
            }}
            className={cn(
              'rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors flex items-center justify-center',
              sidebarExpanded ? 'min-h-[40px] min-w-[40px]' : 'h-8 w-8'
            )}
          >
            {sidebarExpanded ? <ChevronsLeft className="w-4 h-4" /> : <ChevronsRight className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.href;
            const highlight = 'highlight' in item && item.highlight;
            const showChatBadge = item.href === '/messages' && chatUnreadTotal > 0;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'relative flex items-center rounded-xl text-sm font-semibold transition-all duration-150 min-h-[44px] touch-manipulation',
                  sidebarExpanded ? 'px-3 gap-2.5' : 'px-0 justify-center',
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : highlight
                      ? 'text-violet-700 hover:bg-violet-50 ring-1 ring-violet-200/60'
                      : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                )}
                title={!sidebarExpanded ? item.label : undefined}
              >
                <span className="relative flex-shrink-0">
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {showChatBadge && (
                    <span
                      className={cn(
                        'absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-rose-500 text-[9px] font-bold text-white flex items-center justify-center border border-white',
                        active && 'border-indigo-600',
                      )}
                    >
                      {chatUnreadTotal > 9 ? '9+' : chatUnreadTotal}
                    </span>
                  )}
                </span>
                {sidebarExpanded && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="relative border-t border-gray-100 p-3" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((prev) => !prev)}
            className={cn(
              'w-full rounded-xl hover:bg-gray-100 transition-colors min-h-[44px] touch-manipulation',
              sidebarExpanded ? 'flex items-center gap-2 pl-2 pr-3 py-2' : 'flex items-center justify-center'
            )}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
              {initials}
            </div>
            {sidebarExpanded && (
              <>
                <div className="text-left min-w-0">
                  <p className="text-sm font-bold text-gray-900 leading-none truncate">{tutorName}</p>
                  <p className="text-xs text-gray-400 truncate mt-1">{tutorEmail}</p>
                </div>
                <ChevronDown className={cn('w-4 h-4 text-gray-400 ml-auto transition-transform', menuOpen && 'rotate-180')} />
              </>
            )}
          </button>

          {menuOpen && (
            <div
              className={cn(
                'absolute bottom-16 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50',
                sidebarExpanded ? 'left-3 right-3 w-auto' : 'left-full ml-2'
              )}
            >
              <div className="px-4 py-2 border-b border-gray-50 mb-1">
                <p className="text-xs text-gray-400 truncate">{tutorEmail}</p>
              </div>
              <Link
                to="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900"
              >
                <Settings className="w-4 h-4 text-gray-400" />
                {t('common.settings')}
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                {t('common.logout')}
              </button>
            </div>
          )}
        </div>
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-50 flex h-full w-72 max-w-[85vw] flex-col border-r border-gray-100 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <Link to="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
                <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-white" />
                </div>
                <span className="font-black text-gray-900 text-base tracking-tight">Tutlio</span>
              </Link>
              <button
                onClick={() => setMobileOpen(false)}
                className="text-gray-500 hover:text-gray-900 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation rounded-xl"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = location.pathname === item.href;
                const highlight = 'highlight' in item && item.highlight;
                const showChatBadge = item.href === '/messages' && chatUnreadTotal > 0;
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'relative flex items-center gap-2.5 px-3 min-h-[44px] rounded-xl text-sm font-semibold transition-all duration-150 touch-manipulation',
                      active
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : highlight
                          ? 'text-violet-700 hover:bg-violet-50 ring-1 ring-violet-200/60'
                          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                    )}
                  >
                    <span className="relative flex-shrink-0">
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {showChatBadge && (
                        <span
                          className={cn(
                            'absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-rose-500 text-[9px] font-bold text-white flex items-center justify-center border border-white',
                            active && 'border-indigo-600',
                          )}
                        >
                          {chatUnreadTotal > 9 ? '9+' : chatUnreadTotal}
                        </span>
                      )}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="border-t border-gray-100 p-3 space-y-2">
              <div className="flex items-center gap-2 px-2 py-1">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-900 leading-none truncate">{tutorName}</p>
                  <p className="text-xs text-gray-400 truncate mt-1">{tutorEmail}</p>
                </div>
              </div>
              <Link
                to="/settings"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 rounded-xl"
              >
                <Settings className="w-4 h-4 text-gray-500" />
                {t('common.settings')}
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-colors"
              >
                <LogOut className="w-4 h-4" />
                {t('common.logout')}
              </button>
            </div>
          </aside>
        </div>
      )}

      <div className="relative z-10 flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        <header className="lg:hidden bg-white/90 backdrop-blur-md border-b border-gray-100 sticky top-0 z-30 shadow-sm px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-gray-500 hover:text-gray-900 p-2.5 -ml-2 min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation rounded-xl"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
              <GraduationCap className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-black text-gray-900 text-base tracking-tight">Tutlio</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
            {initials}
          </div>
        </header>

        <main
          ref={mainRef}
          className={cn(
            'flex-1 min-h-0',
            isCalendarRoute
              ? 'overflow-y-auto px-2 sm:px-3 py-2 sm:py-3'
              : 'overflow-y-auto px-4 xl:px-6 py-6',
          )}
        >
          <div
            className={cn(
              isCalendarRoute
                ? 'max-w-none w-full'
                : 'max-w-screen-xl mx-auto w-full',
            )}
          >
            {children}
          </div>
        </main>
      </div>

    </div>
  );
}
