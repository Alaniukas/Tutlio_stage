import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { UserProvider } from '@/contexts/UserContext';
import { OrgBrandingProvider } from '@/contexts/OrgBrandingContext';
import { StudentPolicyProvider, useStudentPolicy } from '@/contexts/StudentPolicyContext';
import { StaticLocaleProvider } from '@/contexts/LocaleContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import StudentProtectedRoute from '@/components/StudentProtectedRoute';
import CompanyProtectedRoute from '@/components/CompanyProtectedRoute';
import ParentProtectedRoute from '@/components/ParentProtectedRoute';
import OrgPermissionRoute from '@/components/OrgPermissionRoute';
import { OrgAdminAccessProvider } from '@/contexts/OrgAdminAccessContext';

// Keep only the homepage in the entry bundle. Every other public route has its
// own chunk: direct visitors download the page they requested, while crawler
// HTML is supplied by the matching server renderer.
import Landing from '@/pages/Landing';
const AboutUs = lazy(() => import('@/pages/AboutUs'));
const Contact = lazy(() => import('@/pages/Contact'));
const FeaturePage = lazy(() => import('@/pages/FeaturePage'));
const FeaturesIndexPage = lazy(() => import('@/pages/FeaturesIndexPage'));
const Pricing = lazy(() => import('@/pages/Pricing'));
const Blog = lazy(() => import('@/pages/Blog'));
const BlogPost = lazy(() => import('@/pages/BlogPost'));
const PrivacyPolicy = lazy(() => import('@/pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('@/pages/TermsOfService'));
const DataProcessingAgreement = lazy(() => import('@/pages/DataProcessingAgreement'));
const QuizFunnel = lazy(() => import('@/pages/QuizFunnel'));

// Everything behind auth (and one-off payment/callback pages) loads on demand
// so marketing visitors never download the app.
// Demo-only public tutor landing page. Deliberately lazy (unlike the other
// marketing pages): while it is a prototype nobody links to it, so it must not
// cost every production user main-bundle bytes. Revisit when it goes live.
const PublicTutorPage = lazy(() => import('@/pages/PublicTutorPage'));
const PublicPageEditor = lazy(() => import('@/pages/PublicPageEditor'));

const Login = lazy(() => import('@/pages/Login'));
const EmbedOrgLogin = lazy(() => import('@/pages/EmbedOrgLogin'));
const AuthCallback = lazy(() => import('@/pages/AuthCallback'));
const Register = lazy(() => import('@/pages/Register'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const SchoolSign = lazy(() => import('@/pages/SchoolSign'));
const SchoolSignReturn = lazy(() => import('@/pages/SchoolSignReturn'));
const UnsubscribeReminders = lazy(() => import('@/pages/UnsubscribeReminders'));
const DashboardPage = lazy(() => import('@/pages/Dashboard'));
const CalendarPage = lazy(() => import('@/pages/Calendar'));
const StudentsPage = lazy(() => import('@/pages/Students'));
const WaitlistPage = lazy(() => import('@/pages/Waitlist'));
const SettingsPage = lazy(() => import('@/pages/Settings'));
const LessonSettingsPage = lazy(() => import('@/pages/LessonSettings'));
const FinancePage = lazy(() => import('@/pages/Finance'));
const InvoicesPage = lazy(() => import('@/pages/Invoices'));
const Instructions = lazy(() => import('@/pages/Instructions'));
const Messages = lazy(() => import('@/pages/Messages'));
const StudentOnboarding = lazy(() => import('@/pages/StudentOnboarding'));
const StudentDashboard = lazy(() => import('@/pages/StudentDashboard'));
const StudentSchedule = lazy(() => import('@/pages/StudentSchedule'));
const StudentSessions = lazy(() => import('@/pages/StudentSessions'));
const StudentSettings = lazy(() => import('@/pages/StudentSettings'));
const StudentWaitlist = lazy(() => import('@/pages/StudentWaitlist'));
const StudentPayments = lazy(() => import('@/pages/StudentPayments'));
const StudentMessages = lazy(() => import('@/pages/StudentMessages'));
const StudentInstructions = lazy(() => import('@/pages/StudentInstructions'));
const AdminPanel = lazy(() => import('@/pages/AdminPanel'));
const CompanyLogin = lazy(() => import('@/pages/CompanyLogin'));
const CompanyLayout = lazy(() => import('@/components/CompanyLayout'));
const CompanyDashboard = lazy(() => import('@/pages/company/CompanyDashboard'));
const CompanyTutors = lazy(() => import('@/pages/company/CompanyTutors'));
const CompanyStudents = lazy(() => import('@/pages/company/CompanyStudents'));
const CompanyWaitlist = lazy(() => import('@/pages/company/CompanyWaitlist'));
const CompanySessions = lazy(() => import('@/pages/company/CompanySessions'));
const CompanyTvarkarastis = lazy(() => import('@/pages/company/CompanyTvarkarastis'));
const CompanyStats = lazy(() => import('@/pages/company/CompanyStats'));
const CompanySettings = lazy(() => import('@/pages/company/CompanySettings'));
const CompanyContracts = lazy(() => import('@/pages/company/CompanyContracts'));
const CompanyFinanceHub = lazy(() => import('@/pages/company/CompanyFinanceHub'));
const CompanyInstructions = lazy(() => import('@/pages/company/CompanyInstructions'));
const CompanyDynamicPricing = lazy(() => import('@/pages/company/CompanyDynamicPricing'));
const CompanyMessages = lazy(() => import('@/pages/company/CompanyMessages'));
const CompanyTeam = lazy(() => import('@/pages/company/CompanyTeam'));
const PreviewAssignStudentModal = import.meta.env.DEV
  ? lazy(() => import('@/pages/dev/PreviewAssignStudentModal'))
  : null;
const PreviewComplimentaryLesson = import.meta.env.DEV
  ? lazy(() => import('@/pages/dev/PreviewComplimentaryLesson'))
  : null;
const ParentDashboard = lazy(() => import('@/pages/ParentDashboard'));
const ParentSessions = lazy(() => import('@/pages/ParentSessions'));
const ParentInvoices = lazy(() => import('@/pages/ParentInvoices'));
const ParentMessages = lazy(() => import('@/pages/ParentMessages'));
const ParentInstructions = lazy(() => import('@/pages/ParentInstructions'));
const ParentSettings = lazy(() => import('@/pages/ParentSettings'));
const ParentRegister = lazy(() => import('@/pages/ParentRegister'));
const SchoolContractComplete = lazy(() => import('@/pages/SchoolContractComplete'));
const StripeSuccess = lazy(() => import('@/pages/StripeSuccess'));
const EnterpriseSuccess = lazy(() => import('@/pages/EnterpriseSuccess'));
const PerlasSuccess = lazy(() => import('@/pages/PerlasSuccess'));
const PackagePaymentSuccess = lazy(() => import('@/pages/PackagePaymentSuccess'));
const PackagePaymentCancelled = lazy(() => import('@/pages/PackagePaymentCancelled'));
const SchoolPaymentSuccess = lazy(() => import('@/pages/SchoolPaymentSuccess'));
const TutorSubscribe = lazy(() => import('@/pages/TutorSubscribe'));
const WhiteboardPage = lazy(() => import('@/pages/Whiteboard'));
import SupabaseAuthHashErrors from '@/components/SupabaseAuthHashErrors';
import ThemeColorManager from '@/hooks/useThemeColor';
import { useTranslation, getLocaleFromPathname } from '@/lib/i18n';
import { stripPlatformPrefix } from '@/lib/platform';
import { initAnalytics, trackPageview } from '@/lib/analytics';
import { isPlMarket } from '@/lib/market';

/** Keep i18n locale aligned with `/:locale/...` URLs when users navigate or land from links. */
function LocaleFromRouteSync() {
  const location = useLocation();
  const { locale, setLocale } = useTranslation();

  useEffect(() => { initAnalytics(); }, []);

  useEffect(() => {
    if (!isPlMarket()) {
      const stripped = stripPlatformPrefix(location.pathname);
      const pathLocale = getLocaleFromPathname(stripped);
      if (pathLocale && pathLocale !== locale) setLocale(pathLocale);
    }
    trackPageview(location.pathname);
  }, [location.pathname, locale, setLocale]);

  return null;
}

/** New routes start at the top; in-page scrolling remains owned by the page. */
function ScrollToTopOnRouteChange() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}

function ProtectedWithUser() {
  return (
    <UserProvider>
      <OrgBrandingProvider scope="tutor">
        <ProtectedRoute />
      </OrgBrandingProvider>
    </UserProvider>
  );
}

function StudentProtectedWithUser() {
  return (
    <UserProvider>
      <OrgBrandingProvider scope="student">
        <StudentPolicyProvider>
          <StudentProtectedRoute />
        </StudentPolicyProvider>
      </OrgBrandingProvider>
    </UserProvider>
  );
}

/**
 * Booking-gated student routes (schedule, waitlist) must not even MOUNT for
 * orgs with disable_student_booking — no data fetches, no flash. Waits for the
 * policy to resolve (instant when session-cached), then redirects or renders.
 */
function RequireStudentBooking({ children }: { children: React.ReactElement }) {
  const policy = useStudentPolicy();
  if (!policy.resolved) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }
  if (policy.bookingDisabled) return <Navigate to="/student" replace />;
  return children;
}

function ParentProtectedWithUser() {
  return (
    <UserProvider>
      <OrgBrandingProvider scope="parent">
        <ParentProtectedRoute />
      </OrgBrandingProvider>
    </UserProvider>
  );
}

// Old parent booking URL (/parent/child/:studentId/schedule) is gone.
// Redirect to the new parent calendar with the right child pre-selected.
function ParentCalendarRedirect() {
  const { studentId } = useParams<{ studentId: string }>();
  const target = studentId ? `/parent/calendar?studentId=${encodeURIComponent(studentId)}` : '/parent/calendar';
  return <Navigate to={target} replace />;
}

/** Legacy URLs like /parent/child/:uuid — preserve child in query for shared StudentSessions flows. */
function ParentLegacyChildToLessonsRedirect() {
  const { studentId } = useParams<{ studentId: string }>();
  const target = studentId
    ? `/parent/lessons?studentId=${encodeURIComponent(studentId)}`
    : '/parent/lessons';
  return <Navigate to={target} replace />;
}

function CompanyProtectedWithUser() {
  return (
    <UserProvider>
      <OrgAdminAccessProvider>
        <CompanyProtectedRoute />
      </OrgAdminAccessProvider>
    </UserProvider>
  );
}

/** Language-neutral fallback shown while a lazy route chunk downloads. */
function RouteLoadingFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
    </div>
  );
}

export default function App({ basename }: { basename: string }) {
  return (
    <Router basename={basename || undefined}>
      <LocaleFromRouteSync />
      <ScrollToTopOnRouteChange />
      <SupabaseAuthHashErrors />
      <ThemeColorManager />
      <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        {import.meta.env.DEV && PreviewAssignStudentModal && (
          <>
            <Route
              path="/preview/assign-student-modal"
              element={
                <StaticLocaleProvider locale="lt">
                  <PreviewAssignStudentModal />
                </StaticLocaleProvider>
              }
            />
            <Route
              path="/dev/preview-assign-student-modal"
              element={<Navigate to="/preview/assign-student-modal" replace />}
            />
          </>
        )}
        {import.meta.env.DEV && PreviewComplimentaryLesson && (
          <>
            <Route
              path="/preview/complimentary-lesson"
              element={
                <StaticLocaleProvider locale="lt">
                  <PreviewComplimentaryLesson />
                </StaticLocaleProvider>
              }
            />
            <Route
              path="/preview/nemokama-pamoka"
              element={<Navigate to="/preview/complimentary-lesson" replace />}
            />
          </>
        )}

        {/* Public Landing Pages - NO UserProvider wrapper */}
        <Route path="/" element={<Landing />} />
        <Route path="/:locale" element={<Landing />} />
        {/* Direct alias for the default tutor landing. The static segment outranks
            /:locale above, so /new-landing is never read as a locale. */}
        <Route path="/new-landing" element={<Landing />} />
        <Route path="/:locale/new-landing" element={<Landing />} />
        <Route path="/apie-mus" element={<AboutUs />} />
        <Route path="/:locale/apie-mus" element={<AboutUs />} />
        {/* English aliases — same canonical pages, kept in sync with bot SSR (middleware.ts). */}
        <Route path="/about" element={<AboutUs />} />
        <Route path="/:locale/about" element={<AboutUs />} />
        <Route path="/kontaktai" element={<Contact />} />
        <Route path="/:locale/kontaktai" element={<Contact />} />
        <Route path="/contacts" element={<Contact />} />
        <Route path="/:locale/contacts" element={<Contact />} />
        <Route path="/features" element={<FeaturesIndexPage />} />
        <Route path="/:locale/features" element={<FeaturesIndexPage />} />
        <Route path="/features/:feature" element={<FeaturePage />} />
        <Route path="/:locale/features/:feature" element={<FeaturePage />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/:locale/pricing" element={<Pricing />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/:locale/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/:locale/blog/:slug" element={<BlogPost />} />
        {/* Public tutor/agency landing pages. Localized slug: /korepetitorius on
            tutlio.lt, /tutor on tutlio.com and tutlio.pl — mirrors the domain-keyed
            LOCALIZED_PAGE_PATHS in api/_lib/seo-routing.ts. Both aliases are routed
            on every domain so the non-canonical one can 308 in middleware. */}
        <Route path="/korepetitorius/:slug" element={<PublicTutorPage />} />
        <Route path="/:locale/korepetitorius/:slug" element={<PublicTutorPage />} />
        <Route path="/tutor/:slug" element={<PublicTutorPage />} />
        <Route path="/:locale/tutor/:slug" element={<PublicTutorPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/:locale/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/:locale/terms" element={<TermsOfService />} />
        <Route path="/dpa" element={<DataProcessingAgreement />} />
        <Route path="/:locale/dpa" element={<DataProcessingAgreement />} />
        <Route path="/quiz" element={<QuizFunnel />} />
        <Route path="/quiz/:audience/:step" element={<QuizFunnel />} />
        <Route path="/:locale/quiz" element={<QuizFunnel />} />
        <Route path="/:locale/quiz/:audience/:step" element={<QuizFunnel />} />

        {/* Public Auth & Onboarding - NO UserProvider wrapper */}
        <Route path="/login" element={<Login />} />
        <Route path="/:locale/login" element={<Login />} />
        <Route path="/embed/org-login" element={<EmbedOrgLogin />} />
        <Route path="/:locale/embed/org-login" element={<EmbedOrgLogin />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/register" element={<Register />} />
        <Route path="/:locale/register" element={<Register />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/registration/subscription" element={<TutorSubscribe />} />
        <Route path="/tutor-subscribe" element={<Navigate to="/registration/subscription" replace />} />
        <Route path="/book/:inviteCode" element={<StudentOnboarding />} />
        <Route path="/:locale/book/:inviteCode" element={<StudentOnboarding />} />
        <Route path="/parent-register" element={<ParentRegister />} />
        <Route path="/:locale/parent-register" element={<ParentRegister />} />
        <Route path="/school-contract-complete" element={<SchoolContractComplete />} />
        <Route path="/school-sign" element={<SchoolSign />} />
        <Route path="/school-sign/return" element={<SchoolSignReturn />} />
        <Route path="/unsubscribe" element={<UnsubscribeReminders />} />
        <Route path="/pasirasymas/sutarties/per/go-sign/:token" element={<SchoolSign />} />
        <Route path="/pasirasymas/sutarties/per/go-sign/:token/rezultatas" element={<SchoolSignReturn />} />
        <Route path="/stripe-success" element={<StripeSuccess />} />
        <Route path="/enterprise/success" element={<EnterpriseSuccess />} />
        <Route path="/:locale/enterprise/success" element={<EnterpriseSuccess />} />
        <Route path="/perlas-success" element={<PerlasSuccess />} />
        <Route path="/package-success" element={<PackagePaymentSuccess />} />
        <Route path="/package-cancelled" element={<PackagePaymentCancelled />} />
        <Route path="/school-payment-success" element={<SchoolPaymentSuccess />} />

        {/* Public Landing Pages - NO UserProvider wrapper */}
        <Route
          path="/whiteboard/:roomId"
          element={
            <UserProvider>
              <WhiteboardPage />
            </UserProvider>
          }
        />

        {/* Tutor routes - WITH UserProvider for caching */}
        <Route element={<ProtectedWithUser />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/students" element={<StudentsPage />} />
          <Route path="/waitlist" element={<WaitlistPage />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/finance" element={<FinancePage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/instructions" element={<Instructions />} />
          <Route path="/lesson-settings" element={<LessonSettingsPage />} />
          {/* Owner-facing editor for the public landing page. The page itself is
              public; editing it is not, and the API resolves the row from the
              session rather than from a slug in the URL. */}
          <Route path="/landing-editor" element={<PublicPageEditor />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        {/* Student routes - WITH UserProvider for caching */}
        <Route element={<StudentProtectedWithUser />}>
          <Route path="/student" element={<StudentDashboard />} />
          <Route path="/student/schedule" element={<RequireStudentBooking><StudentSchedule /></RequireStudentBooking>} />
          <Route path="/student/sessions" element={<StudentSessions />} />
          <Route path="/student/messages" element={<StudentMessages />} />
          <Route path="/student/waitlist" element={<RequireStudentBooking><StudentWaitlist /></RequireStudentBooking>} />
          <Route path="/student/payments" element={<StudentPayments />} />
          <Route path="/student/instructions" element={<StudentInstructions />} />
          <Route path="/student/settings" element={<StudentSettings />} />
        </Route>

        {/* Parent routes */}
        <Route element={<ParentProtectedWithUser />}>
          <Route path="/parent" element={<ParentDashboard />} />
          {/* Parent calendar / booking — re-uses the StudentSchedule page so the
              UI, modals and emails are 100% identical to the student-side flow.
              StudentSchedule detects parent mode via studentId in the URL. */}
          <Route path="/parent/calendar" element={<StudentSchedule />} />
          <Route path="/parent/lessons" element={<StudentSessions />} />
          {/* Legacy child routes – redirect everything booking-related to the parent calendar. */}
          <Route
            path="/parent/child/:studentId/schedule"
            element={<ParentCalendarRedirect />}
          />
          <Route path="/parent/child/:studentId" element={<ParentLegacyChildToLessonsRedirect />} />
          <Route path="/parent/child/:studentId/waitlist" element={<ParentLegacyChildToLessonsRedirect />} />
          <Route path="/parent/invoices" element={<ParentInvoices />} />
          <Route path="/parent/messages" element={<ParentMessages />} />
          <Route path="/parent/settings" element={<ParentSettings />} />
          <Route path="/parent/instructions" element={<ParentInstructions />} />
          {/* Catch-all for /parent/* – stay inside the parent portal instead of bouncing to /login. */}
          <Route path="/parent/*" element={<Navigate to="/parent" replace />} />
        </Route>

        {/* Platform owner admin — always Lithuanian, regardless of domain market locale. */}
        <Route
          path="/admin"
          element={
            <StaticLocaleProvider locale="lt">
              <AdminPanel />
            </StaticLocaleProvider>
          }
        />

        {/* Organization admin routes (company + school) - WITH UserProvider for caching */}
        <Route path="/company/login" element={<CompanyLogin />} />
        <Route path="/school/login" element={<CompanyLogin />} />
        <Route element={<CompanyProtectedWithUser />}>
          <Route element={<CompanyLayout />}>
            <Route path="/company" element={<OrgPermissionRoute permission="dashboard.view"><CompanyDashboard /></OrgPermissionRoute>} />
            <Route path="/company/tutors" element={<OrgPermissionRoute permission="tutors.view" editPermission="tutors.edit"><CompanyTutors /></OrgPermissionRoute>} />
            <Route path="/company/students" element={<OrgPermissionRoute permission="students.view" editPermission="students.edit"><CompanyStudents /></OrgPermissionRoute>} />
            <Route path="/company/waitlist" element={<OrgPermissionRoute permission="students.view" editPermission="students.edit"><CompanyWaitlist /></OrgPermissionRoute>} />
            <Route path="/company/sessions" element={<OrgPermissionRoute permission="sessions.view" editPermission="sessions.edit"><CompanySessions /></OrgPermissionRoute>} />
            <Route path="/company/schedule" element={<OrgPermissionRoute permission="sessions.view" editPermission="sessions.edit"><CompanyTvarkarastis /></OrgPermissionRoute>} />
            <Route path="/company/messages" element={<OrgPermissionRoute permission="messages.view" editPermission="messages.edit"><CompanyMessages /></OrgPermissionRoute>} />
            <Route path="/company/stats" element={<OrgPermissionRoute permission="stats.view"><CompanyStats /></OrgPermissionRoute>} />
            <Route path="/company/instructions" element={<CompanyInstructions />} />
            <Route path="/company/dynamic-pricing" element={<OrgPermissionRoute permission="settings.view" editPermission="settings.edit"><CompanyDynamicPricing /></OrgPermissionRoute>} />
            <Route path="/company/settings" element={<OrgPermissionRoute permission="settings.view" editPermission="settings.edit"><CompanySettings /></OrgPermissionRoute>} />
            <Route path="/company/finance" element={<OrgPermissionRoute permission="finance.view" editPermission="finance.edit"><CompanyFinanceHub /></OrgPermissionRoute>} />
            <Route path="/company/contracts" element={<OrgPermissionRoute permission="contracts.view" editPermission="contracts.edit"><CompanyContracts /></OrgPermissionRoute>} />
            <Route path="/company/team" element={<OrgPermissionRoute ownerOnly><CompanyTeam /></OrgPermissionRoute>} />

            <Route path="/school" element={<OrgPermissionRoute permission="dashboard.view"><CompanyDashboard /></OrgPermissionRoute>} />
            <Route path="/school/tutors" element={<OrgPermissionRoute permission="tutors.view" editPermission="tutors.edit"><CompanyTutors /></OrgPermissionRoute>} />
            <Route path="/school/students" element={<OrgPermissionRoute permission="students.view" editPermission="students.edit"><CompanyStudents /></OrgPermissionRoute>} />
            <Route path="/school/waitlist" element={<OrgPermissionRoute permission="students.view" editPermission="students.edit"><CompanyWaitlist /></OrgPermissionRoute>} />
            <Route path="/school/sessions" element={<OrgPermissionRoute permission="sessions.view" editPermission="sessions.edit"><CompanySessions /></OrgPermissionRoute>} />
            <Route path="/school/schedule" element={<OrgPermissionRoute permission="sessions.view" editPermission="sessions.edit"><CompanyTvarkarastis /></OrgPermissionRoute>} />
            <Route path="/school/messages" element={<OrgPermissionRoute permission="messages.view" editPermission="messages.edit"><CompanyMessages /></OrgPermissionRoute>} />
            <Route path="/school/stats" element={<OrgPermissionRoute permission="stats.view"><CompanyStats /></OrgPermissionRoute>} />
            <Route path="/school/instructions" element={<CompanyInstructions />} />
            <Route path="/school/dynamic-pricing" element={<Navigate to="/school" replace />} />
            <Route path="/school/settings" element={<OrgPermissionRoute permission="settings.view" editPermission="settings.edit"><CompanySettings /></OrgPermissionRoute>} />
            <Route path="/school/finance" element={<OrgPermissionRoute permission="finance.view" editPermission="finance.edit"><CompanyFinanceHub /></OrgPermissionRoute>} />
            <Route path="/school/contracts" element={<OrgPermissionRoute permission="contracts.view" editPermission="contracts.edit"><CompanyContracts /></OrgPermissionRoute>} />
            <Route path="/school/team" element={<OrgPermissionRoute ownerOnly><CompanyTeam /></OrgPermissionRoute>} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </Suspense>
    </Router>
  );
}
