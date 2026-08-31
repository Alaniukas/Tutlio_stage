import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { LanguageModelUsage } from 'ai';

export const SUPPORT_ATTACHMENT_BUCKET = 'support-attachments';
export const SUPPORT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const SUPPORT_ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type SupportAttachmentType = (typeof SUPPORT_ATTACHMENT_TYPES)[number];

export type SupportAttachment = {
  path: string;
  name: string;
  type: SupportAttachmentType;
  size: number;
};

type ConversationContext = {
  sessionId: string;
  locale: string;
  page: string;
};

type PersistMessageInput = ConversationContext & {
  requestId: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string | null;
  knowledgeArea?: string | null;
  suggestedPageIds?: string[];
  tokenUsage?: LanguageModelUsage | null;
};

type PersistContactInput = ConversationContext & {
  requestId: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  attachment: SupportAttachment | null;
};

let supportClient: SupabaseClient | null = null;

function supportSupabaseUrl(): string {
  const urls = [process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL]
    .filter((url): url is string => Boolean(url?.trim()))
    .filter((url) => !url.includes('xklzjhfztjxltrdkplog'));
  const url = urls[0];
  if (!url) throw new Error('Support persistence is missing the Supabase URL.');
  return url;
}

export function getSupportServiceClient(): SupabaseClient {
  if (supportClient) return supportClient;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) throw new Error('Support persistence is missing the Supabase service-role key.');

  supportClient = createClient(supportSupabaseUrl(), serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return supportClient;
}

export function isValidSupportSessionId(value: string): boolean {
  return /^[a-zA-Z0-9._:-]{8,100}$/.test(value);
}

export function isSupportAttachmentType(value: string): value is SupportAttachmentType {
  return SUPPORT_ATTACHMENT_TYPES.includes(value as SupportAttachmentType);
}

function extensionFor(type: SupportAttachmentType): string {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/webp') return 'webp';
  return 'png';
}

function safeAttachmentName(value: string, type: SupportAttachmentType): string {
  const cleaned = value
    .replace(/[\\/\u0000-\u001f\u007f]/g, '-')
    .trim()
    .slice(0, 180);
  return cleaned || `support-screenshot.${extensionFor(type)}`;
}

export async function ensureSupportConversation({ sessionId, locale, page }: ConversationContext) {
  if (!isValidSupportSessionId(sessionId)) throw new Error('Invalid support session ID.');
  const supabase = getSupportServiceClient();
  const now = new Date().toISOString();

  const { error: insertError } = await supabase
    .from('support_conversations')
    .upsert({
      session_id: sessionId,
      locale: locale.slice(0, 12) || 'en',
      first_page: page.slice(0, 300) || '/',
      last_page: page.slice(0, 300) || '/',
      updated_at: now,
      closed_at: null,
    }, { onConflict: 'session_id', ignoreDuplicates: true });
  if (insertError) throw insertError;

  const { error: updateError } = await supabase
    .from('support_conversations')
    .update({
      locale: locale.slice(0, 12) || 'en',
      last_page: page.slice(0, 300) || '/',
      updated_at: now,
      closed_at: null,
    })
    .eq('session_id', sessionId);
  if (updateError) throw updateError;
}

export async function persistSupportMessage(input: PersistMessageInput) {
  await ensureSupportConversation(input);
  const supabase = getSupportServiceClient();
  const usage = input.tokenUsage
    ? {
      inputTokens: input.tokenUsage.inputTokens,
      inputTokenDetails: input.tokenUsage.inputTokenDetails,
      outputTokens: input.tokenUsage.outputTokens,
      outputTokenDetails: input.tokenUsage.outputTokenDetails,
      totalTokens: input.tokenUsage.totalTokens,
    }
    : null;

  const { error } = await supabase
    .from('support_messages')
    .upsert({
      session_id: input.sessionId,
      request_id: input.requestId.slice(0, 100),
      role: input.role,
      content: input.content.trim().slice(0, 8_000),
      model: input.model?.slice(0, 100) || null,
      knowledge_area: input.knowledgeArea?.slice(0, 100) || null,
      suggested_page_ids: (input.suggestedPageIds || []).slice(0, 3),
      token_usage: usage,
      page: input.page.slice(0, 300) || '/',
      locale: input.locale.slice(0, 12) || 'en',
    }, { onConflict: 'session_id,request_id,role', ignoreDuplicates: true });
  if (error) throw error;
}

export async function markSupportConversationClosed(input: ConversationContext) {
  if (!isValidSupportSessionId(input.sessionId)) throw new Error('Invalid support session ID.');
  const supabase = getSupportServiceClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('support_conversations')
    .update({
      last_page: input.page.slice(0, 300) || '/',
      locale: input.locale.slice(0, 12) || 'en',
      updated_at: now,
      closed_at: now,
    })
    .eq('session_id', input.sessionId);
  if (error) throw error;
}

export async function createSupportAttachmentUpload(
  input: ConversationContext & { name: string; type: SupportAttachmentType; size: number },
) {
  await ensureSupportConversation(input);
  const supabase = getSupportServiceClient();
  const path = `${input.sessionId}/${randomUUID()}.${extensionFor(input.type)}`;
  const { data, error } = await supabase.storage
    .from(SUPPORT_ATTACHMENT_BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) throw error || new Error('Could not create the attachment upload URL.');

  return {
    path,
    token: data.token,
    name: safeAttachmentName(input.name, input.type),
    type: input.type,
    size: input.size,
  };
}

export async function verifySupportAttachment(
  sessionId: string,
  attachment: SupportAttachment | null,
): Promise<(SupportAttachment & { signedUrl: string }) | null> {
  if (!attachment) return null;
  if (!isValidSupportSessionId(sessionId)
    || !attachment.path.startsWith(`${sessionId}/`)
    || !isSupportAttachmentType(attachment.type)
    || attachment.size < 1
    || attachment.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
    throw new Error('Invalid support attachment metadata.');
  }

  const filePattern = /^[a-f0-9-]{36}\.(png|jpg|webp)$/i;
  const fileName = attachment.path.slice(sessionId.length + 1);
  if (!filePattern.test(fileName)) throw new Error('Invalid support attachment path.');

  const supabase = getSupportServiceClient();
  const bucket = supabase.storage.from(SUPPORT_ATTACHMENT_BUCKET);
  const { data: info, error: infoError } = await bucket.info(attachment.path);
  if (infoError || !info) throw infoError || new Error('Support attachment was not uploaded.');

  const actualSize = Number(info.size || 0);
  const actualType = String(info.contentType || attachment.type);
  if (!isSupportAttachmentType(actualType)
    || actualSize < 1
    || actualSize > SUPPORT_ATTACHMENT_MAX_BYTES) {
    throw new Error('The uploaded support attachment is not an allowed image.');
  }

  const safeName = safeAttachmentName(attachment.name, actualType);
  const { data: signed, error: signedError } = await bucket.createSignedUrl(
    attachment.path,
    7 * 24 * 60 * 60,
    { download: safeName },
  );
  if (signedError || !signed) throw signedError || new Error('Could not create the attachment link.');

  return {
    path: attachment.path,
    name: safeName,
    type: actualType,
    size: actualSize,
    signedUrl: signed.signedUrl,
  };
}

export async function persistSupportContactRequest(input: PersistContactInput): Promise<number> {
  await ensureSupportConversation(input);
  const supabase = getSupportServiceClient();
  const row = {
    request_id: input.requestId.slice(0, 100),
    session_id: input.sessionId,
    name: input.name,
    email: input.email,
    phone: input.phone,
    message: input.message,
    page: input.page,
    locale: input.locale,
    attachment_path: input.attachment?.path || null,
    attachment_name: input.attachment?.name || null,
    attachment_type: input.attachment?.type || null,
    attachment_size: input.attachment?.size || null,
    delivery_status: 'pending',
  };

  const { data, error } = await supabase
    .from('support_contact_requests')
    .upsert(row, { onConflict: 'request_id' })
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (data?.id) return Number(data.id);

  const { data: existing, error: existingError } = await supabase
    .from('support_contact_requests')
    .select('id')
    .eq('request_id', input.requestId)
    .single();
  if (existingError || !existing) throw existingError || new Error('Could not find the support contact request.');
  return Number(existing.id);
}

export async function updateSupportContactDelivery(
  id: number,
  deliveryStatus: 'sent' | 'failed',
  resendEmailId?: string | null,
) {
  const supabase = getSupportServiceClient();
  const { error } = await supabase
    .from('support_contact_requests')
    .update({
      delivery_status: deliveryStatus,
      resend_email_id: resendEmailId?.slice(0, 200) || null,
    })
    .eq('id', id);
  if (error) throw error;
}
