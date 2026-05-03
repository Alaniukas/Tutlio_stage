import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  MessageSquare,
  FileText,
  LogOut,
  BookOpen,
  GraduationCap,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { useTotalChatUnread } from '@/hooks/useChat';

interface ParentLayoutProps {
  children: React.ReactNode;
}

export default function ParentLayout({ children }: ParentLayoutProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const chatUnreadTotal = useTotalChatUnread();

  const navItems = useMemo(
    () => [
      { href: '/parent', label: t('parent.dashboard'), icon: LayoutDashboard },
      { href: '/parent/calendar', label: t('nav.calendar'), icon: CalendarDays },
      {
        href: '/parent/lessons',
        label: t('parent.sessionsTitle') || 'Pamokos',
        icon: BookOpen,
      },
      { href: '/parent/messages', label: t('parent.messages'), icon: MessageSquare, badge: 'chat' as const },
      { href: '/parent/invoices', label: t('parent.invoices'), icon: FileText },
    ],
    [t],
  );

  const handleLogout = async () => {
    try {
      const prefix = 'tutlio_parent_profile_id_for_';
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#fffefc] flex flex-col relative overflow-x-hidden">
      <div className="absolute top-0 right-0 w-96 h-96 bg-orange-100/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none z-0" />
      <div className="absolute bottom-32 left-0 w-96 h-96 bg-rose-100/30 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none z-0" />

      <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-orange-100/80 px-4 py-2.5 flex items-center justify-between">
        <Link to="/parent" className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
            <GraduationCap className="w-[18px] h-[18px] text-white" />
          </div>
          <span className="font-black text-gray-900 text-sm sm:text-base tracking-tight truncate">Tutlio</span>
        </Link>
        <span className="hidden sm:inline text-[11px] font-semibold tracking-wide text-orange-500 shrink-0">
          {t('parent.portalLabel')}
        </span>
      </header>

      <main className="flex-1 pb-28 relative z-10 flex flex-col min-h-0">{children}</main>

      <nav
        className="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 z-50 shadow-[0_-4px_20px_-8px_rgba(0,0,0,0.08)]"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="grid grid-cols-6 gap-0 px-0.5 sm:px-1 pt-2 pb-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.href;
            const showChatBadge = item.badge === 'chat' && chatUnreadTotal > 0;
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`relative flex flex-col items-center gap-1 min-w-0 py-1 rounded-2xl transition-all ${
                  active ? 'text-violet-700' : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                <div
                  className={`relative p-1.5 rounded-xl transition-all shrink-0 ${
                    active ? 'bg-violet-100' : ''
                  }`}
                >
                  <Icon className="w-5 h-5 mx-auto" />
                  {showChatBadge && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-rose-500 text-[8px] font-bold text-white flex items-center justify-center border-2 border-white">
                      {chatUnreadTotal > 9 ? '9+' : chatUnreadTotal}
                    </span>
                  )}
                </div>
                <span
                  className={`block w-full text-[11px] sm:text-xs font-semibold leading-tight text-center px-1 ${
                    active ? 'text-violet-700' : ''
                  }`}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}

          <button
            type="button"
            onClick={handleLogout}
            className="relative flex flex-col items-center gap-1 min-w-0 py-1 rounded-2xl transition-all text-gray-400 hover:text-gray-700"
          >
            <div className="relative p-1.5 rounded-xl transition-all shrink-0">
              <LogOut className="w-5 h-5 mx-auto" />
            </div>
            <span className="block w-full text-[11px] sm:text-xs font-semibold leading-tight text-center px-1">
              {t('parent.logout')}
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}
