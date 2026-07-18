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

// Marketing/SEO pages stay in the main bundle: they are the entry point for
// every organic visitor and must paint instantly (Core Web Vitals).
import Landing from '@/pages/Landing';
import AboutUs from '@/pages/AboutUs';
import Contact from '@/pages/Contact';
import FeaturePage from '@/pages/FeaturePage';
import Pricing from '@/pages/Pricing';
import Blog from '@/pages/Blog';
import BlogPost from '@/pages/BlogPost';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import TermsOfService from '@/pages/TermsOfService';
import DataProcessingAgreement from '@/pages/DataProcessingAgreement';

// Everything behind auth (and one-off payment/callback pages) loads on demand
// so marketing visitors never download the app.
const Login = lazy(() => import('@/pages/Login'));
const AuthCallback = lazy(() => import('@/pages/AuthCallback'));
const Register = lazy(() => import('@/pages/Register'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const SchoolSign = lazy(() => import('@/pages/SchoolSign'));
const SchoolSignReturn = lazy(() => import('@/pages/SchoolSignReturn'));
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
const PreviewAssignStudentModal = lazy(() => import('@/pages/dev/PreviewAssignStudentModal'));
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
      <CompanyProtectedRoute />
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
      <SupabaseAuthHashErrors />
      <ThemeColorManager />
      <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
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

        {/* Public Landing Pages - NO UserProvider wrapper */}
        <Route path="/" element={<Landing />} />
        <Route path="/:locale" element={<Landing />} />
        <Route path="/apie-mus" element={<AboutUs />} />
        <Route path="/:locale/apie-mus" element={<AboutUs />} />
        {/* English aliases — same canonical pages, kept in sync with bot SSR (middleware.ts). */}
        <Route path="/about" element={<AboutUs />} />
        <Route path="/:locale/about" element={<AboutUs />} />
        <Route path="/kontaktai" element={<Contact />} />
        <Route path="/:locale/kontaktai" element={<Contact />} />
        <Route path="/contacts" element={<Contact />} />
        <Route path="/:locale/contacts" element={<Contact />} />
        <Route path="/features/:feature" element={<FeaturePage />} />
        <Route path="/:locale/features/:feature" element={<FeaturePage />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/:locale/pricing" element={<Pricing />} />
        <Route path="/blog" element={<Blog />} />
        <Route path="/:locale/blog" element={<Blog />} />
        <Route path="/blog/:slug" element={<BlogPost />} />
        <Route path="/:locale/blog/:slug" element={<BlogPost />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/:locale/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/:locale/terms" element={<TermsOfService />} />
        <Route path="/dpa" element={<DataProcessingAgreement />} />
        <Route path="/:locale/dpa" element={<DataProcessingAgreement />} />

        {/* Public Auth & Onboarding - NO UserProvider wrapper */}
        <Route path="/login" element={<Login />} />
        <Route path="/:locale/login" element={<Login />} />
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
            <Route path="/company" element={<CompanyDashboard />} />
            <Route path="/company/tutors" element={<CompanyTutors />} />
            <Route path="/company/students" element={<CompanyStudents />} />
            <Route path="/company/waitlist" element={<CompanyWaitlist />} />
            <Route path="/company/sessions" element={<CompanySessions />} />
            <Route path="/company/schedule" element={<CompanyTvarkarastis />} />
            <Route path="/company/messages" element={<CompanyMessages />} />
            <Route path="/company/stats" element={<CompanyStats />} />
            <Route path="/company/instructions" element={<CompanyInstructions />} />
            <Route path="/company/dynamic-pricing" element={<CompanyDynamicPricing />} />
            <Route path="/company/settings" element={<CompanySettings />} />
            <Route path="/company/finance" element={<CompanyFinanceHub />} />
            <Route path="/company/contracts" element={<CompanyContracts />} />

            <Route path="/school" element={<CompanyDashboard />} />
            <Route path="/school/tutors" element={<CompanyTutors />} />
            <Route path="/school/students" element={<CompanyStudents />} />
            <Route path="/school/waitlist" element={<CompanyWaitlist />} />
            <Route path="/school/sessions" element={<CompanySessions />} />
            <Route path="/school/schedule" element={<CompanyTvarkarastis />} />
            <Route path="/school/messages" element={<CompanyMessages />} />
            <Route path="/school/stats" element={<CompanyStats />} />
            <Route path="/school/instructions" element={<CompanyInstructions />} />
            <Route path="/school/dynamic-pricing" element={<Navigate to="/school" replace />} />
            <Route path="/school/settings" element={<CompanySettings />} />
            <Route path="/school/finance" element={<CompanyFinanceHub />} />
            <Route path="/school/contracts" element={<CompanyContracts />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </Suspense>
    </Router>
  );
}
