// Entirely synthetic identities. Never seed these rows into a live company.
export const qaId = (n: number) => `ee000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const qaClock = '2026-10-08T12:00:00Z';
export const qaOrganizations = [
  { id: 'b0a00000-7e57-4000-8000-000000000001', name: 'Pro Klasė QA', email: 'pro@example.test', slug: 'proklase-qa',
    entity_type: 'company', status: 'active', brand_color: '#6366f1', brand_color_secondary: '#8b5cf6',
    logo_url: null, features: { custom_branding: true }, tutor_license_count: 0, invoice_issuer_mode: 'tutor',
    default_company_commission_percent: 14, org_subject_templates: [] },
  { id: 'c1b00000-7e57-4000-8000-000000000001', name: 'Mokslo vaisiai QA', email: 'mv@example.test', slug: 'demo-mokslo-vaisiai',
    entity_type: 'company', status: 'active', brand_color: '#124410', brand_color_secondary: '#5c2b02',
    logo_url: null, features: { custom_branding: true }, tutor_license_count: 0, invoice_issuer_mode: 'tutor',
    default_company_commission_percent: 18, org_subject_templates: [] },
];
export const qaProfiles = qaOrganizations.map((org, index) => ({
  id: qaId(index + 1), organization_id: org.id, full_name: 'Testinė Mokytoja', email: `tutor-${index + 1}@example.test`,
  company_commission_percent: index === 0 ? 14 : 18, company_individual_commission_percent: index === 0 ? 14 : 18,
  company_commission_by_subject: {}, has_active_license: true, preferred_locale: 'lt', phone: '',
  stripe_account_id: null, stripe_onboarding_complete: false, google_calendar_connected: false,
  personal_meeting_link: null, payment_timing: 'before_lesson', payment_deadline_hours: 24,
  min_booking_hours: 0, break_between_lessons: 0, subscription_status: 'active', manual_subscription_exempt: true,
  enable_manual_student_payments: false, subscription_plan: null,
}));
export const qaUsers = qaProfiles.map(profile => ({ id: profile.id, email: profile.email,
  email_confirmed_at: '2026-10-01T09:00:00Z', app_metadata: {}, user_metadata: {}, factors: [] }));
export const qaStudents = qaProfiles.flatMap((profile, index) => Array.from({ length: index === 0 ? 3 : 2 }, (_, child) => ({
  id: qaId(100 + index * 10 + child), tutor_id: profile.id, organization_id: profile.organization_id,
  full_name: `${index === 0 ? 'PK' : 'MV'} Mokinys ${child + 1}`, email: `child-${index}-${child}@example.test`,
  grade: '5', phone: '', parent_email: null, payer_email: null, parent_secondary_email: null,
  payer_phone: null, linked_user_id: null, detached_at: null, created_at: '2026-10-01T08:00:00Z',
  payment_payer: 'student', payment_model: 'per_lesson', personal_meeting_link: null,
})));
export const qaSubjects = qaProfiles.flatMap((profile, index) => [false, true].map((trial, subject) => ({
  id: qaId(200 + index * 10 + subject), tutor_id: profile.id, name: trial ? 'Bandomoji' : index === 0 ? 'Matematika PK' : 'Lietuvių kalba MV',
  is_trial: trial, is_group: false, duration_minutes: 60, price: trial ? 300 : index === 0 ? 40 : 70,
  color: index === 0 ? '#6366f1' : '#124410', meeting_link: null, grade_min: 1, grade_max: 12,
})));

function lesson(company: number, n: number, options: Record<string, unknown> = {}) {
  const tutor = qaProfiles[company];
  const children = qaStudents.filter(student => student.tutor_id === tutor.id);
  const student = children[n % children.length];
  const trial = options.trial === true;
  const subject = qaSubjects.find(subject => subject.tutor_id === tutor.id && subject.is_trial === trial)!;
  const day = String(n + 1).padStart(2, '0');
  return {
    id: qaId(300 + company * 20 + n), tutor_id: tutor.id, student_id: student.id, subject_id: subject.id,
    start_time: `2026-10-${day}T09:00:00Z`, end_time: `2026-10-${day}T10:00:00Z`,
    status: 'completed', status_confirmed_at: `2026-10-${day}T10:01:00Z`,
    price: 70 + n * 50, paid: n !== 1, payment_status: n === 1 ? 'pending' : 'paid',
    tutor_pay_eur_snapshot: null, is_complimentary: false, exclude_from_lesson_count: false,
    hidden_from_calendar: false, class_group_id: null, lesson_package_id: null, payment_batch_id: null,
    topic: `${company === 0 ? 'PK' : 'MV'} pamoka ${n + 1}`, tutor_comment: 'Testinė ataskaita',
    created_at: '2026-10-01T08:00:00Z', created_by_role: 'org_admin',
    students: student, student, subjects: subject, subject,
    ...options,
  };
}
export const qaSessions = [
  lesson(0, 0, { price: 40, tutor_pay_eur_snapshot: 14 }),
  lesson(0, 1, { price: 60, tutor_pay_eur_snapshot: 14 }),
  lesson(0, 2, { trial: true, price: 300 }),
  lesson(0, 3, { status: 'no_show', price: 400 }),
  lesson(0, 4, { status_confirmed_at: null, price: 500 }),
  lesson(0, 5, { status: 'cancelled', hidden_from_calendar: true, cancelled_at: '2026-10-06T11:00:00Z', price: 600 }),
  lesson(0, 6, { status: 'active', start_time: '2026-10-09T09:00:00Z', end_time: '2026-10-09T10:00:00Z', status_confirmed_at: null, price: 700 }),
  lesson(0, 7, { start_time: '2026-09-30T09:00:00Z', end_time: '2026-09-30T10:00:00Z', price: 800 }),
  lesson(1, 0, { tutor_pay_eur_snapshot: 22, price: 90 }),
  lesson(1, 1, { price: 100 }),
  lesson(1, 2, { trial: true, price: 300 }),
  lesson(1, 3, { status: 'no_show', price: 400 }),
  lesson(1, 4, { status: 'cancelled', hidden_from_calendar: true, cancelled_at: '2026-10-05T11:00:00Z', price: 500 }),
  lesson(1, 5, { status: 'active', start_time: '2026-10-09T11:00:00Z', end_time: '2026-10-09T12:00:00Z', status_confirmed_at: null, price: 600 }),
  lesson(1, 6, { start_time: '2026-09-30T11:00:00Z', end_time: '2026-09-30T12:00:00Z', tutor_pay_eur_snapshot: 17, price: 700 }),
];
export const qaAdjustments = [
  { id: qaId(400), tutor_id: qaProfiles[0].id, organization_id: qaOrganizations[0].id, amount_eur: -10,
    type: 'penalty_missing_report', reason: 'Testinis koregavimas', created_at: '2026-10-04T12:00:00Z' },
  { id: qaId(401), tutor_id: qaId(99), organization_id: qaOrganizations[0].id, amount_eur: 999,
    type: 'bonus', reason: 'Kito korepetitoriaus duomenys', created_at: '2026-10-04T12:00:00Z' },
];
export const qaInvoiceProfiles = qaProfiles.map((profile, index) => ({
  id: qaId(500 + index), user_id: profile.id, entity_type: 'individuali_veikla', activity_number: `QA${index + 1}`,
  business_name: 'Testinė Mokytoja', contact_email: profile.email, invoice_series: index === 0 ? 'PK' : 'MV',
}));
export const qaInvoices = qaProfiles.map((profile, index) => ({
  id: qaId(600 + index), invoice_number: index === 0 ? 'PK-ATLYGIS-001' : 'MV-ATLYGIS-001',
  organization_id: profile.organization_id, issued_by_user_id: profile.id,
  buyer_snapshot: { name: qaOrganizations[index].name }, total_amount: index === 0 ? 34 : 76,
  status: 'paid', issue_date: '2026-09-02', period_start: '2026-08-01', period_end: '2026-08-31',
  created_at: '2026-09-02T08:00:00Z', grouping_type: 'single', pdf_storage_path: null,
  pdf_meta: { invoiceKind: 'tutor_pay', tutorId: profile.id },
}));
// Hard-coded independent expectations, not calculated by the code under test.
export const qaExpected = [
  { total: 34, lessonTotal: 44, completed: 3, noShows: 1, students: 3, rate: 14, invoice: 'PK-ATLYGIS-001' },
  { total: 76, lessonTotal: 76, completed: 3, noShows: 1, students: 2, rate: 18, invoice: 'MV-ATLYGIS-001' },
];
