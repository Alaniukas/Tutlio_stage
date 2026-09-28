/** Demo-only, own-record fixture. Plan: node this-file. Write after migrations/provisioning: --apply. */
import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const organizationId = 'c3a00000-7e57-4000-8000-000000000001';
const qaPrefix = 'QA Šeima 2026-09-28';
const childIds = [101, 102, 103].map(index => `c3f00000-7e57-4000-8000-${String(index).padStart(12, '0')}`);
const specialistId = 'c3f00000-7e57-4000-8000-000000000401';
const specialistEmail = 'alaniukasa+school-specialist-20260928@gmail.com';
const bookingIds = [201, 202, 203].map(index => `c3f00000-7e57-4000-8000-${String(index).padStart(12, '0')}`);
const noteIds = [301, 302, 303].map(index => `c3f00000-7e57-4000-8000-${String(index).padStart(12, '0')}`);
const output = resolve(root, 'tmp', 'school-family-qa-20260928');
const manifestPath = resolve(output, 'consultation-manifest.json');
const credentialsPath = resolve(output, 'consultation-credentials.json');

function checked(result, label) {
  if (result.error) throw new Error(`${label} failed`);
  return result.data;
}
function requireCondition(condition, message) { if (!condition) throw new Error(message); }
function plan() {
  return { organizationId, qaPrefix, childIds, specialistId, bookingIds, noteIds,
    prerequisites: ['190000 + 190200 migrations applied', 'three own QA children provisioned with two distinct guardian accounts'],
    bookings: ['whole first family', 'first child only', 'other family child only'],
    emailDelivery: 'none', writes: 'own Demo QA records only', cleanupManifest: manifestPath };
}

async function apply() {
  const localEnv = Object.fromEntries(readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/).flatMap(line => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    return match ? [[match[1], match[2].trim().replace(/^(["'])(.*)\1$/, '$2')]] : [];
  }));
  const url = localEnv.VITE_SUPABASE_URL || localEnv.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = localEnv.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  requireCondition(url && new URL(url).origin === 'https://cuhciqwmqfuajeeqjjbm.supabase.co' && key, 'Expected configured project credentials');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const org = checked(await db.from('organizations').select('id, entity_type, features').eq('id', organizationId).single(), 'Demo organization');
  requireCondition(org.entity_type === 'school' && org.features?.school_family_portal === true, 'Demo family portal must be enabled');
  // These selects prove both new schemas exist before creating even the QA specialist.
  checked(await db.from('school_consultation_notes').select('id').limit(0), 'Consultation notes schema');
  checked(await db.from('school_consultations').select('id, target_kind, family_student_ids').limit(0), 'Consultation target schema');
  const children = checked(await db.from('students').select('id, full_name, organization_id, linked_user_id')
    .eq('organization_id', organizationId).in('id', childIds), 'QA children');
  requireCondition(children.length === 3 && children.every(child => child.full_name.startsWith(qaPrefix) && child.linked_user_id), 'Only the new provisioned QA children may be used');
  const guardians = checked(await db.from('school_family_guardians').select('student_id, guardian_user_id, guardian_email, guardian_name, annual_contract_id, evidence_source, signature_id, signature_personal_code_hash')
    .eq('organization_id', organizationId).in('student_id', childIds), 'QA guardian bindings');
  const guardianByChild = new Map(guardians.map(binding => [binding.student_id, binding]));
  const first = guardianByChild.get(childIds[0]);
  const second = guardianByChild.get(childIds[1]);
  const other = guardianByChild.get(childIds[2]);
  requireCondition(first?.guardian_user_id && first.guardian_user_id === second?.guardian_user_id
    && other?.guardian_user_id && other.guardian_user_id !== first.guardian_user_id,
  'Expected two own QA families');
  requireCondition(first.guardian_email === 'alaniukasa+school-family-20260928@gmail.com'
    && other.guardian_email === 'alaniukasa+school-other-20260928@gmail.com', 'Only approved QA parent aliases may be used');
  const parents = [first.guardian_user_id, other.guardian_user_id];
  const sharedChildren = checked(await db.from('students').select('id').eq('organization_id', organizationId).in('linked_user_id', parents), 'Distinct QA parent roles');
  requireCondition(sharedChildren.length === 0, 'QA parent and child Auth identities must be separate');
  const annuals = checked(await db.from('school_contracts').select('id, student_id').eq('organization_id', organizationId)
    .in('id', guardians.map(binding => binding.annual_contract_id)).eq('kind', 'annual').eq('signing_status', 'signed')
    .is('archived_at', null).is('terminated_at', null), 'Current QA annual contracts');
  requireCondition(annuals.length === 3 && guardians.every(binding => annuals.some(contract => contract.id === binding.annual_contract_id && contract.student_id === binding.student_id)), 'All QA guardian contracts must be current');
  for (const binding of guardians) {
    const signatures = checked(await db.from('school_contract_signatures').select('id, signer_email, signer_name, signer_personal_code')
      .eq('contract_id', binding.annual_contract_id).eq('role', 'parent_primary').eq('status', 'signed'), 'QA primary signature');
    if (binding.evidence_source === 'admin_verified') {
      requireCondition(signatures.length === 0, 'Manual QA guardian evidence must have no signed primary signature');
      continue;
    }
    const signature = signatures.find(row => row.id === binding.signature_id);
    const normalizedName = value => String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('lt');
    requireCondition(binding.evidence_source === 'signed_primary' && signature?.signer_email?.trim().toLowerCase() === binding.guardian_email
      && normalizedName(signature.signer_name) === normalizedName(binding.guardian_name)
      && createHash('sha256').update(String(signature.signer_personal_code || '').trim().replace(/\s+/g, '')).digest('hex') === binding.signature_personal_code_hash,
    'QA guardian evidence must match the current signature');
  }
  mkdirSync(output, { recursive: true });
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : plan();
  requireCondition(manifest.organizationId === organizationId && manifest.specialistId === specialistId, 'Unexpected consultation fixture manifest');
  const existingAuth = await db.auth.admin.getUserById(specialistId);
  if (existingAuth.data?.user) {
    requireCondition(existingAuth.data.user.email === specialistEmail && existingAuth.data.user.user_metadata?.qa_fixture === qaPrefix,
      'Existing Auth identity is not this fixture; no account will be reset');
  } else {
    requireCondition(!existingAuth.error || existingAuth.error.status === 404, 'Unable to check QA specialist Auth identity');
    // Recovery-safe: save random credentials before createUser; never print or email them.
    const credentials = existsSync(credentialsPath) ? JSON.parse(readFileSync(credentialsPath, 'utf8'))
      : { email: specialistEmail, password: `Qa!${randomBytes(24).toString('base64url')}`, userId: specialistId };
    requireCondition(credentials.email === specialistEmail && credentials.userId === specialistId, 'Unexpected QA credentials file');
    writeFileSync(credentialsPath, JSON.stringify(credentials, null, 2), { mode: 0o600 });
    const created = await db.auth.admin.createUser({ id: specialistId, email: specialistEmail, password: credentials.password,
      email_confirm: true, user_metadata: { full_name: `${qaPrefix} specialistas`, qa_fixture: qaPrefix } });
    checked(created, 'New own QA specialist Auth');
  }
  // No existing teacher or unrelated profile is modified.
  const profile = checked(await db.from('profiles').select('id, full_name, organization_id').eq('id', specialistId).maybeSingle(), 'Own QA specialist profile');
  requireCondition(!profile || (profile.full_name?.startsWith(qaPrefix) && (!profile.organization_id || profile.organization_id === organizationId)), 'Unexpected profile owner');
  checked(await db.from('profiles').upsert({ id: specialistId, email: specialistEmail, full_name: `${qaPrefix} specialistas`,
    organization_id: organizationId, help_team_category: 'psychologist', has_active_license: true }, { onConflict: 'id' }), 'Own QA specialist profile');
  const existingBookings = checked(await db.from('school_consultations').select('id, organization_id, audience_note, tutor_id').in('id', bookingIds), 'Own QA bookings');
  requireCondition(existingBookings.every(row => row.organization_id === organizationId && row.tutor_id === specialistId && row.audience_note === qaPrefix), 'Unexpected booking owner');
  const existingNotes = checked(await db.from('school_consultation_notes').select('id, organization_id, consultation_id, author_user_id').in('id', noteIds), 'Own QA notes');
  requireCondition(existingNotes.every(row => row.organization_id === organizationId && row.author_user_id === specialistId && bookingIds.includes(row.consultation_id)), 'Unexpected note owner');
  const year = new Date().getFullYear();
  const schoolYear = new Date().getMonth() >= 8 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
  const common = { organization_id: organizationId, tutor_id: specialistId, kind: 'help_team', help_team_category: 'psychologist',
    mode: 'individual', status: 'confirmed', school_year: schoolYear, planned_minutes: 45, is_paid: false, price_eur: 0, audience_note: qaPrefix };
  const rows = bookingIds.map((id, index) => {
    const start = new Date(Date.now() + (index + 2) * 86_400_000);
    return { ...common, id, student_id: childIds[index === 0 ? 0 : index === 1 ? 0 : 2], target_kind: index === 0 ? 'family' : 'child',
      family_student_ids: index === 0 ? childIds.slice(0, 2) : [], start_time: start.toISOString(), end_time: new Date(start.getTime() + 45 * 60_000).toISOString() };
  });
  // Insert-only fixture creation preserves any edits made through the browser on reruns.
  const missingRows = rows.filter(row => !existingBookings.some(existing => existing.id === row.id));
  if (missingRows.length) checked(await db.from('school_consultations').insert(missingRows), 'New own QA reservations');
  const notes = noteIds.map((id, index) => ({ id, organization_id: organizationId, consultation_id: bookingIds[index], author_user_id: specialistId,
    body: `${qaPrefix}: privatumo bandymo pastaba ${index + 1}. Jokių tikrų šeimos ar sveikatos duomenų.` }));
  const missingNotes = notes.filter(row => !existingNotes.some(existing => existing.id === row.id));
  if (missingNotes.length) checked(await db.from('school_consultation_notes').insert(missingNotes), 'New own QA notes');
  writeFileSync(manifestPath, JSON.stringify({ ...manifest, parentUserIds: parents, childUserIds: children.map(child => child.linked_user_id),
    annualContractIds: annuals.map(contract => contract.id), seededAt: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ ok: true, organizationId, reservations: bookingIds.length, notes: noteIds.length, manifest: manifestPath, credentialsFile: credentialsPath }));
}

if (process.argv.includes('--apply')) {
  apply().catch(() => { console.error('Consultation QA seed failed. No secrets or private notes are logged.'); process.exitCode = 1; });
} else console.log(JSON.stringify(plan(), null, 2));
