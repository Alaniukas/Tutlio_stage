import { describe, expect, it } from 'vitest';
import {
  ORG_ADMIN_PERMISSION_KEYS,
  canSeePeerOrgOwners,
  hasOrgAdminPermission,
  normalizeOrgAdminPermissions,
  permissionsForRole,
  sanitizeDelegatedPermissions,
  permissionGroupsForTeamManager,
} from '../../src/lib/orgAdminPermissions';

describe('organization admin permissions', () => {
  it('gives the administrator preset every module permission except finance totals and team management', () => {
    const permissions = permissionsForRole('admin');
    expect(permissions['finance.totals']).toBeUndefined();
    expect(permissions['team.view']).toBeUndefined();
    expect(permissions['team.edit']).toBeUndefined();
    expect(
      ORG_ADMIN_PERMISSION_KEYS
        .filter((key) => key !== 'finance.totals' && key !== 'team.view' && key !== 'team.edit')
        .every((key) => permissions[key] === true),
    ).toBe(true);
  });

  it('limits the accountant preset to finance permissions including totals', () => {
    const permissions = permissionsForRole('accountant');
    expect(permissions).toEqual({
      'finance.view': true,
      'finance.totals': true,
      'finance.edit': true,
    });
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
    expect(hasOrgAdminPermission('owner', {}, 'finance.totals')).toBe(true);
    expect(hasOrgAdminPermission('custom', { 'students.view': true }, 'students.view')).toBe(true);
    expect(hasOrgAdminPermission('custom', { 'students.view': true }, 'students.edit')).toBe(false);
    expect(hasOrgAdminPermission('custom', { 'finance.view': true }, 'finance.totals')).toBe(false);
  });

  it('applies the administrator preset when the stored permissions JSON is empty', () => {
    expect(hasOrgAdminPermission('admin', {}, 'dashboard.view')).toBe(true);
    expect(hasOrgAdminPermission('admin', {}, 'finance.view')).toBe(true);
    expect(hasOrgAdminPermission('admin', {}, 'finance.totals')).toBe(false);
    expect(hasOrgAdminPermission('admin', {}, 'team.view')).toBe(false);
  });

  it('lets an owner hide revenue totals while keeping every other super-admin permission', () => {
    expect(hasOrgAdminPermission('owner', { 'finance.totals': false }, 'sessions.view')).toBe(true);
    expect(hasOrgAdminPermission('owner', { 'finance.totals': false }, 'stats.view')).toBe(true);
    expect(hasOrgAdminPermission('owner', { 'finance.totals': false }, 'team.edit')).toBe(true);
    expect(hasOrgAdminPermission('owner', { 'finance.totals': false }, 'finance.totals')).toBe(false);
    expect(hasOrgAdminPermission('owner', {}, 'finance.totals')).toBe(true);
  });

  it('hides peer owners from operator-owners who do not see finance totals', () => {
    expect(canSeePeerOrgOwners('owner', {})).toBe(true);
    expect(canSeePeerOrgOwners('owner', { 'finance.totals': false })).toBe(false);
    expect(canSeePeerOrgOwners('custom', { 'team.view': true })).toBe(false);
  });

  it('hides statistics from non-owner permission pickers and strips restricted grants', () => {
    expect(permissionGroupsForTeamManager(false).some((group) => group.id === 'stats')).toBe(false);
    expect(permissionGroupsForTeamManager(true).some((group) => group.id === 'stats')).toBe(true);
    expect(sanitizeDelegatedPermissions('custom', { 'students.view': true }, {
      'students.view': true,
      'stats.view': true,
      'finance.totals': true,
      'team.edit': true,
    })).toEqual({ 'students.view': true });
  });
});
