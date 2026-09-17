import { createHash } from 'node:crypto';
import { openai } from '@ai-sdk/openai';
import { embed } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InAppSupportCustomerContext } from './inAppSupportCustomerContext.js';

export const IN_APP_SUPPORT_EMBEDDING_MODEL = 'text-embedding-3-small';
const MAX_RETRIEVED_ITEMS = 4;
const MIN_SIMILARITY = 0.68;

type RetrievedRow = {
  content?: unknown;
  similarity?: unknown;
};

export interface InAppSupportRetrievedContext {
  embedding: number[] | null;
  knowledge: string[];
  memories: string[];
}

function cleanRetrievedRows(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((row): string[] => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return [];
      const typed = row as RetrievedRow;
      const content = String(typed.content ?? '').trim().slice(0, 2_000);
      const similarity = Number(typed.similarity);
      return content && Number.isFinite(similarity) && similarity >= MIN_SIMILARITY ? [content] : [];
    })
    .slice(0, MAX_RETRIEVED_ITEMS);
}

export function renderInAppSupportRetrievedContext(
  customer: InAppSupportCustomerContext,
  retrieved: Pick<InAppSupportRetrievedContext, 'knowledge' | 'memories'>,
): string {
  const sections = [customer.functionContext];
  if (retrieved.knowledge.length > 0) {
    sections.push([
      '# Retrieved function documentation',
      '- These excerpts were filtered to this account before semantic ranking.',
      ...retrieved.knowledge.map((content, index) => `## Function excerpt ${index + 1}\n${content}`),
    ].join('\n'));
  }
  if (retrieved.memories.length > 0) {
    sections.push([
      '# Relevant earlier details from this support conversation',
      '- These are user-provided facts from the same signed-in user, conversation, and customer scope.',
      ...retrieved.memories.map((content, index) => `## Earlier detail ${index + 1}\n${content}`),
    ].join('\n'));
  }
  return sections.join('\n\n');
}

export async function retrieveInAppSupportVectorContext(input: {
  supabase: SupabaseClient;
  userId: string;
  conversationId: string | null;
  query: string;
  customer: InAppSupportCustomerContext;
}): Promise<InAppSupportRetrievedContext> {
  try {
    const result = await embed({
      model: openai.embedding(IN_APP_SUPPORT_EMBEDDING_MODEL),
      value: input.query.slice(0, 8_000),
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(5_000),
    });
    const embedding = result.embedding;
    const knowledgeRequest = input.supabase.rpc('match_in_app_support_knowledge', {
      query_embedding: embedding,
      match_threshold: MIN_SIMILARITY,
      match_count: MAX_RETRIEVED_ITEMS,
      filter_portal: input.customer.portal,
      filter_entity_type: input.customer.entityType,
      filter_organization_id: input.customer.organizationId,
      filter_feature_ids: input.customer.enabledFeatureIds,
      filter_permissions: input.customer.allowedPermissions,
    });
    const memoryRequest = input.conversationId
      ? input.supabase.rpc('match_in_app_support_memory', {
        query_embedding: embedding,
        match_threshold: MIN_SIMILARITY,
        match_count: MAX_RETRIEVED_ITEMS,
        filter_user_id: input.userId,
        filter_conversation_id: input.conversationId,
        filter_organization_id: input.customer.organizationId,
      })
      : Promise.resolve({ data: [], error: null });
    const [knowledgeResult, memoryResult] = await Promise.all([knowledgeRequest, memoryRequest]);
    if (knowledgeResult.error) {
      console.warn('[in-app-support-vector] Knowledge retrieval unavailable:', knowledgeResult.error.message);
    }
    if (memoryResult.error) {
      console.warn('[in-app-support-vector] Memory retrieval unavailable:', memoryResult.error.message);
    }
    return {
      embedding,
      knowledge: knowledgeResult.error ? [] : cleanRetrievedRows(knowledgeResult.data),
      memories: memoryResult.error ? [] : cleanRetrievedRows(memoryResult.data),
    };
  } catch (error) {
    console.warn('[in-app-support-vector] Embedding or retrieval unavailable:', error);
    return { embedding: null, knowledge: [], memories: [] };
  }
}

export async function rememberInAppSupportTurn(input: {
  supabase: SupabaseClient;
  userId: string;
  conversationId: string | null;
  customer: InAppSupportCustomerContext;
  content: string;
  embedding: number[] | null;
}): Promise<void> {
  if (!input.conversationId || !input.embedding) return;
  try {
    const content = input.content.trim().slice(0, 8_000);
    if (!content) return;
    const contentHash = createHash('sha256').update(content).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString();
    const { error } = await input.supabase
      .from('in_app_support_memory')
      .upsert({
        user_id: input.userId,
        conversation_id: input.conversationId,
        organization_id: input.customer.organizationId,
        portal: input.customer.portal,
        content,
        content_hash: contentHash,
        embedding: input.embedding,
        expires_at: expiresAt,
      }, { onConflict: 'user_id,conversation_id,content_hash' });
    if (error) console.warn('[in-app-support-vector] Could not persist conversation memory:', error.message);
  } catch (error) {
    console.warn('[in-app-support-vector] Could not persist conversation memory:', error);
  }
}
