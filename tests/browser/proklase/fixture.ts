// Isolated browser fixture: production pages, in-memory database, no remote traffic.
const org = 'b0a00000-7e57-4000-8000-000000000001';
const tutorView = new URLSearchParams(location.search).get('view') === 'tutor-students';
const user = { id: tutorView ? 'tutor-1' : 'admin', email: 'qa@example.test' };
const features = { monthly_packages: true, student_card_booking: true, tutor_frequency_search: true };
export const useUser = () => ({ user, loading: false, profile: { organization_id: org }, refreshProfile: async () => {} });
const membership = { organizationId: org, role: 'owner', permissions: {}, entityType: 'company', status: 'active' };
export const useOrgAdminAccess = () => ({ membership, loading: false, isOwner: true, can: () => true });
const hasFeature = (id: string) => !!features[id as keyof typeof features];
export const useOrgFeatures = () => ({ loading: false, hasFeature, organizationId: org, entityType: 'company', features, isOrgUser: true, contactVisibility: null });
export const useOrgTutorPolicy = () => ({ loading: false, isOrgTutor: true, organizationId: org, canEditStudents: true, canManageStudents: true, canSeePrices: true });
const profiles = ['Rūta Matematikė', 'Jonas Kalbininkas'].map((full_name, index) => ({ id: `tutor-${index + 1}`, full_name, email: `tutor${index}@example.test`, organization_id: org, has_active_license: true, teaching_notes: index ? 'Lietuvių kalba, 1–8 klasės' : 'Matematika, 2–12 klasės; pasiruošimas egzaminams', company_commission_percent: 12 }));
const students = profiles.map((profile, index) => ({ id: `student-${index + 1}`, full_name: 'Naglis Testinis', email: 'naglis@example.test', linked_user_id: 'child', organization_id: org, tutor_id: profile.id, tutor: { full_name: profile.full_name }, grade: '6 klasė', status: 'active', enrollment_status: 'active', is_active: true, payment_model: 'per_lesson', pricing_lessons_per_week: 1, pricing_lessons_per_week_is_manual: false, admin_comment: null, admin_comment_visible_to_tutor: false, created_at: '2026-09-01', payer_name: 'Mama Testinė', payer_email: 'mama@example.test' }));
const persisted = JSON.parse(localStorage.getItem('proklase-qa-students') || 'null');
const db: Record<string, any[]> = {
  profiles, students: persisted || students,
  organization_admins: [{ id: 'admin-seat', user_id: 'admin', organization_id: org }],
  organizations: [{ id: org, name: 'Pro klasė QA', entity_type: 'company', features, invoice_issuer_mode: 'both', tutor_license_count: 10 }],
  invoice_profiles: [{ id: 'invoice-profile', organization_id: org, business_name: 'Pro klasė QA', entity_type: 'mb' }],
  subjects: profiles.map((p, i) => ({ id: `subject-${i + 1}`, tutor_id: p.id, name: i ? 'Lietuvių kalba' : 'Matematika', color: '#6366f1', price: 30, duration_minutes: 60 })),
  organization_dynamic_pricing: [1, 2, 3].map((n) => ({ id: `price-${n}`, organization_id: org, grade_min: 1, grade_max: 8, lessons_per_week: n, price: n === 1 ? 30 : n === 2 ? 25 : 22 })),
  invoices: [
    { id: 'invoice-client', invoice_number: 'PK-001', issue_date: '2026-09-07', created_at: '2026-09-07', organization_id: org, issued_by_user_id: 'tutor-1', seller_snapshot: { name: 'Pro klasė QA', companyCode: '123' }, buyer_snapshot: { name: 'Mama Testinė', email: 'mama@example.test' }, total_amount: 15, status: 'paid' },
    { id: 'invoice-tutor', invoice_number: 'RT-001', issue_date: '2026-09-06', created_at: '2026-09-06', organization_id: org, issued_by_user_id: 'tutor-1', seller_snapshot: { name: 'Rūta Matematikė' }, buyer_snapshot: { name: 'Pro klasė QA' }, total_amount: 120, status: 'issued' },
  ],
};
const persist = () => localStorage.setItem('proklase-qa-students', JSON.stringify(db.students));
const calls: any[] = [];
(window as any).__qa = { db, calls };
function from(table: string) {
  let single = false, patch: any, range: number[] | undefined;
  const filters: ((row: any) => boolean)[] = [];
  const q: any = new Proxy({}, { get: (_, key: string) => {
    if (key === 'then') return (resolve: any, reject: any) => {
      calls.push({ table, read: !patch, range });
      let data = (db[table] || []).filter((row) => filters.every((filter) => filter(row)));
      if (patch) { data.forEach((row) => Object.assign(row, patch)); calls.push({ table, patch, ids: data.map((r) => r.id) }); persist(); }
      if (range) data = data.slice(range[0], range[1] + 1);
      return Promise.resolve({ data: single ? data[0] || null : data, error: null, count: data.length }).then(resolve, reject);
    };
    return (...args: any[]) => {
      if (key === 'eq') filters.push((row) => row[args[0]] === args[1]);
      if (key === 'gte') filters.push((row) => row[args[0]] >= args[1]);
      if (key === 'lte') filters.push((row) => row[args[0]] <= args[1]);
      if (key === 'in') filters.push((row) => args[1].includes(row[args[0]]));
      if (key === 'is') filters.push((row) => (row[args[0]] ?? null) === args[1]);
      if (key === 'neq') filters.push((row) => row[args[0]] !== args[1]);
      if (key === 'update') patch = args[0];
      if (key === 'range') range = args;
      if (key === 'single' || key === 'maybeSingle') single = true;
      return q;
    };
  } });
  return q;
}
export const supabase: any = { from,
  auth: { getUser: async () => ({ data: { user } }), getSession: async () => ({ data: { session: { user, access_token: 'qa-only' } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  rpc: async (name: string, args: any) => {
    calls.push({ name, args });
    if (name === 'get_my_org_visible_tutor_ids') return { data: profiles.map((p) => ({ tutor_id: p.id })), error: null };
    if (name === 'set_student_pricing_frequency') { const s = db.students.find((r) => r.id === args.p_student_id); s.pricing_lessons_per_week = args.p_lessons_per_week; s.pricing_lessons_per_week_is_manual = args.p_lessons_per_week != null; persist(); return { data: args.p_lessons_per_week, error: null }; }
    return { data: [], error: null };
  },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
};
window.fetch = async () => new Response(JSON.stringify({ success: true, data: [], students: [], invoices: [], sessions: [] }), { headers: { 'Content-Type': 'application/json' } });
