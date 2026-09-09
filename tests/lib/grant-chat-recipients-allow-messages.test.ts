import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const grantMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260907123000_grant_chat_recipients_allow_messages.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

const seatsMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260814105327_org_admin_seats_permissions.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('grant chat_recipients_allow_messages', () => {
  it('follows the same EXECUTE pattern as org_admin_permission_gate', () => {
    expect(seatsMigration).toContain(
      'GRANT EXECUTE ON FUNCTION private.org_admin_permission_gate(text[]) TO authenticated, service_role;',
    );
    expect(grantMigration).toContain(
      'GRANT EXECUTE ON FUNCTION private.chat_recipients_allow_messages(uuid) TO authenticated, service_role;',
    );
    expect(grantMigration).toContain(
      'REVOKE ALL ON FUNCTION private.chat_recipients_allow_messages(uuid) FROM PUBLIC, anon;',
    );
  });

  it('does not expose the seat-permission probe helper to clients', () => {
    expect(grantMigration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION private\.org_admin_user_has_permission/,
    );
    expect(seatsMigration).toContain(
      'REVOKE ALL ON FUNCTION private.org_admin_user_has_permission(uuid, text) FROM PUBLIC;',
    );
    expect(seatsMigration).not.toMatch(
      /GRANT EXECUTE ON FUNCTION private\.org_admin_user_has_permission/,
    );
  });
});
