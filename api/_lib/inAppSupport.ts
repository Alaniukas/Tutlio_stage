import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  IN_APP_SUPPORT_ATTACHMENT_TYPES,
  IN_APP_SUPPORT_MAX_ATTACHMENT_BYTES,
  type InAppSupportAttachment,
  type InAppSupportPortal,
} from '../../src/lib/inAppSupport.js';
import { getSupportServiceClient, SUPPORT_ATTACHMENT_BUCKET } from './supportPersistence.js';

type Reporter = {
  name: string | null;
  email: string;
  role: 'tutor' | 'organization_admin' | 'student' | 'parent';
  organizationId: string | null;
  organizationName: string | null;
};

function extensionFor(type: InAppSupportAttachment['type']): string {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  return 'png';
}

function safeName(value: string): string {
  return value.replace(/[\\/\u0000-\u001f\u007f]/g, '-').trim().slice(0, 180) || 'support-image';
}

export function validInAppAttachmentType(value: string): value is InAppSupportAttachment['type'] {
  return IN_APP_SUPPORT_ATTACHMENT_TYPES.includes(value as InAppSupportAttachment['type']);
}

export async function createInAppSupportUpload(input: {
  userId: string;
  requestId: string;
  name: string;
  type: InAppSupportAttachment['type'];
  size: number;
}) {
  const db = getSupportServiceClient();
  const path = `in-app/${input.userId}/${input.requestId}/${randomUUID()}.${extensionFor(input.type)}`;
  const { data, error } = await db.storage.from(SUPPORT_ATTACHMENT_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error || new Error('Could not create upload URL.');
  return {
    path,
    token: data.token,
    name: safeName(input.name),
    type: input.type,
    size: input.size,
  };
}

export async function verifyInAppSupportAttachments(
  userId: string,
  requestId: string,
  attachments: InAppSupportAttachment[],
): Promise<InAppSupportAttachment[]> {
  const db = getSupportServiceClient();
  const bucket = db.storage.from(SUPPORT_ATTACHMENT_BUCKET);
  const prefix = `in-app/${userId}/${requestId}/`;
  const verified: InAppSupportAttachment[] = [];

  for (const attachment of attachments) {
    if (!attachment.path.startsWith(prefix)
      || !validInAppAttachmentType(attachment.type)
      || attachment.size < 1
      || attachment.size > IN_APP_SUPPORT_MAX_ATTACHMENT_BYTES) {
      throw new Error('Invalid support attachment.');
    }
    const file = attachment.path.slice(prefix.length);
    if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/i.test(file)) throw new Error('Invalid support attachment path.');
    const { data, error } = await bucket.info(attachment.path);
    if (error || !data) throw error || new Error('Support attachment is missing.');
    const actualSize = Number(data.size || 0);
    const actualType = String(data.contentType || attachment.type);
    if (!validInAppAttachmentType(actualType)
      || actualSize < 1
      || actualSize > IN_APP_SUPPORT_MAX_ATTACHMENT_BYTES) {
      throw new Error('Uploaded file is not an allowed image.');
    }
    verified.push({
      path: attachment.path,
      name: safeName(attachment.name),
      type: actualType,
      size: actualSize,
    });
  }
  return verified;
}

async function organizationName(db: SupabaseClient, id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await db.from('organizations').select('name').eq('id', id).maybeSingle();
  return data?.name ? String(data.name) : null;
}

export async function resolveInAppSupportReporter(
  userId: string,
  requestedPortal: InAppSupportPortal,
): Promise<Reporter> {
  const db = getSupportServiceClient();
  const [{ data: authResult }, { data: admin }, { data: profile }, { data: student }, { data: parent }] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db.from('organization_admins').select('organization_id, role, status').eq('user_id', userId).maybeSingle(),
    db.from('profiles').select('full_name, email, organization_id').eq('id', userId).maybeSingle(),
    db.from('students').select('full_name, email, organization_id').eq('linked_user_id', userId).limit(1).maybeSingle(),
    db.from('parent_profiles').select('id, full_name, email').eq('user_id', userId).maybeSingle(),
  ]);
  const authUser = authResult?.user;
  const fallbackName = typeof authUser?.user_metadata?.full_name === 'string'
    ? authUser.user_metadata.full_name.trim().slice(0, 200)
    : null;
  const fallbackEmail = String(authUser?.email || '').trim().slice(0, 320);

  let role: Reporter['role'] = 'tutor';
  let name = profile?.full_name ? String(profile.full_name) : fallbackName;
  let email = profile?.email ? String(profile.email) : fallbackEmail;
  let organizationId = profile?.organization_id ? String(profile.organization_id) : null;

  if (requestedPortal === 'organization' && admin && admin.status !== 'inactive') {
    role = 'organization_admin';
    organizationId = String(admin.organization_id);
  } else if (requestedPortal === 'parent' && parent) {
    role = 'parent';
    name = parent.full_name ? String(parent.full_name) : name;
    email = parent.email ? String(parent.email) : email;
    const { data: links } = await db.from('parent_students').select('student_id').eq('parent_id', parent.id).limit(1);
    if (links?.[0]?.student_id) {
      const { data: linkedStudent } = await db
        .from('students')
        .select('organization_id')
        .eq('id', links[0].student_id)
        .maybeSingle();
      organizationId = linkedStudent?.organization_id ? String(linkedStudent.organization_id) : organizationId;
    }
  } else if (requestedPortal === 'student' && student) {
    role = 'student';
    name = student.full_name ? String(student.full_name) : name;
    email = student.email ? String(student.email) : email;
    organizationId = student.organization_id ? String(student.organization_id) : organizationId;
  } else if (profile) {
    role = 'tutor';
  } else if (admin) {
    role = 'organization_admin';
    organizationId = String(admin.organization_id);
  } else if (student) {
    role = 'student';
    name = student.full_name ? String(student.full_name) : name;
    email = student.email ? String(student.email) : email;
    organizationId = student.organization_id ? String(student.organization_id) : organizationId;
  } else if (parent) {
    role = 'parent';
    name = parent.full_name ? String(parent.full_name) : name;
    email = parent.email ? String(parent.email) : email;
  }

  if (!email) throw new Error('Authenticated support reporter has no email address.');
  return {
    name: name?.slice(0, 200) || null,
    email: email.slice(0, 320),
    role,
    organizationId,
    organizationName: await organizationName(db, organizationId),
  };
}
