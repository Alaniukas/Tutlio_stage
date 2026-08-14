import { describe, expect, it } from 'vitest';
import {
  ORG_ADMIN_PERMISSION_KEYS,
  hasOrgAdminPermission,
  normalizeOrgAdminPermissions,
  permissionsForRole,
} from '../../src/lib/orgAdminPermissions';

describe('organization admin permissions', () => {
  it('gives the administrator preset every module permission', () => {
    const permissions = permissionsForRole('admin');
    expect(ORG_ADMIN_PERMISSION_KEYS.every((key) => permissions[key] === true)).toBe(true);
  });

  it('limits the accountant preset to finance view and edit', () => {
    const permissions = permissionsForRole('accountant');
    expect(permissions).toEqual({ 'finance.view': true, 'finance.edit': true });
    expect(hasOrgAdminPermission('accountant', permissions, 'students.view')).toBe(false);
  });

  it('makes edit imply view and discards unknown permission keys', () => {
    expect(normalizeOrgAdminPermissions({
      'messages.edit': true,
      'not-a-real-permission': true,
    })).toEqual({ 'messages.view': true, 'messages.edit': true });
  });

  it('always grants the owner while respecting custom permissions', () => {
    expect(hasOrgAdminPermission('owner', {}, 'settings.edit')).toBe(true);
    expect(hasOrgAdminPermission('custom', { 'students.view': true }, 'students.view')).toBe(true);
    expect(hasOrgAdminPermission('custom', { 'students.view': true }, 'students.edit')).toBe(false);
  });
});
