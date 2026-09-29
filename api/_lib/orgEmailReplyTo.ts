import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { hasOrgAdminPermission } from '../../src/lib/orgAdminPermissions.js';
import { supabaseServiceRoleClientOptions } from './supabaseServiceRoleClientOptions.js';

type OrgEmailRow = { email?: string | null; features?: unknown };

function emailAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const address = value.trim();
  return /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(address) ? address : null;
}

/**
 * Route customer replies to the organization's configured contact mailbox.
 * Without one, use active admin seats that can view messages, then the org's
 * registered mailbox. Never use a caller-provided email address for Reply-To.
 */
export async function resolveOrgEmailReplyTo(
  db: SupabaseClient,
  organizationId: string | null | undefined,
  knownOrg?: OrgEmailRow | null,
): Promise<string[] | undefined> {
  if (!organizationId) return undefined;
  try {
    return await resolveOrgEmailReplyToUnchecked(db, organizationId, knownOrg);
  } catch (error) {
    console.error('[orgEmailReplyTo] Reply address lookup failed:', error);
    return undefined;
  }
}

async function resolveOrgEmailReplyToUnchecked(
  db: SupabaseClient,
  organizationId: string,
  knownOrg?: OrgEmailRow | null,
): Promise<string[] | undefined> {
  let org = knownOrg;
  const knownFeatures = org?.features && typeof org.features === 'object' && !Array.isArray(org.features)
    ? org.features as Record<string, unknown> : {};
  const knownContact = emailAddress(knownFeatures.contact_email);
  if (knownContact) return [knownContact];

  if (!org || org.email === undefined) {
    const result = await db.from('organizations').select('email, features')
      .eq('id', organizationId).maybeSingle();
    if (result.error || !result.data) {
      console.error('[orgEmailReplyTo] Organization lookup failed:', result.error?.message || organizationId);
      return undefined;
    }
    org = result.data;
  }
  // A real organization row always has an email. An incomplete mocked or
  // legacy result cannot establish a trustworthy fallback or admin context.
  if (org.email === undefined) return undefined;

  const features = org.features && typeof org.features === 'object' && !Array.isArray(org.features)
    ? org.features as Record<string, unknown> : {};
  const contact = emailAddress(features.contact_email);
  if (contact) return [contact];

  const seats = await db.from('organization_admins')
    .select('user_id, role, permissions')
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .is('revoked_at', null)
    .not('accepted_at', 'is', null);
  if (seats.error) {
    console.error('[orgEmailReplyTo] Admin lookup failed:', seats.error.message);
  } else {
    const userIds = [...new Set((seats.data || [])
      .filter((seat) => hasOrgAdminPermission(seat.role, seat.permissions || {}, 'messages.view'))
      .map((seat) => seat.user_id)
      .filter((id): id is string => typeof id === 'string' && !!id))];
    if (userIds.length) {
      const profiles = await db.from('profiles').select('id, email').in('id', userIds);
      if (profiles.error) {
        console.error('[orgEmailReplyTo] Admin email lookup failed:', profiles.error.message);
      } else {
        const addresses: string[] = [];
        const seen = new Set<string>();
        for (const profile of profiles.data || []) {
          const address = emailAddress(profile.email);
          if (!address || seen.has(address.toLowerCase())) continue;
          seen.add(address.toLowerCase());
          addresses.push(address);
        }
        if (addresses.length) return addresses;
      }
    }
  }

  const fallback = emailAddress(org.email);
  return fallback ? [fallback] : undefined;
}

export async function resolveOrgEmailReplyToWithServiceClient(
  organizationId: string | null | undefined,
  knownOrg?: OrgEmailRow | null,
): Promise<string[] | undefined> {
  if (!organizationId) return undefined;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return undefined;
  try {
    const db = createClient(url, key, supabaseServiceRoleClientOptions());
    return await resolveOrgEmailReplyTo(db, organizationId, knownOrg);
  } catch (error) {
    console.error('[orgEmailReplyTo] Service client unavailable:', error);
    return undefined;
  }
}
