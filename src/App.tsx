import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
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
import SchoolProtectedRoute from '@/components/SchoolProtectedRoute';
import AdminPanel from '@/pages/AdminPanel';
import CompanyLogin from '@/pages/CompanyLogin';
import SchoolLogin from '@/pages/SchoolLogin';
import SchoolDashboard from '@/pages/school/SchoolDashboard';
import SchoolStudents from '@/pages/school/SchoolStudents';
import SchoolContracts from '@/pages/school/SchoolContracts';
import SchoolPayments from '@/pages/school/SchoolPayments';
import SchoolSettings from '@/pages/school/SchoolSettings';
import CompanyDashboard from '@/pages/company/CompanyDashboard';
import CompanyTutors from '@/pages/company/CompanyTutors';
import CompanyStudents from '@/pages/company/CompanyStudents';
import CompanyWaitlist from '@/pages/company/CompanyWaitlist';
import CompanySessions from '@/pages/company/CompanySessions';
import CompanyTvarkarastis from '@/pages/company/CompanyTvarkarastis';
import CompanyStats from '@/pages/company/CompanyStats';
import CompanySettings from '@/pages/company/CompanySettings';
import CompanyFinance from '@/pages/company/CompanyFinance';
import CompanyInvoices from '@/pages/company/CompanyInvoices';
import InvoicesPage from '@/pages/Invoices';

import Landing from '@/pages/Landing';
import AboutUs from '@/pages/AboutUs';
import Contact from '@/pages/Contact';
import StripeSuccess from '@/pages/StripeSuccess';
import PackagePaymentSuccess from '@/pages/PackagePaymentSuccess';
import PackagePaymentCancelled from '@/pages/PackagePaymentCancelled';
import TutorSubscribe from '@/pages/TutorSubscribe';
import Pricing from '@/pages/Pricing';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import TermsOfService from '@/pages/TermsOfService';
import DataProcessingAgreement from '@/pages/DataProcessingAgreement';
import Instructions from '@/pages/Instructions';
import StudentInstructions from '@/pages/StudentInstructions';
import CompanyInstructions from '@/pages/company/CompanyInstructions';
import Messages from '@/pages/Messages';
import StudentMessages from '@/pages/StudentMessages';
import CompanyMessages from '@/pages/company/CompanyMessages';
import SupabaseAuthHashErrors from '@/components/SupabaseAuthHashErrors';

// Wrapper to provide UserContext only to authenticated routes
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

function CompanyProtectedWithUser() {
  return (
    <UserProvider>
      <CompanyProtectedRoute />
    </UserProvider>
  );
}

function SchoolProtectedWithUser() {
  return (
    <UserProvider>
      <SchoolProtectedRoute />
    </UserProvider>
  );
}

export default function App({ basename }: { basename: string }) {
  return (
    <Router basename={basename || undefined}>
      <SupabaseAuthHashErrors />
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
        <Route path="/stripe-success" element={<StripeSuccess />} />
        <Route path="/package-success" element={<PackagePaymentSuccess />} />
        <Route path="/package-cancelled" element={<PackagePaymentCancelled />} />

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

        {/* Platform owner admin */}
        <Route path="/admin" element={<AdminPanel />} />

        {/* Company admin routes - WITH UserProvider for caching */}
        <Route path="/company/login" element={<CompanyLogin />} />
        <Route element={<CompanyProtectedWithUser />}>
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
          <Route path="/company/finance" element={<CompanyFinance />} />
          <Route path="/company/invoices" element={<CompanyInvoices />} />
        </Route>

        {/* School admin routes - WITH UserProvider for caching */}
        <Route path="/school/login" element={<SchoolLogin />} />
        <Route element={<SchoolProtectedWithUser />}>
          <Route path="/school" element={<SchoolDashboard />} />
          <Route path="/school/students" element={<SchoolStudents />} />
          <Route path="/school/contracts" element={<SchoolContracts />} />
          <Route path="/school/payments" element={<SchoolPayments />} />
          <Route path="/school/settings" element={<SchoolSettings />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}
