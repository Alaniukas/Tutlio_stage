import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveOrgEmailReplyTo } from '../../api/_lib/orgEmailReplyTo.js';

function fakeDb(rows: Record<string, Record<string, unknown>[]>) {
  const queried: string[] = [];
  const db = {
    from(table: string) {
      queried.push(table);
      let result = rows[table] || [];
      const query = {
        select() { return query; },
        eq(column: string, value: unknown) { result = result.filter((row) => row[column] === value); return query; },
        is(column: string, value: unknown) { result = result.filter((row) => row[column] === value); return query; },
        not(column: string, _operator: string, value: unknown) { result = result.filter((row) => row[column] !== value); return query; },
        in(column: string, values: unknown[]) { result = result.filter((row) => values.includes(row[column])); return query; },
        async maybeSingle() { return { data: result[0] || null, error: null }; },
        then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => void) {
          resolve({ data: result, error: null });
        },
      };
      return query;
    },
  };
  return { db: db as unknown as SupabaseClient, queried };
}

describe('organization email Reply-To', () => {
  it('uses the configured customer contact address before admin seats', async () => {
    const { db, queried } = fakeDb({});
    const replyTo = await resolveOrgEmailReplyTo(db, 'org-1', {
      email: 'office@example.com', features: { contact_email: ' help@example.com ' },
    });
    expect(replyTo).toEqual(['help@example.com']);
    expect(queried).toEqual([]);
  });

  it('routes to accepted active admins with message access and deduplicates addresses', async () => {
    const { db } = fakeDb({
      organization_admins: [
        { organization_id: 'org-1', user_id: 'owner', role: 'owner', status: 'active', revoked_at: null, accepted_at: '2026-01-01', permissions: {} },
        { organization_id: 'org-1', user_id: 'admin', role: 'admin', status: 'active', revoked_at: null, accepted_at: '2026-01-01', permissions: {} },
        { organization_id: 'org-1', user_id: 'custom', role: 'custom', status: 'active', revoked_at: null, accepted_at: '2026-01-01', permissions: { 'messages.view': true } },
        { organization_id: 'org-1', user_id: 'accountant', role: 'accountant', status: 'active', revoked_at: null, accepted_at: '2026-01-01', permissions: {} },
        { organization_id: 'org-1', user_id: 'invited', role: 'admin', status: 'active', revoked_at: null, accepted_at: null, permissions: {} },
        { organization_id: 'org-1', user_id: 'suspended', role: 'admin', status: 'suspended', revoked_at: null, accepted_at: '2026-01-01', permissions: {} },
        { organization_id: 'org-2', user_id: 'other', role: 'owner', status: 'active', revoked_at: null, accepted_at: '2026-01-01', permissions: {} },
      ],
      profiles: [
        { id: 'owner', email: 'owner@example.com' },
        { id: 'admin', email: 'admin@example.com' },
        { id: 'custom', email: 'OWNER@example.com' },
        { id: 'accountant', email: 'accountant@example.com' },
        { id: 'invited', email: 'invited@example.com' },
        { id: 'suspended', email: 'suspended@example.com' },
        { id: 'other', email: 'other@example.com' },
      ],
    });
    expect(await resolveOrgEmailReplyTo(db, 'org-1', { email: 'office@example.com', features: {} }))
      .toEqual(['owner@example.com', 'admin@example.com']);
  });

  it('uses the organization mailbox if no eligible admin email exists', async () => {
    const { db } = fakeDb({ organization_admins: [], profiles: [] });
    expect(await resolveOrgEmailReplyTo(db, 'org-1', { email: 'office@example.com', features: { contact_email: 'bad address' } }))
      .toEqual(['office@example.com']);
  });

  it('does not prevent an email send when the reply lookup is unavailable', async () => {
    const db = { from() { throw new Error('database unavailable'); } } as unknown as SupabaseClient;
    expect(await resolveOrgEmailReplyTo(db, 'org-1')).toBeUndefined();
  });
});
