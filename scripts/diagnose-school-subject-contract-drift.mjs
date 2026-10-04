/**
 * Report signed individual extra-lessons contracts whose frozen subject_id
 * no longer matches September+ session rows (common after subject recreation).
 *
 * Usage: node scripts/diagnose-school-subject-contract-drift.mjs
 *        node scripts/diagnose-school-subject-contract-drift.mjs --org 2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const orgId = process.argv.includes('--org')
  ? process.argv[process.argv.indexOf('--org') + 1]
  : '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function namesLikelyMatch(serviceName, subjectName, studentName) {
  const a = String(serviceName || '').toLowerCase();
  const b = String(subjectName || '').toLowerCase();
  const student = String(studentName || '').toLowerCase();
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  if (!student) return false;
  return student.split(/\s+/).filter(Boolean).every((part) => a.includes(part) && b.includes(part));
}

const { data: contracts, error } = await supabase
  .from('school_contracts')
  .select('id, contract_number, student_id, order_snapshot, student:students(full_name)')
  .eq('organization_id', orgId)
  .eq('kind', 'extra_lessons')
  .is('archived_at', null)
  .eq('signing_status', 'signed')
  .filter('order_snapshot->>service_type', 'eq', 'individual');

if (error) throw error;

const subjectIds = [...new Set((contracts || []).map((row) => row.order_snapshot?.subject_id).filter(Boolean))];
const { data: subjects } = subjectIds.length
  ? await supabase.from('subjects').select('id, name').in('id', subjectIds)
  : { data: [] };
const subjectById = new Map((subjects || []).map((row) => [row.id, row.name]));

const { data: sessions } = await supabase
  .from('sessions')
  .select('id, student_id, subject_id, start_time, subject:subjects(name), tutor:profiles!sessions_tutor_id_fkey!inner(organization_id)')
  .eq('tutor.organization_id', orgId)
  .is('class_group_id', null)
  .gte('start_time', '2026-09-01')
  .lt('start_time', '2026-10-01');

const rows = [];
for (const contract of contracts || []) {
  const snapId = contract.order_snapshot?.subject_id || null;
  const serviceName = contract.order_snapshot?.service_name || '';
  const studentName = contract.student?.full_name || '';
  const studentSessions = (sessions || []).filter((session) => session.student_id === contract.student_id);
  const mismatched = studentSessions.filter((session) => snapId && session.subject_id !== snapId);
  if (!mismatched.length) continue;
  const snapExists = snapId ? subjectById.has(snapId) : false;
  const likelySameService = mismatched.filter((session) => namesLikelyMatch(
    serviceName,
    session.subject?.name,
    studentName,
  ));
  rows.push({
    contract: contract.contract_number,
    student: studentName,
    serviceName,
    snapSubjectId: snapId,
    snapSubjectExists: snapExists,
    mismatchedSessions: mismatched.length,
    likelySameServiceSessions: likelySameService.length,
    exampleSessionSubject: mismatched[0]?.subject?.name || null,
  });
}

if (!rows.length) {
  console.log('No individual contract/session subject drift found for September 2026.');
  process.exit(0);
}

console.log(`Individual subject drift (${rows.length} contracts):`);
for (const row of rows.sort((a, b) => b.mismatchedSessions - a.mismatchedSessions)) {
  console.log(`- ${row.student} / ${row.contract}: ${row.mismatchedSessions} session(s), ${row.likelySameServiceSessions} look like the same service by name`);
  console.log(`  contract service: ${row.serviceName}`);
  console.log(`  frozen subject ${row.snapSubjectId} exists in DB: ${row.snapSubjectExists}`);
  console.log(`  example session subject: ${row.exampleSessionSubject}`);
}
console.log('\nSessions usually already point at the current subject. Signed contract snapshots stay unchanged; billing should match by service name.');
