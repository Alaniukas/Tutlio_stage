import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260814105327_org_admin_seats_permissions.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('organization admin seats migration', () => {
  it('enforces one active owner and permission-gated RLS', () => {
    expect(migration).toContain('organization_admins_one_active_owner_per_org');
    expect(migration).toContain('AS RESTRICTIVE FOR SELECT TO authenticated');
    expect(migration).toContain('private.org_admin_permission_gate');
    expect(migration).toContain('ARRAY[OLD.organization_id, NEW.organization_id]');
  });

  it('keeps removed seats denied until their last JWT expires', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS private.revoked_org_admin_users');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.revoke_org_admin_seat');
    expect(migration).toContain('WHEN EXISTS (');
    expect(migration).toContain('FROM private.revoked_org_admin_users revoked');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.revoke_org_admin_seat(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('CREATE POLICY "Org admin reads own row"');
    expect(migration).toContain('user_id = (SELECT auth.uid())\n    OR private.org_admin_permission_gate');
  });

  it('keeps co-admin lookup non-recursive', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_my_org_admin_user_ids()');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_my_org_visible_tutor_ids()');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_my_org_visible_tutor_ids() FROM PUBLIC, anon');
    expect(migration).toContain('SET row_security = off');
  });

  it('filters message contacts and conversation creation by message permissions', () => {
    expect(migration).toContain('AND oa.accepted_at IS NOT NULL');
    expect(migration).toContain('AND teammate.accepted_at IS NOT NULL');
    expect(migration).toContain("private.org_admin_user_has_permission(admin.user_id, 'messages.view')");
    expect(migration).toContain("private.org_admin_user_has_permission(v_my_id, 'messages.edit')");
    expect(migration).toContain('private.chat_recipients_allow_messages(conversation_id)');
    expect(migration).toContain("private.org_admin_user_has_permission(p_other_user_id, 'messages.view')");
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_or_create_conversation');
  });

  it('denies inactive seats across every storage bucket', () => {
    expect(migration).toContain('CREATE POLICY org_admin_active_seat_select ON storage.objects');
    expect(migration).toContain('CREATE POLICY org_admin_active_seat_insert ON storage.objects');
    expect(migration).toContain('CREATE POLICY org_admin_active_seat_update ON storage.objects');
    expect(migration).toContain('CREATE POLICY org_admin_active_seat_delete ON storage.objects');
  });

  it('permission-gates private files by their organization module', () => {
    expect(migration).toContain('CREATE POLICY org_admin_permission_domain_files_select ON storage.objects');
    expect(migration).toContain("WHEN 'invoices' THEN private.org_admin_permission_gate(ARRAY['finance.view','finance.edit'])");
    expect(migration).toContain("WHEN 'session-files' THEN private.org_admin_permission_gate(ARRAY['sessions.view','sessions.edit'])");
    expect(migration).toContain("WHEN 'whiteboard-data' THEN private.org_admin_permission_gate(ARRAY['sessions.edit'])");
    expect(migration).toContain("WHEN 'public-pages' THEN private.org_admin_permission_gate(ARRAY['settings.edit'])");
  });
});
