import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  embed: vi.fn(),
  embeddingModel: vi.fn(() => ({ modelId: 'text-embedding-3-small' })),
}));

vi.mock('ai', async (importOriginal) => ({
  ...await importOriginal<typeof import('ai')>(),
  embed: mocks.embed,
}));
vi.mock('@ai-sdk/openai', () => ({
  openai: { embedding: mocks.embeddingModel },
}));

import {
  rememberInAppSupportTurn,
  retrieveInAppSupportVectorContext,
} from '../../api/_lib/inAppSupportVectorContext';

const customer = {
  portal: 'organization' as const,
  role: 'organization_admin' as const,
  organizationId: '11111111-1111-4111-8111-111111111111',
  entityType: 'school' as const,
  enabledFeatureIds: ['school_class_groups'],
  allowedPermissions: ['sessions.view' as const],
  functionContext: 'verified context',
};

describe('in-app support vector context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.embed.mockResolvedValue({ embedding: [0.1, 0.2, 0.3] });
  });

  it('passes the verified customer scope into vector retrieval before ranking', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [{ content: 'Allowed group behavior', similarity: 0.91 }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ content: 'Earlier answer from this conversation', similarity: 0.88 }],
        error: null,
      });

    const result = await retrieveInAppSupportVectorContext({
      supabase: { rpc } as any,
      userId: '22222222-2222-4222-8222-222222222222',
      conversationId: 'conversation-123',
      query: 'Why was only one group lesson created?',
      customer,
    });

    expect(rpc).toHaveBeenNthCalledWith(1, 'match_in_app_support_knowledge', expect.objectContaining({
      filter_portal: 'organization',
      filter_entity_type: 'school',
      filter_organization_id: customer.organizationId,
      filter_feature_ids: ['school_class_groups'],
      filter_permissions: ['sessions.view'],
    }));
    expect(rpc).toHaveBeenNthCalledWith(2, 'match_in_app_support_memory', expect.objectContaining({
      filter_user_id: '22222222-2222-4222-8222-222222222222',
      filter_conversation_id: 'conversation-123',
      filter_organization_id: customer.organizationId,
    }));
    expect(result.knowledge).toEqual(['Allowed group behavior']);
    expect(result.memories).toEqual(['Earlier answer from this conversation']);
  });

  it('stores memory with the same user, conversation, and organization scope', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));

    await rememberInAppSupportTurn({
      supabase: { from } as any,
      userId: '22222222-2222-4222-8222-222222222222',
      conversationId: 'conversation-123',
      customer,
      content: 'User answered: every Monday',
      embedding: [0.1, 0.2, 0.3],
    });

    expect(from).toHaveBeenCalledWith('in_app_support_memory');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: '22222222-2222-4222-8222-222222222222',
      conversation_id: 'conversation-123',
      organization_id: customer.organizationId,
      portal: 'organization',
    }), { onConflict: 'user_id,conversation_id,content_hash' });
  });
});
