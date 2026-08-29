import { describe, expect, it, vi } from 'vitest';
import { getOrgAdminDashboardPath } from '@/lib/orgAdminDashboardPath';

function fakeClient(opts: {
  seat?: Record<string, unknown> | null;
  entityType?: string;
  seatError?: { code?: string; message: string } | null;
}) {
  const selects: string[] = [];
  return {
    selects,
    from(table: string) {
      return {
        select(columns: string) {
          selects.push(`${table}:${columns}`);
          return {
            eq() {
              return this;
            },
            async maybeSingle() {
              if (table === 'organization_admins') {
                return { data: opts.seat ?? null, error: opts.seatError ?? null };
              }
              return { data: { entity_type: opts.entityType || 'company' }, error: null };
            },
          };
        },
      };
    },
  };
}

describe('getOrgAdminDashboardPath', () => {
  it('does not embed organizations() on the admin seat lookup', async () => {
    const sb = fakeClient({
      seat: { role: 'owner', permissions: {}, status: 'active', organization_id: 'org-1' },
      entityType: 'school',
    });
    const path = await getOrgAdminDashboardPath(sb as any, 'user-1');
    expect(path).toBe('/school');
    expect(sb.selects.some((s) => s.includes('organizations('))).toBe(false);
    expect(sb.selects).toContain('organizations:entity_type');
  });

  it('falls back to /company if the lookup hangs', async () => {
    vi.useFakeTimers();
    const sb = {
      from() {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              maybeSingle() {
                return new Promise(() => {});
              },
            };
          },
        };
      },
    };
    const pending = getOrgAdminDashboardPath(sb as any, 'user-1');
    await vi.advanceTimersByTimeAsync(8000);
    await expect(pending).resolves.toBe('/company');
    vi.useRealTimers();
  });
});
