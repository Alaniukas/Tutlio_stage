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
  BadgeEuro,
  Globe,
  ShieldCheck,
  Video,
  PanelLeftClose,
  PanelLeft,
  UsersRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import OrgSuspendedBanner from '@/components/OrgSuspendedBanner';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';
import { useTranslation } from '@/lib/i18n';
import { useTotalChatUnread } from '@/hooks/useChat';
import { OrgEntityProvider, type OrgEntityType } from '@/contexts/OrgEntityContext';
import { useUser } from '@/contexts/UserContext';
import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { useSchoolTerminology } from '@/hooks/useSchoolTerminology';
import { showDynamicPricingNav } from '@/lib/orgIntakeMode';
import { isInstructionsHiddenForOrg } from '@/lib/marketMoney';
import { useOrgAdminAccess } from '@/contexts/OrgAdminAccessContext';
import type { OrgAdminPermission } from '@/lib/orgAdminPermissions';

/** Parked until Drive Meet ingest. Restore: true AND org flag `school_lesson_recordings`. */
const SCHOOL_LESSON_RECORDINGS_NAV_READY = false;
const SIDEBAR_COLLAPSED_KEY = 'tutlio_org_sidebar_collapsed';

interface CompanyNavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  permission: OrgAdminPermission | null;
  section: 'work' | 'manage' | 'help';
}

const NAV_SECTIONS = [
  { id: 'work' as const, labelKey: 'companyNav.sectionWork' },
  { id: 'manage' as const, labelKey: 'companyNav.sectionManage' },
  { id: 'help' as const, labelKey: 'companyNav.sectionHelp' },
];

export function buildCompanyNavItems(
  isSchool: boolean,
  orgBasePath: '/school' | '/company',
  t: (key: string) => string,
  showDynamicPricing: boolean,
  showPublicPage = false,
  showInstructions = true,
  showGroups = false,
  showRecordings = false,
): CompanyNavItem[] {
  const base: CompanyNavItem[] = [
    { href: `${orgBasePath}`, label: t('companyNav.overview'), icon: LayoutDashboard, exact: true, permission: 'dashboard.view', section: 'work' },
    { href: `${orgBasePath}/tutors`, label: isSchool ? t('companyNav.teachers') : t('companyNav.tutors'), icon: Users, permission: 'tutors.view', section: 'work' },
    { href: `${orgBasePath}/students`, label: t('companyNav.students'), icon: GraduationCap, permission: 'students.view', section: 'work' },
    { href: `${orgBasePath}/sessions`, label: t('companyNav.sessions'), icon: BookOpen, permission: 'sessions.view', section: 'work' },
    { href: `${orgBasePath}/schedule`, label: t('companyNav.schedule'), icon: CalendarDays, permission: 'sessions.view', section: 'work' },
    { href: `${orgBasePath}/messages`, label: t('companyNav.messages'), icon: MessageSquare, permission: 'messages.view', section: 'work' },
    { href: `${orgBasePath}/stats`, label: t('companyNav.stats'), icon: BarChart3, permission: 'stats.view', section: 'manage' },
    { href: `${orgBasePath}/settings`, label: t('companyNav.lessonSettings'), icon: Settings, permission: 'settings.view', section: 'manage' },
  ];
  if (showGroups) {
    base.push({ href: `${orgBasePath}/groups`, label: t('companyNav.groups'), icon: UsersRound, permission: 'sessions.view', section: 'work' });
  }
  if (isSchool && showRecordings) {
    base.push({ href: `${orgBasePath}/recordings`, label: t('companyNav.recordings'), icon: Video, permission: 'sessions.view', section: 'work' });
  }
  if (showPublicPage) {
    base.push({ href: `${orgBasePath}/public-page`, label: t('companyNav.publicPage'), icon: Globe, permission: 'settings.view', section: 'manage' });
  }
  if (isSchool) {
    base.push({ href: `${orgBasePath}/contracts`, label: t('companyNav.contracts'), icon: FileText, permission: 'contracts.view', section: 'manage' });
  }
  base.push({ href: `${orgBasePath}/finance`, label: t('companyNav.finance'), icon: CreditCard, permission: 'finance.view', section: 'manage' });
  if (showDynamicPricing) {
    base.push({ href: `${orgBasePath}/dynamic-pricing`, label: t('companyNav.dynamicPricing'), icon: BadgeEuro, permission: 'settings.view', section: 'manage' });
  }
  base.push({ href: `${orgBasePath}/team`, label: t('companyNav.team'), icon: ShieldCheck, permission: 'team.view', section: 'manage' });
  if (showInstructions) {
    base.push({ href: `${orgBasePath}/instructions`, label: t('companyNav.instructions'), icon: HelpCircle, permission: null, section: 'help' });
  }
  return base;
}

export default function CompanyLayout() {
  const { t } = useTranslation();
  const { user: ctxUser } = useUser();
  const { can, membership } = useOrgAdminAccess();
  const chatUnreadTotal = useTotalChatUnread({ enabled: can('messages.view') });
  const location = useLocation();
  const ENTITY_KEY = 'tutlio_entity_type';
  const dashCache = getCached<any>('company_dashboard');
  const [orgName, setOrgName] = useState(dashCache?.orgName ?? '');
  const [entityType, setEntityTypeRaw] = useState<OrgEntityType>(() => {
    const stored = sessionStorage.getItem(ENTITY_KEY);
    if (stored === 'school' || stored === 'company') return stored;
    return (dashCache?.entityType as OrgEntityType) || 'company';
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const setEntityType = (et: OrgEntityType) => {
    setEntityTypeRaw(et);
    sessionStorage.setItem(ENTITY_KEY, et);
  };

  const isSchool = entityType === 'school';
  const { loading: orgFeaturesLoading, hasFeature, organizationId } = useOrgFeatures();
  // Admin UI of a school says "mokytojas" / "užsiėmimas" (org flags can switch each off).
  useSchoolTerminology(orgFeaturesLoading ? null : {
    staff: isSchool || hasFeature('school_teacher_labels'),
    activity: isSchool && hasFeature('school_activity_labels'),
  });
  const showDynamicPricing =
    !orgFeaturesLoading && showDynamicPricingNav(organizationId, entityType);
  /** Public "vizitinė kortelė" is solo-tutor only for now. */
  const showPublicPage = false;
  const cachedOrgId = (dashCache?.organizationId as string | undefined) ?? null;
  // Fail-closed while resolving: Pro Klasė must never flash the instructions nav item.
  const showInstructions =
    !orgFeaturesLoading &&
    !isInstructionsHiddenForOrg(organizationId) &&
    !isInstructionsHiddenForOrg(cachedOrgId);
  /** Pagal org tipą, ne `pathname.startsWith('/school')` — kitaip `/schools` (landing) klaidingai atitinka `/school`. */
  const orgBasePath = isSchool ? '/school' : '/company';
  const BrandIcon = isSchool ? School : Building2;
  const brandLabel = isSchool ? t('layout.tutlioSchool') : t('layout.tutlioCompany');

  const NAV_ITEMS = useMemo(
    () =>
      buildCompanyNavItems(
        isSchool,
        orgBasePath,
        t,
        showDynamicPricing,
        showPublicPage,
        showInstructions,
        hasFeature('school_class_groups'),
        SCHOOL_LESSON_RECORDINGS_NAV_READY && isSchool && hasFeature('school_lesson_recordings'),
      )
      .filter((item) => item.permission === null || can(item.permission)),
    [t, isSchool, orgBasePath, showDynamicPricing, showPublicPage, showInstructions, can, hasFeature],
  );

  useEffect(() => {
    if (membership) {
      if (!orgName && membership.organizationName) setOrgName(membership.organizationName);
      setEntityType(membership.entityType);
    }
    let cancelled = false;
    preloadOrgAdminData().then(() => {
      if (cancelled) return;
      const dc = getCached<any>('company_dashboard');
      if (dc?.orgName && !orgName) setOrgName(dc.orgName);
      if (dc?.entityType) setEntityType(dc.entityType);
    });
    return () => { cancelled = true; };
  }, [ctxUser?.id, membership?.organizationId]);

  const handleLogout = async () => {
    sessionStorage.removeItem(ENTITY_KEY);
    sessionStorage.setItem('tutlio_logout_intent', '1');
    try {
      // Prefer local sign-out; global can be slow and is not required for UX.
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* ignore */
    }
    Object.keys(localStorage)
      .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
      .forEach((k) => localStorage.removeItem(k));
    // After org-admin logout we should land on the main landing, not loop back into /school/login.
    window.location.href = `${window.location.origin}${buildPlatformPath('/')}`;
  };

  const isActive = (item: (typeof NAV_ITEMS)[0]) =>
    item.exact ? location.pathname === item.href : location.pathname.startsWith(item.href);

  const sidebarBg = isSchool ? 'bg-[#163028]' : 'bg-[#1c2430]';
  const borderColor = isSchool ? 'border-white/10' : 'border-white/10';
  const inactiveText = isSchool ? 'text-emerald-100/55' : 'text-slate-400';
  const headerIconColor = isSchool ? 'text-emerald-800' : 'text-slate-700';

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className={cn('flex flex-col h-full min-h-0 font-[system-ui,-apple-system,"Segoe_UI",sans-serif]', mobile && 'pt-4')}>
      <div className={cn('flex items-center gap-2 border-b flex-shrink-0 px-3 py-3', borderColor)}>
        <Link
          to={orgBasePath}
          onClick={() => setMobileOpen(false)}
          className={cn('flex min-w-0 flex-1 items-center gap-2.5', sidebarCollapsed && !mobile && 'justify-center')}
          title={orgName || brandLabel}
        >
          <div className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center flex-shrink-0">
            <BrandIcon className="w-4 h-4 text-white" />
          </div>
          {(!sidebarCollapsed || mobile) && (
            <div className="min-w-0">
              <p className={cn('text-[11px] leading-none mb-0.5', inactiveText)}>{brandLabel}</p>
              <p className="text-[13px] font-medium text-white truncate">{orgName || '...'}</p>
            </div>
          )}
        </Link>
        {!mobile && (
          <button
            type="button"
            onClick={toggleSidebarCollapsed}
            className={cn(
              'flex-shrink-0 rounded-md p-1.5 transition-colors hover:bg-white/10 hover:text-white',
              inactiveText,
            )}
            title={sidebarCollapsed ? t('companyNav.expandSidebar') : t('companyNav.collapseSidebar')}
            aria-label={sidebarCollapsed ? t('companyNav.expandSidebar') : t('companyNav.collapseSidebar')}
          >
            {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-2 py-3 space-y-3">
        {NAV_SECTIONS.map((section) => {
          const items = NAV_ITEMS.filter((item) => item.section === section.id);
          if (items.length === 0) return null;
          return (
            <div key={section.id}>
              {(!sidebarCollapsed || mobile) && (
                <p className={cn('px-2.5 mb-1 text-[11px] font-medium', inactiveText)}>
                  {t(section.labelKey)}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((item) => {
                  const showChatBadge = item.href === `${orgBasePath}/messages` && chatUnreadTotal > 0;
                  const active = isActive(item);
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={() => setMobileOpen(false)}
                      title={sidebarCollapsed && !mobile ? item.label : undefined}
                      className={cn(
                        'relative flex items-center rounded-md transition-colors',
                        sidebarCollapsed && !mobile ? 'justify-center px-2 py-2.5' : 'gap-2.5 px-2.5',
                        mobile ? 'min-h-[44px] py-2 text-sm touch-manipulation' : 'py-2 text-[13px] leading-snug',
                        active
                          ? cn('bg-white/12 text-white', !sidebarCollapsed || mobile ? 'border-l-2 border-white/70 pl-2' : '')
                          : cn(inactiveText, 'hover:text-white hover:bg-white/8'),
                      )}
                    >
                      <span className="relative flex-shrink-0">
                        <item.icon className="w-[17px] h-[17px] flex-shrink-0" strokeWidth={1.75} />
                        {showChatBadge && (
                          <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-rose-500 text-[9px] font-bold text-white flex items-center justify-center border border-slate-900">
                            {chatUnreadTotal > 9 ? '9+' : chatUnreadTotal}
                          </span>
                        )}
                      </span>
                      {(!sidebarCollapsed || mobile) && <span className="truncate">{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className={cn('px-2 pb-3 border-t pt-2 flex-shrink-0', borderColor, sidebarBg)}>
        <button
          onClick={handleLogout}
          title={sidebarCollapsed && !mobile ? t('common.logout') : undefined}
          className={cn(
            'flex items-center rounded-md text-[13px] hover:text-white hover:bg-white/8 transition-colors w-full',
            sidebarCollapsed && !mobile ? 'justify-center px-2 py-2.5' : 'gap-2.5 px-2.5 py-2',
            inactiveText,
          )}
        >
          <LogOut className="w-[17px] h-[17px] flex-shrink-0" strokeWidth={1.75} />
          {(!sidebarCollapsed || mobile) && t('common.logout')}
        </button>
      </div>
    </nav>
  );

  return (
    <OrgEntityProvider value={entityType}>
      <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-[#f4f5f9]">
        <OrgSuspendedBanner />
        <div className="flex min-h-0 flex-1">
          <aside className={cn(
            'hidden lg:flex flex-shrink-0 flex-col transition-[width] duration-200',
            sidebarCollapsed ? 'w-[4.25rem]' : 'w-56',
            sidebarBg,
          )}>
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

            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6">
              <Outlet />
            </main>
            <PwaInstallPrompt
              settingsPath={
                showInstructions ? `${orgBasePath}/instructions` : `${orgBasePath}/settings`
              }
            />
          </div>
        </div>
      </div>
    </OrgEntityProvider>
  );
}
