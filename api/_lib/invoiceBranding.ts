import type { SupabaseClient } from '@supabase/supabase-js';
import { rgb, type RGB } from 'pdf-lib';
import type { InvoicePdfBranding } from './invoicePdf.js';
import { isMoksloVaisiaiOrg, isProKlaseOrg } from './marketMoney.js';

function parseHexColor(hex: string | null | undefined, fallback: string): RGB {
  const raw = (hex || fallback).trim().replace('#', '');
  let r = 79, g = 70, b = 229;
  if (raw.length === 3) {
    r = parseInt(raw[0] + raw[0], 16);
    g = parseInt(raw[1] + raw[1], 16);
    b = parseInt(raw[2] + raw[2], 16);
  } else if (raw.length >= 6) {
    r = parseInt(raw.slice(0, 2), 16);
    g = parseInt(raw.slice(2, 4), 16);
    b = parseInt(raw.slice(4, 6), 16);
  }
  return rgb(r / 255, g / 255, b / 255);
}

function detectImageMime(bytes: Uint8Array): 'png' | 'jpeg' {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  if (bytes.length >= 2 && bytes[0] === 0x89 && bytes[1] === 0x50) return 'png';
  return 'png';
}

async function fetchLogoBytes(url: string): Promise<{ bytes: Uint8Array; mime: 'png' | 'jpeg' } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { bytes, mime: detectImageMime(bytes) };
  } catch {
    return null;
  }
}

/** Org white-label branding for invoice PDF (logo + brand colors). */
export async function resolveInvoiceBranding(
  supabase: SupabaseClient,
  organizationId: string | null | undefined,
): Promise<InvoicePdfBranding | null> {
  if (!organizationId) return null;

  const { data: org } = await supabase
    .from('organizations')
    .select('name, logo_url, brand_color, brand_color_secondary, features')
    .eq('id', organizationId)
    .maybeSingle();

  if (!org) return null;
  const features = (org.features as Record<string, unknown> | null) ?? {};
  if (features.custom_branding !== true && !isProKlaseOrg(organizationId) && !isMoksloVaisiaiOrg(organizationId)) {
    return null;
  }

  const primaryColor = parseHexColor(org.brand_color as string, '#4f46e5');
  const secondaryColor = parseHexColor(
    (org.brand_color_secondary as string) || (org.brand_color as string),
    '#8b5cf6',
  );

  let logo: InvoicePdfBranding['logo'] = undefined;
  const logoUrl = typeof org.logo_url === 'string' ? org.logo_url.trim() : '';
  if (logoUrl) {
    const fetched = await fetchLogoBytes(logoUrl);
    if (fetched) logo = { bytes: fetched.bytes, mime: fetched.mime };
  }

  return {
    brandName: typeof org.name === 'string' ? org.name : undefined,
    primaryColor,
    secondaryColor,
    logo,
  };
}
