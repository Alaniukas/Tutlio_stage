import { useLocation, useNavigate } from 'react-router-dom';
import Layout from '@/components/Layout';
import ParentLayout from '@/components/ParentLayout';
import StudentLayout from '@/components/StudentLayout';
import { InAppSupportPageContent } from '@/components/support/InAppSupportAgent';
import { supportHomeForPath } from '@/lib/inAppSupport';

type SupportLocationState = {
  supportSourcePath?: string;
};

export default function InAppSupport() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as SupportLocationState | null;
  const sourcePath = state?.supportSourcePath;
  const content = (
    <InAppSupportPageContent
      sourcePath={sourcePath}
      onDone={() => navigate(supportHomeForPath(location.pathname))}
    />
  );

  if (location.pathname.startsWith('/company/') || location.pathname.startsWith('/school/')) {
    return content;
  }

  if (location.pathname.startsWith('/student/')) {
    return <StudentLayout><div className="px-3 py-4 sm:px-5 sm:py-6">{content}</div></StudentLayout>;
  }

  if (location.pathname.startsWith('/parent/')) {
    return <ParentLayout><div className="px-3 py-4 sm:px-5 sm:py-6">{content}</div></ParentLayout>;
  }

  return <Layout>{content}</Layout>;
}
