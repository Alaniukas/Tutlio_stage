import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const state = vi.hoisted(() => ({ db: null as unknown, userId: 'parent-user' as string | null }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => state.db }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => state.userId ? { userId: state.userId } : null }));
import handler, { loadNotificationSettings } from '../../api/notification-preferences';
import { filterUserNotificationRecipients, notificationUserIdsForEmail, shouldSkipUserNotification } from '../../api/_lib/userNotificationPreferences';
import { shouldSkipParentNotification } from '../../api/_lib/parentNotificationPreferences';

function database(tables: Record<string, Record<string, any>[]>, failureTable?: string): SupabaseClient {
  return { from(table: string) {
    let rows = tables[table] || [];
    const query: any = {
      select: () => query,
      eq: (key: string, value: unknown) => { rows = rows.filter(row => row[key] === value); return query; },
      in: (key: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[key])); return query; },
      ilike: (key: string, pattern: string) => {
        const exact = pattern.replace(/\\([\\%_])/g, '$1');
        rows = rows.filter(row => String(row[key] || '').toLowerCase() === exact.toLowerCase()); return query;
      },
      is: (key: string) => { rows = rows.filter(row => row[key] == null); return query; },
      not: (key: string) => { rows = rows.filter(row => row[key] != null); return query; },
      limit: (n: number) => { rows = rows.slice(0, n); return query; },
      maybeSingle: async () => ({ data: rows[0] || null, error: table === failureTable ? new Error('Unavailable') : null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows,
        error: table === failureTable ? new Error('Unavailable') : null }).then(resolve),
    };
    return query;
  } } as unknown as SupabaseClient;
}
beforeEach(() => { state.userId = 'parent-user'; });

describe('notification delivery preferences', () => {
  it('resolves a managed contact address to its linked identity and filters each recipient independently', async () => {
    const db = database({
      profiles: [{ id: 'child-user', email: 'st-abc@accounts.test' }],
      students: [{ email: 'child@example.test', linked_user_id: 'child-user' }],
      parent_profiles: [{ user_id: 'parent-user', email: 'parent@example.test' }],
      user_notification_preferences: [{ user_id: 'child-user', category: 'lesson_feedback', enabled: false }],
    });
    expect(await notificationUserIdsForEmail(db, ' Child@Example.test ')).toContain('child-user');
    expect(await filterUserNotificationRecipients(db, ['child@example.test', 'parent@example.test'], 'session_comment_added'))
      .toEqual(['parent@example.test']);
    expect(await filterUserNotificationRecipients(db, 'child@example.test', 'booking_confirmation')).toEqual(['child@example.test']);
  });
  it('uses the parent contact link when the parent login is an alias', async () => {
    const db = database({
      students: [{ payer_email: 'payer@example.test', parent_user_id: 'parent-user' }],
      user_notification_preferences: [{ user_id: 'parent-user', category: 'payment_reminders', enabled: false }],
    });
    expect(await filterUserNotificationRecipients(db, 'payer@example.test', 'payment_reminder')).toEqual([]);
  });
  it('enforces the same choice for direct chat push without relying on an email', async () => {
    const db = database({ user_notification_preferences: [{ user_id: 'parent-user', category: 'messages', enabled: false }] });
    expect(await shouldSkipUserNotification(db, 'parent-user', 'chat_new_message')).toBe(true);
    expect(await shouldSkipUserNotification(db, 'another-user', 'chat_new_message')).toBe(false);
  });
  it('retries optional delivery on preference lookup failures and bypasses preferences for mandatory mail', async () => {
    const db = database({}, 'profiles');
    await expect(filterUserNotificationRecipients(db, 'any@example.test', 'chat_new_message')).rejects.toThrow('Unavailable');
    expect(await filterUserNotificationRecipients(db, 'any@example.test', 'school_monthly_invoice')).toEqual(['any@example.test']);
  });
  it('allows a parent to split the old lesson update category while retaining organization restrictions', async () => {
    const db = database({
      organizations: [{ id: 'org', features: {} }],
      parent_profiles: [{ id: 'parent', user_id: 'parent-user', email: 'parent@example.test', email_notification_opt_out: ['lesson_updates'] }],
      user_notification_preferences: [{ user_id: 'parent-user', category: 'lesson_feedback', enabled: true }],
    });
    expect(await shouldSkipParentNotification(db, 'parent@example.test', 'session_comment_added', { organizationId: 'org' })).toBe(false);
    expect(await shouldSkipParentNotification(db, 'parent@example.test', 'booking_confirmation', { forPayer: true })).toBe(true);
    const blocked = database({
      organizations: [{ id: 'org', features: { parent_email_opt_out: ['lesson_updates'] } }],
      parent_profiles: [{ id: 'parent', user_id: 'parent-user', email: 'parent@example.test' }],
      user_notification_preferences: [{ user_id: 'parent-user', category: 'lesson_feedback', enabled: true }],
    });
    expect(await shouldSkipParentNotification(blocked, 'parent@example.test', 'session_comment_added', { organizationId: 'org' })).toBe(true);
  });
});

describe('role-specific notification settings endpoint', () => {
  it('loads all of a parent’s children, including direct links and solo tutors in a mixed family', async () => {
    const db = database({
      parent_profiles: [{ id: 'parent', user_id: 'parent-user', email_notification_opt_out: ['lesson_updates'] }],
      parent_students: [{ parent_id: 'parent', student_id: 'school-child' }],
      students: [{ id: 'school-child', organization_id: 'school', tutor_id: null, payment_payer: 'parent' },
        { id: 'solo-child', parent_user_id: 'parent-user', organization_id: null, tutor_id: 'solo-tutor' }],
      profiles: [{ id: 'solo-tutor', organization_id: null }],
      organizations: [{ id: 'school', entity_type: 'school', features: { school_family_portal: true } }],
      user_notification_preferences: [{ user_id: 'parent-user', category: 'lesson_feedback', enabled: true }],
    });
    const choices = await loadNotificationSettings(db, 'parent-user', 'parent');
    expect(choices).toContainEqual({ key: 'school_materials', enabled: false });
    expect(choices).toContainEqual({ key: 'lesson_feedback', enabled: true });
    expect(choices).not.toContainEqual({ key: 'waitlist', enabled: true });
    expect(choices).not.toContainEqual({ key: 'availability_changes', enabled: true });
  });
  it('rejects another portal and does not infer tutor access from an admin display profile', async () => {
    const db = database({ profiles: [{ id: 'admin-user' }], organization_admins: [{ user_id: 'admin-user' }] });
    expect(await loadNotificationSettings(db, 'admin-user', 'student')).toBeNull();
    expect(await loadNotificationSettings(db, 'admin-user', 'parent')).toBeNull();
    expect(await loadNotificationSettings(db, 'admin-user', 'tutor')).toBeNull();
  });
  it('offers contract alerts only to the configured signing contact and respects accepted administrator permissions', async () => {
    const tables = {
      profiles: [{ id: 'director', email: 'director@example.test' }, { id: 'viewer', email: 'viewer@example.test' }],
      organization_admins: ['director', 'viewer'].map(user_id => ({ user_id, organization_id: 'school',
        role: 'owner', status: 'active', accepted_at: '2026-09-01', permissions: {} })),
      organizations: [{ id: 'school', entity_type: 'school', email: 'school@example.test',
        features: { school_contract_signing_email: 'director@example.test' } }],
    };
    expect(await loadNotificationSettings(database(tables), 'director', 'org_admin'))
      .toContainEqual({ key: 'contract_updates', enabled: true });
    expect(await loadNotificationSettings(database(tables), 'viewer', 'org_admin'))
      .not.toContainEqual({ key: 'contract_updates', enabled: true });
  });
  it('keeps settings private and uses the authenticated user rather than a supplied user ID', async () => {
    state.db = database({ parent_profiles: [{ id: 'parent', user_id: 'parent-user' }],
      user_notification_preferences: [{ user_id: 'other-user', category: 'messages', enabled: false }] });
    const response: any = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    await handler({ method: 'GET', query: { portal: 'parent', userId: 'other-user' }, headers: {} } as any, response);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ choices: expect.arrayContaining([{ key: 'messages', enabled: true }]) }));
    state.userId = null;
    await handler({ method: 'GET', query: { portal: 'parent' }, headers: {} } as any, response);
    expect(response.status).toHaveBeenLastCalledWith(401);
  });
});
