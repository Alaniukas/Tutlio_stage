import { useState } from 'react';
import CompanyStaffContracts, {
  type TeacherContract,
  type TeacherContractOption,
  type TeacherContractStatus,
} from '@/pages/company/CompanyStaffContracts';

const ORG_ID = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';

const initialContracts: TeacherContract[] = [
  {
    id: 'preview-awaiting-school',
    organization_id: ORG_ID,
    contract_number: 'KONF-2026-001',
    party_kind: 'teacher',
    counterparty_name: 'Austėja Kazlauskaitė',
    counterparty_email: 'austeja@example.com',
    signing_status: 'awaiting_school_signature',
    signed_at: null,
    sent_at: null,
    created_at: '2026-09-16T08:00:00.000Z',
    pdf_url: 'preview/confidentiality-austeja.pdf',
  },
  {
    id: 'preview-awaiting-teacher',
    organization_id: ORG_ID,
    contract_number: 'KONF-2026-002',
    party_kind: 'teacher',
    counterparty_name: 'Mantas Žukauskas',
    counterparty_email: 'mantas@example.com',
    signing_status: 'signed_by_school',
    signed_at: null,
    sent_at: '2026-09-15T12:30:00.000Z',
    created_at: '2026-09-15T09:00:00.000Z',
    pdf_url: 'preview/confidentiality-mantas.pdf',
  },
  {
    id: 'preview-signed',
    organization_id: ORG_ID,
    contract_number: 'KONF-2026-003',
    party_kind: 'teacher',
    counterparty_name: 'Rūta Stankevičienė',
    counterparty_email: 'ruta@example.com',
    signing_status: 'signed',
    signed_at: '2026-09-14T14:20:00.000Z',
    sent_at: '2026-09-12T10:00:00.000Z',
    created_at: '2026-09-12T08:00:00.000Z',
    pdf_url: 'preview/confidentiality-ruta.pdf',
    signed_contract_url: 'preview/confidentiality-ruta-signed.pdf',
  },
];

function PreviewStatusBadge({ status }: { status: TeacherContractStatus }) {
  const labels: Record<TeacherContractStatus, string> = {
    draft: 'Juodraštis',
    sent: 'Išsiųsta',
    awaiting_school_signature: 'Laukia mokyklos parašo',
    signed_by_school: 'Pasirašyta mokyklos',
    signed: 'Pasirašyta abiejų šalių',
  };
  const colors: Record<TeacherContractStatus, string> = {
    draft: 'bg-gray-100 text-gray-600',
    sent: 'bg-amber-50 text-amber-700',
    awaiting_school_signature: 'bg-indigo-50 text-indigo-700',
    signed_by_school: 'bg-blue-50 text-blue-700',
    signed: 'bg-green-50 text-green-700',
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colors[status]}`}>{labels[status]}</span>;
}

const previewTeachers: TeacherContractOption[] = [
  { id: 'preview-teacher-a', full_name: 'Austėja Kazlauskaitė', email: 'austeja@example.com' },
  { id: 'preview-teacher-b', full_name: 'Mantas Žukauskas', email: 'mantas@example.com' },
];

export default function PreviewStaffContracts() {
  const [contracts, setContracts] = useState(initialContracts);
  const [toast, setToast] = useState('');

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 rounded-2xl bg-slate-900 p-6 text-white shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">VšĮ „Laisvi vaikai“</p>
          <h1 className="mt-2 text-2xl font-bold">Mokytojų konfidencialumo sutartys</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">Vietinis UI preview su mokytojų pasirašymo etapais.</p>
        </div>
        {toast && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{toast}</div>}
        <CompanyStaffContracts
          orgId={ORG_ID}
          eSignEnabled
          contracts={contracts}
          saving={false}
          onSignAsSchool={(contract) => setToast(`Atidaromas GoSign srautas: ${contract.counterparty_name}`)}
          onReload={() => setToast('Sąrašas atnaujintas')}
          onDelete={(id) => setContracts((current) => current.filter((contract) => contract.id !== id))}
          onOpenFile={() => setToast('PDF peržiūra atidaroma naujame lange')}
          statusBadge={(status) => <PreviewStatusBadge status={status} />}
          onToast={(message) => setToast(message)}
          availableTeachers={previewTeachers}
        />
      </div>
    </main>
  );
}
