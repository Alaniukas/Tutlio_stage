import Layout from '@/components/Layout';
import CompanyClassGroups from '@/pages/company/CompanyClassGroups';

/** School org tutors reach groups via /groups (tutor sidebar), not /school/groups. */
export default function TutorClassGroups() {
  return (
    <Layout>
      <CompanyClassGroups />
    </Layout>
  );
}
