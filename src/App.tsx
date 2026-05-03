import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { UserProvider } from '@/contexts/UserContext';
import Login from '@/pages/Login';
import AuthCallback from '@/pages/AuthCallback';
import Register from '@/pages/Register';
import ResetPassword from '@/pages/ResetPassword';
import DashboardPage from '@/pages/Dashboard';
import CalendarPage from '@/pages/Calendar';
import StudentsPage from '@/pages/Students';
import WaitlistPage from '@/pages/Waitlist';
import SettingsPage from '@/pages/Settings';
import LessonSettingsPage from '@/pages/LessonSettings';
import FinancePage from '@/pages/Finance';
import ProtectedRoute from '@/components/ProtectedRoute';
import StudentOnboarding from '@/pages/StudentOnboarding';
import StudentDashboard from '@/pages/StudentDashboard';
import StudentSchedule from '@/pages/StudentSchedule';
import StudentSessions from '@/pages/StudentSessions';
import StudentSettings from '@/pages/StudentSettings';
import StudentWaitlist from '@/pages/StudentWaitlist';
import StudentProtectedRoute from '@/components/StudentProtectedRoute';
import CompanyProtectedRoute from '@/components/CompanyProtectedRoute';
import AdminPanel from '@/pages/AdminPanel';
import CompanyLogin from '@/pages/CompanyLogin';
import CompanyLayout from '@/components/CompanyLayout';
import CompanyDashboard from '@/pages/company/CompanyDashboard';
import CompanyTutors from '@/pages/company/CompanyTutors';
import CompanyStudents from '@/pages/company/CompanyStudents';
import CompanyWaitlist from '@/pages/company/CompanyWaitlist';
import CompanySessions from '@/pages/company/CompanySessions';
import CompanyTvarkarastis from '@/pages/company/CompanyTvarkarastis';
import CompanyStats from '@/pages/company/CompanyStats';
import CompanySettings from '@/pages/company/CompanySettings';
const CompanyContracts = lazy(() => import('@/pages/company/CompanyContracts'));
import CompanyFinanceHub from '@/pages/company/CompanyFinanceHub';
import InvoicesPage from '@/pages/Invoices';

import Landing from '@/pages/Landing';
import AboutUs from '@/pages/AboutUs';
import Contact from '@/pages/Contact';
import StripeSuccess from '@/pages/StripeSuccess';
import PackagePaymentSuccess from '@/pages/PackagePaymentSuccess';
import PackagePaymentCancelled from '@/pages/PackagePaymentCancelled';
import SchoolPaymentSuccess from '@/pages/SchoolPaymentSuccess';
import TutorSubscribe from '@/pages/TutorSubscribe';
import Pricing from '@/pages/Pricing';
import Blog from '@/pages/Blog';
import BlogPost from '@/pages/BlogPost';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import TermsOfService from '@/pages/TermsOfService';
import DataProcessingAgreement from '@/pages/DataProcessingAgreement';
import Instructions from '@/pages/Instructions';
import StudentInstructions from '@/pages/StudentInstructions';
import CompanyInstructions from '@/pages/company/CompanyInstructions';
import Messages from '@/pages/Messages';
import StudentMessages from '@/pages/StudentMessages';
import CompanyMessages from '@/pages/company/CompanyMessages';
import ParentProtectedRoute from '@/components/ParentProtectedRoute';
import ParentDashboard from '@/pages/ParentDashboard';
import ParentSessions from '@/pages/ParentSessions';
import ParentInvoices from '@/pages/ParentInvoices';
import ParentMessages from '@/pages/ParentMessages';
import ParentInstructions from '@/pages/ParentInstructions';
import ParentSettings from '@/pages/ParentSettings';
import ParentRegister from '@/pages/ParentRegister';
import SchoolContractComplete from '@/pages/SchoolContractComplete';
import SupabaseAuthHashErrors from '@/components/SupabaseAuthHashErrors';
import ThemeColorManager from '@/hooks/useThemeColor';

function ProtectedWithUser() {
  return (
    <UserProvider>
      <ProtectedRoute />
    </UserProvider>
  );
}

function StudentProtectedWithUser() {
  return (
    <UserProvider>
      <StudentProtectedRoute />
    </UserProvider>
  );
}

function ParentProtectedWithUser() {
  return (
    <UserProvider>
      <ParentProtectedRoute />
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

function CompanyContractsRoute() {
  return (
    <Suspense
      fallback={<div className="flex min-h-[40vh] items-center justify-center p-6 text-gray-600">Kraunama…</div>}
    >
      <CompanyContracts />
    </Suspense>
  );
}

export default function App({ basename }: { basename: string }) {
  return (
    <Router basename={basename || undefined}>
      <SupabaseAuthHashErrors />
      <ThemeColorManager />
      <Routes>
        {/* Public Landing Pages - NO UserProvider wrapper */}
        <Route path="/" element={<Landing />} />
        <Route path="/:locale" element={<Landing />} />
        <Route path="/apie-mus" element={<AboutUs />} />
        <Route path="/:locale/apie-mus" element={<AboutUs />} />
        <Route path="/kontaktai" element={<Contact />} />
        <Route path="/:locale/kontaktai" element={<Contact />} />
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
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/register" element={<Register />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/registration/subscription" element={<TutorSubscribe />} />
        <Route path="/tutor-subscribe" element={<Navigate to="/registration/subscription" replace />} />
        <Route path="/book/:inviteCode" element={<StudentOnboarding />} />
        <Route path="/parent-register" element={<ParentRegister />} />
        <Route path="/school-contract-complete" element={<SchoolContractComplete />} />
        <Route path="/stripe-success" element={<StripeSuccess />} />
        <Route path="/package-success" element={<PackagePaymentSuccess />} />
        <Route path="/package-cancelled" element={<PackagePaymentCancelled />} />
        <Route path="/school-payment-success" element={<SchoolPaymentSuccess />} />

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
          <Route path="/student/schedule" element={<StudentSchedule />} />
          <Route path="/student/sessions" element={<StudentSessions />} />
          <Route path="/student/messages" element={<StudentMessages />} />
          <Route path="/student/waitlist" element={<StudentWaitlist />} />
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

        {/* Platform owner admin */}
        <Route path="/admin" element={<AdminPanel />} />

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
            <Route path="/company/settings" element={<CompanySettings />} />
            <Route path="/company/finance" element={<CompanyFinanceHub />} />
            <Route path="/company/contracts" element={<CompanyContractsRoute />} />

            <Route path="/school" element={<CompanyDashboard />} />
            <Route path="/school/tutors" element={<CompanyTutors />} />
            <Route path="/school/students" element={<CompanyStudents />} />
            <Route path="/school/waitlist" element={<CompanyWaitlist />} />
            <Route path="/school/sessions" element={<CompanySessions />} />
            <Route path="/school/schedule" element={<CompanyTvarkarastis />} />
            <Route path="/school/messages" element={<CompanyMessages />} />
            <Route path="/school/stats" element={<CompanyStats />} />
            <Route path="/school/instructions" element={<CompanyInstructions />} />
            <Route path="/school/settings" element={<CompanySettings />} />
            <Route path="/school/finance" element={<CompanyFinanceHub />} />
            <Route path="/school/contracts" element={<CompanyContractsRoute />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}
