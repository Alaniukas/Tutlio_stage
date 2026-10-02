// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { schoolMaterialDigestDatabase } from '../fixtures/schoolMaterialDigestDatabase';

const state = vi.hoisted(() => ({ recipient: vi.fn(), allowed: vi.fn(), denied: vi.fn() }));
vi.mock('../../api/_lib/schoolMaterialPublications.js', async original => ({
  ...await original<typeof import('../../api/_lib/schoolMaterialPublications')>(), schoolMaterialRecipient: state.recipient, schoolStudentMayViewPublication: state.allowed,
}));
vi.mock('../../api/_lib/schoolRecordingAccessDenials.js', () => ({ deniedRecordingOrganizations: state.denied }));
vi.mock('../../api/_lib/notificationLocale.js', () => ({ notificationLocale: async () => 'en' }));
import { deliverSchoolMaterialDigest, dueSchoolMaterialDigestIds, holdExpiredSchoolMaterialDigests, prepareSchoolMaterialDigests, queueSchoolMaterialAudience, repairSchoolMaterialDigestEntries } from '../../api/_lib/schoolMaterialDigest';

const uid = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const org = uid(1), childA = uid(101), childB = uid(102), childC = uid(103), publicationA = uid(201), publicationB = uid(202), publicationC = uid(203);
const instances: Awaited<ReturnType<typeof schoolMaterialDigestDatabase>>[] = [];
const pub = (id = publicationA, version = 'v1', label = 'Teacher file') => ({ id, organization_id: org, source: 'session_file', target_id: uid(501), file_id: `${uid(501)}/teacher.pdf`, source_version: version, label,
  first_published_at: new Date(Date.now() - (version === 'v1' ? 120_000 : 60_000)).toISOString(), legacy_access: false });
async function database(extra: Record<string, Record<string, any>[]> = {}) {
  const db = await schoolMaterialDigestDatabase({
    organizations: [{ id: org, name: 'Own School', entity_type: 'school', features: { school_family_portal: true }, preferred_locale: 'en' }],
    students: [{ id: childA, organization_id: org, full_name: 'Child A', email: 'child@school.test', enrollment_status: 'active' },
      { id: childB, organization_id: org, full_name: 'Child B', email: null, enrollment_status: 'active' },
      { id: childC, organization_id: org, full_name: 'Child C', email: 'other-child@school.test', enrollment_status: 'active' }],
    school_material_publications: [pub()],
    school_material_digest_entries: [{ publication_id: publicationA, student_id: childA }], parent_profiles: [], ...extra,
  });
  instances.push(db); return db;
}
beforeEach(() => {
  state.recipient.mockReset().mockImplementation(async (_db, child) => ({ email: child.email || 'guardian@school.test', kind: child.email ? 'student' : 'payer', name: child.full_name }));
  state.allowed.mockReset().mockResolvedValue(true); state.denied.mockReset().mockResolvedValue(new Set());
  vi.stubEnv('TUTLIO_DEV_SUPPRESS_EMAIL', '');
});
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(instances.splice(0).map(db => db.pg.close())); });
const prepare = (db: Awaited<ReturnType<typeof database>>, now = new Date()) => prepareSchoolMaterialDigests(db.client, { origin: 'https://school.test', now });
async function delivery(db: Awaited<ReturnType<typeof database>>, id: string) { return (await db.pg.query<any>('SELECT * FROM school_material_digest_deliveries WHERE id=$1', [id])).rows[0]; }

it('renders only the latest file revision but atomically consumes every revision entry and preserves child/guardian fanout', async () => {
  const db = await database({ school_material_publications: [pub(), pub(publicationB, 'v2', 'Updated teacher file'), { ...pub(publicationC, 'v2', 'Sibling file'), file_id: `${uid(501)}/sibling.pdf` }],
    school_material_digest_entries: [{ publication_id: publicationA, student_id: childA }, { publication_id: publicationB, student_id: childA }, { publication_id: publicationC, student_id: childB }] });
  const ids = await prepare(db);
  expect(ids).toHaveLength(2);
  const rows = (await db.pg.query<any>('SELECT * FROM school_material_digest_deliveries ORDER BY recipient_email')).rows;
  expect(rows.map(row => row.recipient_email)).toEqual(['child@school.test', 'guardian@school.test']);
  expect(rows[0].payload.items).toHaveLength(1); expect(rows[0].payload.items[0]).toMatchObject({ publication_id: publicationB, label: 'Updated teacher file' });
  expect(rows[0].payload.html).not.toContain('>Homework: Teacher file<');
  expect(rows[0].payload.items[0].url).toContain('/student/homework'); expect(rows[1].payload.items[0].url).toContain('/parent/homework');
  expect((await db.pg.query<any>("SELECT state FROM school_material_digest_entries")).rows.map(row => row.state)).toEqual(['queued','queued','queued']);
  expect(await prepare(db)).toEqual([]);
  const claims = db.calls.filter(call => call.table === 'school_reserve_material_digest');
  expect(claims[0].payload.p_entries).toHaveLength(2);
});

it('sends one branded digest with a signed homework link without enabling family accounts, and excludes pre-policy publications', async () => {
  vi.stubEnv('JOIN_LINK_SECRET', 'synthetic-digest-secret');
  const cutoff = new Date(Date.now() - 300_000).toISOString();
  const db = await database({ organizations: [{ id: org, name: 'Email Only School', entity_type: 'school',
      features: { school_join_and_material_notifications: true, public_name: 'Own Brand' }, preferred_locale: 'en' }],
    school_material_baselines: [{ organization_id: org, notifications_started_at: cutoff }],
    school_material_publications: [{ ...pub(), legacy_access: true },
      { ...pub(publicationB, 'v0'), first_published_at: new Date(Date.now() - 600_000).toISOString(), legacy_access: true }],
    school_material_digest_entries: [{ publication_id: publicationA, student_id: childB }, { publication_id: publicationB, student_id: childB }],
  });
  const [id] = await prepare(db);
  expect(id).toBeTruthy();
  const row = await delivery(db, id);
  expect(row.recipient_email).toBe('guardian@school.test');
  expect(row.payload.from).toContain('Own Brand');
  expect(row.payload.items).toHaveLength(1);
  const link = new URL(row.payload.items[0].url);
  expect(link.pathname).toBe('/school-homework'); expect(link.searchParams.get('student')).toBe(childB);
  expect(link.searchParams.get('t')).toHaveLength(40);
  const send = vi.fn().mockResolvedValue({ id: 'confirmed-synthetic' });
  expect(await deliverSchoolMaterialDigest(db.client, id, send)).toBe('sent');
  expect(await prepare(db)).toEqual([]); expect(send).toHaveBeenCalledTimes(1);
  expect((await db.pg.query<any>('SELECT state FROM school_material_digest_entries WHERE publication_id=$1', [publicationB])).rows[0].state).toBe('skipped');
});

it('claims a delivery once across parallel workers and preserves its provider and sent timestamp on reruns', async () => {
  const db = await database(); const [id] = await prepare(db);
  const send = vi.fn(async () => ({ id: 'provider-confirmed' }));
  const results = await Promise.all([deliverSchoolMaterialDigest(db.client, id, send), deliverSchoolMaterialDigest(db.client, id, send)]);
  expect(results.sort()).toEqual(['deferred','sent']); expect(send).toHaveBeenCalledTimes(1);
  const original = await delivery(db, id);
  expect(send.mock.calls[0][1]).toBe(`school-material-digest/${id}`);
  expect(await deliverSchoolMaterialDigest(db.client, id, send)).toBe('deferred');
  expect((await delivery(db, id)).sent_at).toEqual(original.sent_at); expect(send).toHaveBeenCalledTimes(1);
  expect((await db.pg.query<any>('SELECT state FROM school_material_digest_entries')).rows[0].state).toBe('sent');
});

it('uses the same frozen payload and provider key after an uncertain result and stops retrying beyond23h', async () => {
  const db = await database(); const [id] = await prepare(db);
  const send = vi.fn().mockRejectedValueOnce(new Error('Transport lost')).mockResolvedValueOnce({ id: 'provider-confirmed' });
  expect(await deliverSchoolMaterialDigest(db.client, id, send)).toBe('deferred');
  await db.pg.query("UPDATE school_material_digest_deliveries SET lease_at=now()-interval '11 minutes' WHERE id=$1", [id]);
  expect(await deliverSchoolMaterialDigest(db.client, id, send)).toBe('sent');
  expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
  const other = await database(); const [otherId] = await prepare(other);
  await other.pg.query("UPDATE school_material_digest_deliveries SET state='sending',lease_at=now()-interval '25 hours',attempted_at=now()-interval '24 hours' WHERE id=$1", [otherId]);
  expect(await deliverSchoolMaterialDigest(other.client, otherId, send)).toBe('deferred');
  expect((await delivery(other, otherId)).state).toBe('review');
  expect((await other.pg.query<any>('SELECT state FROM school_material_digest_entries')).rows[0].state).toBe('queued');
  expect(await prepare(other, new Date(Date.now() + 86_400_000))).toEqual([]);
  expect(send).toHaveBeenCalledTimes(2);
});

it('repairs a crash after provider confirmation without sending again', async () => {
  const db = await database(); const [id] = await prepare(db); const send = vi.fn(async () => ({ id: 'provider-confirmed' }));
  db.failOnce('school_material_digest_entries', 'PATCH');
  await expect(deliverSchoolMaterialDigest(db.client, id, send)).rejects.toBeTruthy();
  expect((await delivery(db, id)).state).toBe('sent');
  expect((await db.pg.query<any>('SELECT state FROM school_material_digest_entries')).rows[0].state).toBe('queued');
  await repairSchoolMaterialDigestEntries(db.client);
  expect((await db.pg.query<any>('SELECT state FROM school_material_digest_entries')).rows[0].state).toBe('sent');
  expect(await deliverSchoolMaterialDigest(db.client, id, send)).toBe('deferred'); expect(send).toHaveBeenCalledTimes(1);
});

it.each(['optout','membership','recipient','flag'])('retires confirmed invalid eligibility %s and skips its entries', async reason => {
  const db = await database(); const [id] = await prepare(db); const send = vi.fn(async () => ({ id: 'unexpected' }));
  if (reason === 'optout') await db.pg.query("INSERT INTO parent_profiles(email,email_notification_opt_out) VALUES('child@school.test','[\"lesson_updates\"]')");
  if (reason === 'membership') state.allowed.mockResolvedValue(false);
  if (reason === 'recipient') state.recipient.mockResolvedValue(null);
  if (reason === 'flag') await db.pg.query("UPDATE organizations SET features='{}'");
  expect(await deliverSchoolMaterialDigest(db.client, id, send)).toBe('deferred');
  expect((await delivery(db, id)).state).toBe('skipped');
  expect((await db.pg.query<any>('SELECT state FROM school_material_digest_entries')).rows[0].state).toBe('skipped');
  expect(send).not.toHaveBeenCalled(); expect(await prepare(db)).toEqual([]);
});

it('defers unknown Drive or preference errors without retiring entries or starting the provider window', async () => {
  const db = await database(); const [id] = await prepare(db); const send = vi.fn(async () => ({ id: 'unexpected' }));
  state.allowed.mockRejectedValueOnce(new Error('Drive temporarily unavailable'));
  expect(await deliverSchoolMaterialDigest(db.client, id, send)).toBe('deferred');
  expect(await delivery(db, id)).toMatchObject({ state: 'pending', attempted_at: null });
  expect((await delivery(db, id)).lease_at).toBeTruthy();
  db.failOnce('parent_profiles', 'GET');
  expect(await deliverSchoolMaterialDigest(db.client, id, send)).toBe('deferred');
  expect((await db.pg.query<any>('SELECT state FROM school_material_digest_entries')).rows[0].state).toBe('queued');
  expect(send).not.toHaveBeenCalled();
});

it('honors a guardian Auth-only recording denial even when the child has a separate identity and no email', async () => {
  const db = await database({ school_material_publications: [{ ...pub(), source: 'drive' }],
    school_material_digest_entries: [{ publication_id: publicationA, student_id: childB }] });
  const [id] = await prepare(db); const send = vi.fn(async () => ({ id: 'unexpected' }));
  state.recipient.mockResolvedValue({ email: 'guardian@school.test', kind: 'payer', name: 'Guardian', userId: uid(401) });
  state.denied.mockImplementation(async (_db, _organizations, userId) => userId === uid(401) ? new Set([org]) : new Set());
  expect(await deliverSchoolMaterialDigest(db.client, id, send)).toBe('deferred');
  expect((await delivery(db, id)).state).toBe('skipped'); expect(send).not.toHaveBeenCalled();
  expect(state.denied.mock.calls.some(call => call[2] === uid(401))).toBe(true);
});

it('marks a guardian Auth-only denial skipped during audience fanout before it can reserve a daily email', async () => {
  const db = await database({ school_material_publications: [{ ...pub(), source: 'drive', target_id: `subject:${uid(502)}` }], school_material_digest_entries: [] });
  vi.spyOn(db.client, 'rpc').mockImplementation(() => Promise.resolve({ data: [{ publication_id: publicationA, student_id: childB }], error: null }) as any);
  state.recipient.mockResolvedValue({ email: 'guardian@school.test', kind: 'payer', name: 'Guardian', userId: uid(401) });
  state.denied.mockImplementation(async (_db, _organizations, userId) => userId === uid(401) ? new Set([org]) : new Set());
  expect(await queueSchoolMaterialAudience(db.client)).toBe(1);
  expect((await db.pg.query<any>('SELECT state FROM school_material_digest_entries')).rows[0].state).toBe('skipped');
  expect(await prepare(db)).toEqual([]);
});

it('keeps an uncertain audience pair retryable while fanout for another child can progress', async () => {
  const db = await database({ school_material_publications: [{ ...pub(), source: 'drive', target_id: `subject:${uid(502)}` }], school_material_digest_entries: [] });
  vi.spyOn(db.client, 'rpc').mockImplementation(() => Promise.resolve({ data: [childA, childB].map(student_id => ({ publication_id: publicationA, student_id })), error: null }) as any);
  state.recipient.mockRejectedValueOnce(new Error('Guardian lookup unavailable')).mockResolvedValueOnce({ email: 'guardian@school.test', kind: 'payer', name: 'Guardian', userId: uid(401) });
  expect(await queueSchoolMaterialAudience(db.client)).toBe(1);
  expect((await db.pg.query<any>('SELECT student_id::text,state FROM school_material_digest_entries')).rows).toEqual([{ student_id: childB, state: 'pending' }]);
});

it('holds every expired provider attempt for review so old jobs cannot occupy the due queue', async () => {
  const db = await database(); const [id] = await prepare(db);
  await db.pg.query("UPDATE school_material_digest_deliveries SET state='sending',attempted_at=now()-interval '24 hours' WHERE id=$1", [id]);
  await holdExpiredSchoolMaterialDigests(db.client, new Date());
  expect((await delivery(db, id)).state).toBe('review');
  expect((await db.pg.query<any>('SELECT state FROM school_material_digest_entries')).rows[0].state).toBe('queued');
});

it('honors direct-send suppression without a provider call or lease claim', async () => {
  const db = await database(); const [id] = await prepare(db); vi.stubEnv('TUTLIO_DEV_SUPPRESS_EMAIL', '1');
  const send = vi.fn(async () => ({ id: 'unexpected' }));
  expect(await deliverSchoolMaterialDigest(db.client, id, send)).toBe('deferred');
  expect(await delivery(db, id)).toMatchObject({ state: 'pending', attempted_at: null, lease_at: null });
  expect(send).not.toHaveBeenCalled();
});

it('does not let100 live leases or expired attempts hide new deliveries, and rotates uncertain checks behind fresh jobs', async () => {
  const now = new Date(); const old = new Date(now.getTime() - 25 * 60 * 60_000).toISOString();
  const recent = now.toISOString();
  const rows = Array.from({ length: 100 }, (_, index) => ({ id: uid(1000 + index), organization_id: org, recipient_email: `stale${index}@school.test`, digest_date: '2026-09-20',
    state: 'sending', attempted_at: index < 50 ? old : recent, lease_at: index < 50 ? old : recent, payload: { items: [] } }));
  const freshRows = Array.from({ length: 22 }, (_, index) => ({ id: uid(2000 + index), organization_id: org, recipient_email: `fresh${index}@school.test`, digest_date: '2026-09-28', state: 'pending', payload: { items: [] } }));
  const uncertain = { id: uid(3000), organization_id: org, recipient_email: 'unknown@school.test', digest_date: '2026-09-20', state: 'pending', lease_at: recent, payload: { items: [] } };
  const db = await database({ school_material_digest_deliveries: [...rows, ...freshRows, uncertain] });
  const due = await dueSchoolMaterialDigestIds(db.client, now);
  expect(due).toEqual(freshRows.slice(0, 20).map(row => row.id));
  expect(due).not.toContain(uncertain.id);
});
