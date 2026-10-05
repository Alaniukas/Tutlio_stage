import type { SupabaseClient } from '@supabase/supabase-js';
import { shouldSkipNotificationForEmail, userNotificationPreference } from './userNotificationPreferences.js';
import { resolveEmailOrgBranding, type OrgRowForEmailBranding } from './emailOrgBranding.js';
import { resolveOrgEmailReplyTo } from './orgEmailReplyTo.js';
import { notificationLocale } from './notificationLocale.js';
import { parseOrgParentNotificationOptOut, parseParentNotificationOptOut } from '../../src/lib/parentNotificationPreferences.js';
import { schoolFamilyPortalEnabled } from './schoolFamilyGuardianAccess.js';
import { schoolMaterialRecipient, schoolMaterialPublicationIsNotifiable, schoolStudentMayViewPublication, type SchoolMaterialPublication } from './schoolMaterialPublications.js';
import { schoolMaterialDigestsEnabled } from '../../src/lib/schoolNotificationPolicy.js';
import { buildSchoolHomeworkUrl } from './publicLinkToken.js';
import { recordingSlotScope, recordingSlotTags, recordingVisibleToScope } from './schoolRecordingSlotAccess.js';
import { deniedRecordingOrganizations } from './schoolRecordingAccessDenials.js';
import { schoolFamilyMaterialTranslations } from '../../src/lib/i18n/schoolFamilyMaterialTranslations.js';
import type { Locale } from '../../src/lib/i18n/locales.js';

type Student = { id: string; organization_id: string; full_name: string; email: string | null; linked_user_id: string | null;
  payer_email?: string | null; payer_name?: string | null; parent_secondary_email?: string | null; parent_secondary_name?: string | null };
const STUDENT_CONTACT_SELECT = 'id,organization_id,full_name,email,linked_user_id,payer_email,payer_name,parent_secondary_email,parent_secondary_name';

async function notificationCutoffs(db: SupabaseClient, orgs: Array<{ id: string; features?: Record<string, unknown> | null }>) {
  const ids = orgs.filter(org => !schoolFamilyPortalEnabled(org.features) && schoolMaterialDigestsEnabled(org.features)).map(org => org.id);
  if (!ids.length) return new Map<string, string>();
  const result = await db.from('school_material_baselines').select('organization_id,notifications_started_at').in('organization_id', ids);
  if (result.error) throw result.error;
  return new Map<string, string>((result.data || []).map(row => [row.organization_id, row.notifications_started_at]));
}
export type DigestItem = { publication_id: string; student_id: string; child: string; label: string; source: string; url: string };
export type DigestPayload = { from: string; to: string[]; replyTo?: string[]; subject: string; html: string; items: DigestItem[] };
export const SCHOOL_DIGEST_PROVIDER_WINDOW_MS = 23 * 60 * 60_000;
export const SCHOOL_DIGEST_LEASE_MS = 10 * 60_000;
type Entry = { publication_id: string; student_id: string };
type Delivery = {
  id: string; organization_id: string; recipient_email: string; state: string; payload: DigestPayload;
  attempted_at: string | null; lease_at: string | null; sent_at: string | null; provider_id: string | null;
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

/** Optional private material mail waits for known preferences rather than failing open. */
async function digestOptedOut(db: SupabaseClient, email: string, features: unknown): Promise<boolean> {
  if (parseOrgParentNotificationOptOut(features).includes('lesson_updates')) return true;
  if (await shouldSkipNotificationForEmail(db, email, 'school_material_digest')) return true;
  const parent = await db.from('parent_profiles').select('user_id,email_notification_opt_out,disable_lesson_reminders')
    .eq('email', email).limit(1).maybeSingle();
  if (parent.error) throw new Error('school_digest_preferences_unavailable');
  if (parent.data?.user_id) {
    const enabled = await userNotificationPreference(db, parent.data.user_id, 'school_materials');
    if (enabled !== null) return !enabled;
  }
  return parseParentNotificationOptOut(parent.data?.email_notification_opt_out, parent.data?.disable_lesson_reminders === true).includes('lesson_updates');
}

async function skipPendingEntries(db: SupabaseClient, entries: Entry[]) {
  const childrenByPublication = new Map<string, string[]>();
  for (const entry of entries) childrenByPublication.set(entry.publication_id, [...(childrenByPublication.get(entry.publication_id) || []), entry.student_id]);
  for (const [publicationId, studentIds] of childrenByPublication) {
    const result = await db.from('school_material_digest_entries').update({ state: 'skipped' })
      .eq('publication_id', publicationId).in('student_id', studentIds).eq('state', 'pending');
    if (result.error) throw result.error;
  }
}

async function recordingDeniedForRecipient(db: SupabaseClient, organizationId: string, student: Student,
  recipient: { email: string; userId?: string | null }): Promise<boolean> {
  const viewerIds = [...new Set([student.linked_user_id, recipient.userId].filter((id): id is string => Boolean(id)))];
  const decisions = await Promise.all((viewerIds.length ? viewerIds : ['']).map(userId =>
    deniedRecordingOrganizations(db, [organizationId], userId, [recipient.email])));
  return decisions.some(denied => denied.has(organizationId));
}

export function schoolDigestLocalDate(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function renderSchoolMaterialDigest(input: {
  organizationId: string; org: OrgRowForEmailBranding; date: string; items: DigestItem[]; email: string; locale: Locale;
  replyTo?: string[];
}): DigestPayload {
  const copy = schoolFamilyMaterialTranslations[input.locale] || schoolFamilyMaterialTranslations.en;
  const resolved = resolveEmailOrgBranding(input.organizationId, input.org);
  const name = resolved.publicName || input.org.name || 'Tutlio';
  const color = /^#[0-9a-fA-F]{6}$/.test(resolved.branding?.brand_color || '') ? resolved.branding!.brand_color : '#4f46e5';
  const grouped = new Map<string, DigestItem[]>();
  for (const item of input.items) grouped.set(item.child, [...(grouped.get(item.child) || []), item]);
  const sections = [...grouped].map(([child, items]) => `<h2 style="font-size:17px">${escapeHtml(child)}</h2><ul>${items.map((item) =>
    `<li style="margin:10px 0"><a href="${escapeHtml(item.url)}">${escapeHtml(item.source === 'drive' ? copy['school.materials.recordings'] : copy['school.materials.homework'])}: ${escapeHtml(item.label)}</a></li>`).join('')}</ul>`).join('');
  const subject = copy['school.materials.digestSubject'].replace('{date}', input.date);
  const sender = (resolved.emailSenderName || name).replace(/[\r\n"<>]/g, '').slice(0, 100);
  const mailbox = (process.env.FROM_EMAIL || 'Tutlio <info@tutlio.lt>').match(/<([^>]+)>/)?.[1] || process.env.FROM_EMAIL || 'info@tutlio.lt';
  return { from: `${sender} <${mailbox}>`, to: [input.email], ...(input.replyTo ? { replyTo: input.replyTo } : {}), subject, items: input.items,
    html: `<!doctype html><html lang="${input.locale}"><body style="font-family:Arial,sans-serif;background:#f8fafc;padding:24px"><main style="max-width:600px;margin:auto;background:white;border-radius:16px;overflow:hidden"><div style="background:${color};color:white;padding:24px"><h1 style="font-size:22px;margin:0">${escapeHtml(name)}</h1><p>${escapeHtml(subject)}</p></div><div style="padding:24px"><p>${escapeHtml(copy['school.materials.digestBody'])}</p>${sections}<p style="font-size:12px;color:#64748b">${escapeHtml(resolved.emailTeamSignature || name)}</p></div></main></body></html>` };
}

/** Fan-out is bounded and resumable. All eligibility is checked before creating an email entry. */
export async function queueSchoolMaterialAudience(db: SupabaseClient): Promise<number> {
  const due = await db.rpc('school_pending_material_audience', { p_limit: 300 });
  if (due.error) throw due.error;
  const pairs = due.data as Array<{ publication_id: string; student_id: string }> || [];
  if (!pairs.length) return 0;
  const [pubs, students] = await Promise.all([
    db.from('school_material_publications').select('*').in('id', [...new Set(pairs.map((p) => p.publication_id))]),
    db.from('students').select(STUDENT_CONTACT_SELECT).in('id', [...new Set(pairs.map((p) => p.student_id))]),
  ]);
  if (pubs.error || students.error) throw pubs.error || students.error;
  const orgs = await db.from('organizations').select('id,features').eq('entity_type', 'school')
    .in('id', [...new Set((pubs.data || []).map(pub => pub.organization_id))]);
  if (orgs.error) throw orgs.error;
  const pubById = new Map<string, SchoolMaterialPublication>((pubs.data || []).map((p) => [p.id, p]));
  const studentById = new Map<string, Student>((students.data || []).map((s) => [s.id, s]));
  const featureById = new Map((orgs.data || []).map((o) => [o.id, o.features]));
  const cutoffs = await notificationCutoffs(db, orgs.data || []);
  const scopes = new Map<string, ReturnType<typeof recordingSlotScope>>();
  const tags = new Map<string, ReturnType<typeof recordingSlotTags>>();
  const entries: Array<{ publication_id: string; student_id: string; state: 'pending' | 'skipped' }> = [];
  for (let offset = 0; offset < pairs.length; offset += 8) {
    await Promise.all(pairs.slice(offset, offset + 8).map(async (pair) => {
      try {
      const pub = pubById.get(pair.publication_id); const student = studentById.get(pair.student_id);
      if (!pub || !student || pub.organization_id !== student.organization_id) return;
      let allowed = schoolMaterialPublicationIsNotifiable(pub, featureById.get(pub.organization_id), cutoffs.get(pub.organization_id));
      if (allowed && pub.source === 'drive' && !pub.target_id.startsWith('subject:')) {
        const key = `${pub.target_id}/${student.id}`;
        if (!scopes.has(key)) scopes.set(key, recordingSlotScope(db, pub.target_id, [student.id], false, { organizationId: pub.organization_id, features: featureById.get(pub.organization_id) }));
        if (!tags.has(pub.target_id)) tags.set(pub.target_id, recordingSlotTags(db, pub.target_id));
        const [scope, tagMap] = await Promise.all([scopes.get(key)!, tags.get(pub.target_id)!]);
        allowed = recordingVisibleToScope(scope, tagMap.get(pub.file_id) || null);
      }
      if (allowed && pub.source === 'drive') {
        const recipient = await schoolMaterialRecipient(db, student, featureById.get(pub.organization_id));
        allowed = Boolean(recipient) && !await recordingDeniedForRecipient(db, pub.organization_id, student, recipient!);
      }
      entries.push({ ...pair, state: allowed ? 'pending' : 'skipped' });
      } catch { /* Unknown eligibility stays unclaimed while other audience pairs can progress. */ }
    }));
  }
  if (entries.length) {
    const result = await db.from('school_material_digest_entries').upsert(entries, { onConflict: 'publication_id,student_id', ignoreDuplicates: true });
    if (result.error) throw result.error;
  }
  return entries.length;
}

export async function prepareSchoolMaterialDigests(db: SupabaseClient, input: { origin: string; now?: Date; organizationId?: string }): Promise<string[]> {
  const now = input.now || new Date();
  let query = db.from('school_material_digest_entries').select('publication_id,student_id,publication:school_material_publications!inner(*)')
    .eq('state', 'pending').order('publication_id').order('student_id').limit(1000);
  if (input.organizationId) query = query.eq('publication.organization_id', input.organizationId);
  const result = await query;
  if (result.error) throw result.error;
  const rows = result.data || []; if (!rows.length) return [];
  const students = await db.from('students').select(STUDENT_CONTACT_SELECT)
    .in('id', [...new Set(rows.map((r) => r.student_id))]);
  if (students.error) throw students.error;
  const childById = new Map<string, Student>((students.data || []).map((s) => [s.id, s]));
  const orgs = await db.from('organizations').select('id,entity_type,features').in('id', [...new Set((students.data || []).map(child => child.organization_id))]);
  if (orgs.error) throw orgs.error;
  const featureById = new Map((orgs.data || []).filter(org => org.entity_type === 'school').map(org => [org.id, org.features]));
  const cutoffs = await notificationCutoffs(db, orgs.data || []);
  const contacts = new Map<string, Awaited<ReturnType<typeof schoolMaterialRecipient>>>();
  const unresolved = new Set<string>();
  for (const student of childById.values()) {
    try { contacts.set(student.id, await schoolMaterialRecipient(db, student, featureById.get(student.organization_id))); }
    catch { unresolved.add(student.id); }
  }
  const skipped: Entry[] = [];
  const batches = new Map<string, { orgId: string; email: string; entries: Entry[]; items: Map<string, { item: DigestItem; publishedAt: number; version: string }> }>();
  for (const row of rows) {
    if (unresolved.has(row.student_id)) continue;
    const child = childById.get(row.student_id); const contact = contacts.get(row.student_id);
    const pub = (Array.isArray(row.publication) ? row.publication[0] : row.publication) as SchoolMaterialPublication;
    if (!child || !contact || !pub || pub.organization_id !== child.organization_id
      || !schoolMaterialPublicationIsNotifiable(pub, featureById.get(pub.organization_id), cutoffs.get(pub.organization_id))) { skipped.push(row); continue; }
    try {
      if (!await schoolStudentMayViewPublication(db, pub, child.id, { recipientKind: contact.kind })) { skipped.push(row); continue; }
    } catch { continue; } // An uncertain DB/Drive check remains pending for a later run.
    const key = `${pub.organization_id}/${contact.email}`;
    const batch = batches.get(key) || { orgId: pub.organization_id, email: contact.email, entries: [], items: new Map() };
    const portal = contact.kind === 'student' ? 'student' : 'parent';
    const homeworkUrl = schoolFamilyPortalEnabled(featureById.get(pub.organization_id))
      ? `${input.origin}/${portal}/homework?student=${encodeURIComponent(child.id)}`
      : buildSchoolHomeworkUrl(input.origin, child.id);
    const item = { publication_id: pub.id, student_id: child.id, child: child.full_name, label: pub.label,
      source: pub.source, url: `${homeworkUrl}${pub.source === 'drive' ? '#recordings' : ''}` };
    const itemKey = `${child.id}/${pub.source}/${pub.file_id}`;
    const publishedAt = Date.parse(pub.first_published_at) || 0;
    const earlier = batch.items.get(itemKey);
    if (!earlier || publishedAt > earlier.publishedAt || (publishedAt === earlier.publishedAt && pub.source_version > earlier.version)) {
      batch.items.set(itemKey, { item, publishedAt, version: pub.source_version });
    }
    // Every eligible revision is consumed even though the email has one latest-file link.
    batch.entries.push({ publication_id: pub.id, student_id: child.id });
    batches.set(key, batch);
  }
  await skipPendingEntries(db, skipped);
  const deliveryIds: string[] = [];
  for (const batch of batches.values()) {
    const org = await db.from('organizations').select('name,email,logo_url,brand_color,brand_color_secondary,features,preferred_locale').eq('id', batch.orgId).single();
    if (org.error) throw org.error;
    if (!schoolMaterialDigestsEnabled(org.data.features) || await digestOptedOut(db, batch.email, org.data.features)) {
      await skipPendingEntries(db, batch.entries); continue;
    }
    const locale = await notificationLocale(db, batch.email, null, org.data.preferred_locale);
    const items = [...batch.items.values()].map(value => value.item);
    const replyTo = await resolveOrgEmailReplyTo(db, batch.orgId, org.data);
    const payload = renderSchoolMaterialDigest({ organizationId: batch.orgId, org: org.data, date: schoolDigestLocalDate(now), items, email: batch.email, locale, replyTo });
    const reserved = await db.rpc('school_reserve_material_digest', { p_org: batch.orgId, p_email: batch.email,
      p_date: schoolDigestLocalDate(now), p_payload: payload, p_entries: batch.entries });
    if (reserved.error) throw reserved.error;
    if (reserved.data) deliveryIds.push(reserved.data);
  }
  return [...new Set(deliveryIds)];
}

async function stampEntries(db: SupabaseClient, id: string, state: 'sent' | 'skipped') {
  const result = await db.from('school_material_digest_entries').update({ state }).eq('delivery_id', id).eq('state', 'queued');
  if (result.error) throw result.error;
}

function sameAttempt(db: SupabaseClient, row: Delivery, updates: Record<string, unknown>) {
  let query = db.from('school_material_digest_deliveries').update(updates).eq('id', row.id).eq('state', row.state);
  query = row.lease_at ? query.eq('lease_at', row.lease_at) : query.is('lease_at', null);
  return query;
}

async function skipDelivery(db: SupabaseClient, row: Delivery) {
  const result = await sameAttempt(db, row, { state: 'skipped', last_error: 'Current material eligibility revoked' }).select('id');
  if (result.error) throw result.error;
  if (result.data?.length) await stampEntries(db, row.id, 'skipped');
  return 'deferred' as const;
}

/** Terminal stamps are repairable after a crash between the delivery and its entry updates. */
export async function repairSchoolMaterialDigestEntries(db: SupabaseClient): Promise<void> {
  const result = await db.from('school_material_digest_entries').select('delivery_id,delivery:school_material_digest_deliveries!inner(state)')
    .eq('state', 'queued').in('delivery.state', ['sent', 'skipped']).limit(1000);
  if (result.error) throw result.error;
  const byState = new Map<'sent' | 'skipped', Set<string>>();
  for (const entry of result.data || []) {
    const delivery = Array.isArray(entry.delivery) ? entry.delivery[0] : entry.delivery;
    if (!entry.delivery_id || !['sent', 'skipped'].includes(delivery?.state)) continue;
    const state = delivery.state as 'sent' | 'skipped';
    if (!byState.has(state)) byState.set(state, new Set());
    byState.get(state)!.add(entry.delivery_id);
  }
  for (const [state, ids] of byState) {
    const stamped = await db.from('school_material_digest_entries').update({ state }).in('delivery_id', [...ids]).eq('state', 'queued');
    if (stamped.error) throw stamped.error;
  }
}

/** Uncertain provider outcomes are held for manual review after its idempotency window. */
export async function holdExpiredSchoolMaterialDigests(db: SupabaseClient, now: Date): Promise<void> {
  const result = await db.from('school_material_digest_deliveries').update({ state: 'review', last_error: 'Provider outcome needs review; automatic retry stopped' })
    .in('state', ['pending', 'sending']).not('attempted_at', 'is', null)
    .lte('attempted_at', new Date(now.getTime() - SCHOOL_DIGEST_PROVIDER_WINDOW_MS).toISOString());
  if (result.error) throw result.error;
}

/** Retry uncertain checks fairly while excluding live leases and expired provider windows. */
export async function dueSchoolMaterialDigestIds(db: SupabaseClient, now: Date): Promise<string[]> {
  const ageCutoff = new Date(now.getTime() - SCHOOL_DIGEST_PROVIDER_WINDOW_MS).toISOString();
  const leaseCutoff = new Date(now.getTime() - SCHOOL_DIGEST_LEASE_MS).toISOString();
  const result = await db.from('school_material_digest_deliveries').select('id')
    .or(`and(state.eq.pending,or(attempted_at.is.null,attempted_at.gt.${ageCutoff})),and(state.eq.sending,or(lease_at.is.null,lease_at.lt.${leaseCutoff}),or(attempted_at.is.null,attempted_at.gt.${ageCutoff}))`)
    .order('lease_at', { ascending: true, nullsFirst: true }).order('digest_date').order('id').limit(20);
  if (result.error) throw result.error;
  return (result.data || []).map(row => row.id);
}

export async function deliverSchoolMaterialDigest(db: SupabaseClient, id: string, send: (payload: DigestPayload, key: string) => Promise<{ id?: string; error?: string }>, options: { now?: Date } = {}): Promise<'sent' | 'deferred'> {
  const now = options.now || new Date();
  const row = await db.from('school_material_digest_deliveries').select('*').eq('id', id).single();
  if (row.error) throw row.error;
  const delivery = row.data as Delivery;
  if (delivery.state === 'sent' || delivery.state === 'skipped') { await stampEntries(db, id, delivery.state); return 'deferred'; }
  if (delivery.state === 'review') return 'deferred';
  if (process.env.TUTLIO_DEV_SUPPRESS_EMAIL === '1') return 'deferred';
  if (delivery.attempted_at && Date.parse(delivery.attempted_at) <= now.getTime() - SCHOOL_DIGEST_PROVIDER_WINDOW_MS) {
    const held = await sameAttempt(db, delivery, { state: 'review', last_error: 'Provider outcome needs review; automatic retry stopped' });
    if (held.error) throw held.error;
    return 'deferred';
  }
  if (delivery.state === 'sending' && delivery.lease_at && Date.parse(delivery.lease_at) > now.getTime() - SCHOOL_DIGEST_LEASE_MS) return 'deferred';
  // Revalidate the frozen recipients and all child entitlements immediately before retry/send.
  const payload = delivery.payload;
  try {
    const org = await db.from('organizations').select('entity_type,features').eq('id', delivery.organization_id).maybeSingle();
    if (org.error) throw org.error;
    if (!org.data || org.data.entity_type !== 'school' || !schoolMaterialDigestsEnabled(org.data.features)
      || await digestOptedOut(db, delivery.recipient_email, org.data.features)) return await skipDelivery(db, delivery);
    if (!payload?.items?.length || payload.to?.length !== 1 || payload.to[0] !== delivery.recipient_email) return await skipDelivery(db, delivery);
    const cutoffs = await notificationCutoffs(db, [{ id: delivery.organization_id, features: org.data.features }]);
    for (const item of payload.items) {
      const child = await db.from('students').select(`${STUDENT_CONTACT_SELECT},detached_at,enrollment_status`).eq('id', item.student_id).maybeSingle();
      if (child.error) throw child.error;
      if (!child.data || child.data.organization_id !== delivery.organization_id || child.data.detached_at
        || (child.data.enrollment_status && child.data.enrollment_status !== 'active')) return await skipDelivery(db, delivery);
      const recipient = await schoolMaterialRecipient(db, child.data, org.data.features);
      if (!recipient || recipient.email !== delivery.recipient_email) return await skipDelivery(db, delivery);
      const publication = await db.from('school_material_publications').select('*').eq('id', item.publication_id).eq('organization_id', delivery.organization_id).maybeSingle();
      if (publication.error) throw publication.error;
      if (!publication.data || !schoolMaterialPublicationIsNotifiable(publication.data, org.data.features, cutoffs.get(delivery.organization_id))
        || !await schoolStudentMayViewPublication(db, publication.data, child.data.id, { recipientKind: recipient.kind, verifyDrive: true })) return await skipDelivery(db, delivery);
      if (item.source === 'drive') {
        if (await recordingDeniedForRecipient(db, delivery.organization_id, child.data, recipient)) return await skipDelivery(db, delivery);
      }
    }
  } catch {
    // Move an uncertain check behind older jobs without starting the provider window.
    const deferred = await sameAttempt(db, delivery, { lease_at: now.toISOString(), last_error: 'Material eligibility unavailable; retry pending' });
    if (deferred.error) throw deferred.error;
    return 'deferred';
  }
  const claimed = await db.rpc('school_claim_material_digest', { p_delivery_id: id });
  if (claimed.error) throw claimed.error;
  if (!claimed.data) return 'deferred';
  let outcome: { id?: string; error?: string };
  try { outcome = await send(payload, `school-material-digest/${id}`); } catch (e) { outcome = { error: (e as Error).message }; }
  if (!outcome.id || outcome.error) {
    const saved = await db.from('school_material_digest_deliveries').update({ last_error: outcome.error || 'Provider did not confirm delivery' }).eq('id', id).eq('state', 'sending');
    if (saved.error) throw saved.error;
    return 'deferred';
  }
  const marked = await db.from('school_material_digest_deliveries').update({ state: 'sent', sent_at: now.toISOString(), provider_id: outcome.id, last_error: null }).eq('id', id).eq('state', 'sending').select('id');
  if (marked.error) throw marked.error;
  if (!marked.data?.length) return 'deferred';
  await stampEntries(db, id, 'sent');
  return 'sent';
}
