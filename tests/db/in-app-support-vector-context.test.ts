import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  'supabase/migrations/20260917200000_in_app_support_vector_context.sql',
  'utf8',
);

describe('in-app support vector isolation migration', () => {
  it('filters knowledge by portal, organization, enabled feature, and permission', () => {
    expect(sql).toContain('filter_portal = any(knowledge.portals)');
    expect(sql).toContain('knowledge.organization_id = filter_organization_id');
    expect(sql).toContain('knowledge.feature_id = any(coalesce(filter_feature_ids');
    expect(sql).toContain('knowledge.required_permission = any(coalesce(filter_permissions');
  });

  it('filters semantic memory by exact user, conversation, and organization before similarity ranking', () => {
    expect(sql).toContain('memory.user_id = filter_user_id');
    expect(sql).toContain('memory.conversation_id = filter_conversation_id');
    expect(sql).toContain('memory.organization_id is not distinct from filter_organization_id');
    expect(sql.indexOf('memory.user_id = filter_user_id')).toBeLessThan(sql.indexOf('order by memory.embedding'));
  });

  it('keeps both vector tables server-only', () => {
    expect(sql).toContain('revoke all on table public.in_app_support_knowledge from public, anon, authenticated');
    expect(sql).toContain('revoke all on table public.in_app_support_memory from public, anon, authenticated');
    expect(sql).not.toContain('grant select on table public.in_app_support_memory to authenticated');
  });
});
