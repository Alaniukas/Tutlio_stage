import AdminSupportRequestsPanel, { type SupportRequest } from '@/components/admin/AdminSupportRequestsPanel';

const DEMO_REQUESTS: SupportRequest[] = [
  {
    id: '8cb31cd5-7c88-43ea-b850-a337c92099c1',
    request_id: '8cb31cd5-7c88-43ea-b850-a337c92099c1',
    reporter_user_id: '11111111-1111-1111-1111-111111111111',
    reporter_name: 'Marta Kowalska',
    reporter_email: 'marta@example.com',
    reporter_role: 'organization_admin',
    organization_id: '22222222-2222-2222-2222-222222222222',
    organization_name: 'Bright Minds Academy',
    category: 'bug',
    title: 'Invoice download is blank after payment',
    context: 'On Finance > Invoices, I open a paid student invoice and choose Download PDF.',
    steps: ['Open Finance', 'Select the Invoices tab', 'Open a paid invoice', 'Choose Download PDF'],
    expected_outcome: 'The generated PDF should open with the invoice number, customer and paid total.',
    actual_outcome: 'A new browser tab opens, but the page is completely blank. It happens every time.',
    impact: 'high',
    impact_details: 'All paid invoices are affected, so I cannot send documents to parents. There is no workaround.',
    page: '/company/finance?tab=invoices',
    locale: 'en',
    environment: {
      viewport: '1440x900',
      language: 'en-GB',
      platform: 'Windows',
      userAgent: 'Chrome 140 on Windows',
      occurredAt: '2026-09-16T11:42:00.000Z',
    },
    transcript: [
      { role: 'assistant', content: 'Give the problem a short, specific title.' },
      { role: 'user', content: 'Invoice download is blank after payment' },
      { role: 'assistant', content: 'What were you trying to do, and where in Tutlio did it happen?' },
      { role: 'user', content: 'On Finance > Invoices, I open a paid student invoice and choose Download PDF.' },
    ],
    attachments: [],
    status: 'new',
    priority: 'untriaged',
    internal_note: null,
    created_at: '2026-09-16T11:42:00.000Z',
    updated_at: '2026-09-16T11:42:00.000Z',
  },
  {
    id: '971bf5d4-41e2-4a63-aa4a-438343f02ec1',
    request_id: '971bf5d4-41e2-4a63-aa4a-438343f02ec1',
    reporter_user_id: '33333333-3333-3333-3333-333333333333',
    reporter_name: 'Jonas Petrauskas',
    reporter_email: 'jonas@example.com',
    reporter_role: 'tutor',
    organization_id: null,
    organization_name: null,
    category: 'feature',
    title: 'Let parents reschedule from reminder emails',
    context: 'Parents currently contact me manually when the reminder arrives and the time no longer works.',
    steps: ['Open the lesson reminder', 'Choose another available time', 'Confirm the change', 'Notify tutor and parent'],
    expected_outcome: 'Parents can resolve a schedule conflict without a separate chat while existing cancellation rules still apply.',
    actual_outcome: null,
    impact: 'medium',
    impact_details: 'About five parents ask each week. This would save around 30 minutes of coordination.',
    page: '/calendar',
    locale: 'lt',
    environment: { viewport: '390x844', language: 'lt-LT', platform: 'iPhone', userAgent: 'Mobile Safari', occurredAt: '2026-09-16T10:10:00.000Z' },
    transcript: [],
    attachments: [],
    status: 'planned',
    priority: 'medium',
    internal_note: 'Susieti su priminimų atnaujinimo užduotimi.',
    created_at: '2026-09-16T10:10:00.000Z',
    updated_at: '2026-09-16T10:30:00.000Z',
  },
];

export default function PreviewAdminSupport() {
  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-300">Tutlio Admin</p>
          <h1 className="mt-1 text-2xl font-black">Pagalba</h1>
        </div>
        <AdminSupportRequestsPanel adminSecret="demo" demoRequests={DEMO_REQUESTS} />
      </div>
    </div>
  );
}
