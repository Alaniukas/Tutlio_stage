import { Link, useSearchParams } from 'react-router-dom';
import SchoolStaffConsent from '@/pages/SchoolStaffConsent';
import { CompanyStaffDocumentsContent, type StaffDocument } from '@/pages/company/CompanyStaffDocuments';

const ORG_ID = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';

function sample(
  id: string,
  group: string,
  name: string,
  email: string,
  type: StaffDocument['staff_document_type'],
  signingStatus: string,
  status: StaffDocument['status'],
): StaffDocument {
  return {
    id, organization_id: ORG_ID, counterparty_name: name, counterparty_email: email,
    staff_document_type: type, staff_document_group_id: group,
    staff_employment_contract_number: 'DS-2026-17', staff_employment_contract_date: '2026-09-01',
    staff_consent_answers: type === 'consent' && signingStatus !== 'draft' ? Array(10).fill('yes') : null,
    staff_revoked_at: null, signing_status: signingStatus, status,
    sent_at: status === 'draft' ? null : '2026-09-19T10:00:00Z',
    signed_at: status === 'signed' ? '2026-09-20T10:00:00Z' : null,
    pdf_url: type === 'consent' && signingStatus === 'draft' ? null : 'preview.pdf',
    signed_contract_url: status === 'signed' ? 'preview-signed.pdf' : null,
    staff_files_deleted_at: null,
  };
}

const documents: StaffDocument[] = [
  sample('a1', 'group-a', 'Austėja Kazlauskaitė', 'austeja@example.com', 'confidentiality', 'awaiting_school_signature', 'draft'),
  sample('a2', 'group-a', 'Austėja Kazlauskaitė', 'austeja@example.com', 'consent', 'draft', 'sent'),
  sample('b1', 'group-b', 'Mantas Žukauskas', 'mantas@example.com', 'confidentiality', 'signed_by_school', 'viewed'),
  sample('b2', 'group-b', 'Mantas Žukauskas', 'mantas@example.com', 'consent', 'awaiting_school_signature', 'viewed'),
  sample('c1', 'group-c', 'Rūta Stankevičienė', 'ruta@example.com', 'confidentiality', 'signed', 'signed'),
  sample('c2', 'group-c', 'Rūta Stankevičienė', 'ruta@example.com', 'consent', 'signed', 'signed'),
];

export default function PreviewStaffDocuments() {
  const [params] = useSearchParams();
  const consent = params.get('view') === 'consent';
  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="mx-auto flex max-w-6xl gap-4 px-4 pt-4 text-sm text-indigo-700 sm:px-6">
        <Link to="/preview/staff-documents">Administratoriaus ekranas</Link>
        <Link to="/preview/staff-documents?view=consent">Darbuotojo sutikimo forma</Link>
      </nav>
      {consent
        ? <SchoolStaffConsent previewInfo={{ schoolName: 'VšĮ „Laisvi vaikai“', employeeName: 'Austėja Kazlauskaitė' }} />
        : <CompanyStaffDocumentsContent canEdit previewData={{ organizationId: ORG_ID, documents }} />}
    </div>
  );
}
